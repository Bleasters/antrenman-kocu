import type { RehabDB } from '../db/db';
import { SCHEMA_VERSION, SETTINGS_ID } from '../db/db';
import type { BaseRecord, Media, Settings } from '../db/types';
import { toISODate } from '../logic/dates';
import { migrateBackup, BackupVersionError } from './migrations';
import { BACKUP_APP_ID, backupFileSchema, type BackupData, type BackupFile } from './schema';

export const PRE_REPLACE_SNAPSHOT_KEY = 'preReplaceSnapshot';
export const PRE_REPLACE_MEDIA_KEY = 'preReplaceMedia';

export async function buildBackup(database: RehabDB, now = Date.now()): Promise<BackupFile> {
  const [exercises, sessions, rom, settings] = await Promise.all([
    database.exercises.toArray(),
    database.sessions.toArray(),
    database.rom.toArray(),
    database.settings.get(SETTINGS_ID),
  ]);
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    kind: 'data',
    data: { exercises, sessions, rom, settings: settings ?? null } as BackupData,
  };
}

export function backupFileName(now = Date.now(), ext: 'json' | 'zip' = 'json'): string {
  return `rehab-yedek-${toISODate(now)}.${ext}`;
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 1);
}

export interface BackupSummary {
  sessions: number;
  rom: number;
  exercises: number;
  media: number;
  exportedAt: number;
  schemaVersion: number;
}

export type ParseResult = { ok: true; file: BackupFile; summary: BackupSummary } | { ok: false; error: string };

export function summarize(file: BackupFile): BackupSummary {
  return {
    sessions: file.data.sessions.length,
    rom: file.data.rom.length,
    exercises: file.data.exercises.length,
    media: file.data.media?.length ?? 0,
    exportedAt: file.exportedAt,
    schemaVersion: file.schemaVersion,
  };
}

/** Parses, migrates and validates a backup file's text. Never throws. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dosya okunamadı: geçerli bir JSON değil.' };
  }
  if (!raw || typeof raw !== 'object' || (raw as { app?: unknown }).app !== BACKUP_APP_ID) {
    return { ok: false, error: 'Bu dosya bir RehabFlow yedeği değil.' };
  }
  let migrated: Record<string, unknown>;
  try {
    migrated = migrateBackup(raw as Record<string, unknown>);
  } catch (e) {
    return { ok: false, error: e instanceof BackupVersionError ? e.message : 'Yedek sürümü dönüştürülemedi.' };
  }
  const parsed = backupFileSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') || 'kök';
    return { ok: false, error: `Yedek dosyası doğrulanamadı (${where}: ${first?.message ?? 'geçersiz'}).` };
  }
  return { ok: true, file: parsed.data, summary: summarize(parsed.data) };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportStats {
  added: number;
  updated: number;
  skipped: number;
}

async function mergeTable<T extends BaseRecord>(
  table: { bulkGet(keys: string[]): Promise<(T | undefined)[]>; bulkPut(items: T[]): Promise<unknown> },
  incoming: T[],
  stats: ImportStats,
): Promise<void> {
  if (incoming.length === 0) return;
  const existing = await table.bulkGet(incoming.map((r) => r.id));
  const toPut: T[] = [];
  incoming.forEach((rec, i) => {
    const cur = existing[i];
    if (!cur) {
      stats.added++;
      toPut.push(rec);
    } else if (rec.updatedAt > cur.updatedAt) {
      stats.updated++;
      toPut.push(rec);
    } else {
      stats.skipped++;
    }
  });
  if (toPut.length) await table.bulkPut(toPut);
}

/**
 * merge:   records are matched by id; the one with the newer updatedAt wins.
 * replace: the current data is first snapshotted into the meta table (restorable from
 *          Settings), then exercises/sessions/ROM/settings are wiped and replaced.
 *          Media is replaced only when the backup carries media (full ZIP backup);
 *          a data-only backup leaves photos/X-rays untouched.
 * `media` holds the full Media records (with blobs) extracted from a ZIP backup.
 */
export async function importBackup(
  database: RehabDB,
  file: BackupFile,
  mode: ImportMode,
  now = Date.now(),
  media: Media[] = [],
): Promise<ImportStats> {
  const stats: ImportStats = { added: 0, updated: 0, skipped: 0 };
  const { exercises, sessions, rom, settings } = file.data;
  const replacesMedia = file.data.media !== undefined;
  const tables = [database.exercises, database.sessions, database.rom, database.settings, database.media, database.meta];
  if (mode === 'replace') {
    const snapshot = await buildBackup(database, now);
    const oldMedia = replacesMedia ? await database.media.toArray() : null;
    await database.transaction('rw', tables, async () => {
      await database.meta.put({ key: PRE_REPLACE_SNAPSHOT_KEY, value: snapshot });
      if (oldMedia) await database.meta.put({ key: PRE_REPLACE_MEDIA_KEY, value: oldMedia });
      else await database.meta.delete(PRE_REPLACE_MEDIA_KEY);
      await Promise.all([database.exercises.clear(), database.sessions.clear(), database.rom.clear(), database.settings.clear()]);
      if (replacesMedia) await database.media.clear();
      await database.exercises.bulkAdd(exercises);
      await database.sessions.bulkAdd(sessions);
      await database.rom.bulkAdd(rom);
      if (replacesMedia) await database.media.bulkAdd(media);
      if (settings) await database.settings.add({ ...settings, id: SETTINGS_ID, schemaVersion: SCHEMA_VERSION } as Settings);
      stats.added = exercises.length + sessions.length + rom.length + (replacesMedia ? media.length : 0) + (settings ? 1 : 0);
    });
    return stats;
  }
  await database.transaction('rw', tables, async () => {
    await mergeTable(database.exercises, exercises, stats);
    await mergeTable(database.sessions, sessions, stats);
    await mergeTable(database.rom, rom, stats);
    await mergeTable(database.media, media, stats);
    if (settings) {
      await mergeTable(database.settings, [{ ...settings, id: SETTINGS_ID, schemaVersion: SCHEMA_VERSION } as Settings], stats);
    }
  });
  return stats;
}

export interface Snapshot {
  file: BackupFile;
  /** Present when the replace also wiped media. */
  media: Media[] | null;
}

export async function getPreReplaceSnapshot(database: RehabDB): Promise<Snapshot | null> {
  const [rec, med] = await Promise.all([database.meta.get(PRE_REPLACE_SNAPSHOT_KEY), database.meta.get(PRE_REPLACE_MEDIA_KEY)]);
  const file = rec?.value as BackupFile | undefined;
  if (!file) return null;
  return { file, media: (med?.value as Media[] | undefined) ?? null };
}

export async function markBackedUp(database: RehabDB, now = Date.now()): Promise<void> {
  await database.settings.update(SETTINGS_ID, { lastBackupAt: now, updatedAt: now });
}
