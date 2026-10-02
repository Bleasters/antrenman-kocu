import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { RehabDB, SCHEMA_VERSION, SETTINGS_ID } from '../src/db/db';
import { ensureSeeded } from '../src/db/seed';
import type { RomMeasurement, Session } from '../src/db/types';
import {
  backupFileName,
  buildBackup,
  getPreReplaceSnapshot,
  importBackup,
  markBackedUp,
  parseBackup,
  serializeBackup,
} from '../src/backup/backup';
import { BackupVersionError, migrateBackup } from '../src/backup/migrations';

const dbs: RehabDB[] = [];
let dbCounter = 0;
function freshDb(): RehabDB {
  const d = new RehabDB(`test-${++dbCounter}-${Math.random()}`);
  dbs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close();
    await d.delete();
  }
});

function session(id: string, updatedAt: number, p: Partial<Session> = {}): Session {
  return {
    id,
    createdAt: 1,
    updatedAt,
    date: '2026-09-30',
    startedAt: 1000,
    endedAt: 2000,
    regions: ['ankle', 'knee'],
    painBefore: { ankle: 2, knee: 1 },
    painAfter: { ankle: 3, knee: 1 },
    painNextMorning: { ankle: 2 },
    entries: [
      {
        exerciseId: 'x',
        region: 'ankle',
        name: 'Bantlı dorsifleksiyon',
        kind: 'reps',
        sets: [{ reps: 12, loadKg: 0, done: true }, { reps: 10, done: false }],
        painDuring: 4,
      },
    ],
    notes: 'Notlar — Türkçe karakterler: ğüşiöç',
    redFlags: ['night_pain'],
    ...p,
  };
}

const rom: RomMeasurement = {
  id: 'r1',
  createdAt: 1,
  updatedAt: 1,
  date: '2026-09-30',
  region: 'ankle',
  side: 'right',
  movement: 'ankle_dorsiflexion',
  angleDeg: 12.5,
  method: 'manual',
};

async function populate(d: RehabDB) {
  await ensureSeeded(d, 1000);
  await d.sessions.bulkPut([session('a', 10), session('b', 10, { endedAt: undefined, painNextMorning: undefined })]);
  await d.rom.put(rom);
}

async function dump(d: RehabDB) {
  return {
    exercises: (await d.exercises.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    sessions: (await d.sessions.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    rom: await d.rom.toArray(),
    settings: await d.settings.get(SETTINGS_ID),
  };
}

describe('seed', () => {
  it('seeds settings and sample exercises once', async () => {
    const d = freshDb();
    expect(await ensureSeeded(d)).toBe(true);
    expect(await ensureSeeded(d)).toBe(false);
    const ex = await d.exercises.toArray();
    expect(ex.length).toBeGreaterThanOrEqual(6);
    for (const r of ['wrist', 'ankle', 'knee'] as const) {
      const n = ex.filter((e) => e.region === r).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
    expect(ex.every((e) => e.isSample)).toBe(true);
    const s = await d.settings.get(SETTINGS_ID);
    expect(s).toMatchObject({ painIncreaseThreshold: 2, painMaxDuring: 5, nextMorningMustReturn: true, backupReminderDays: 7 });
    expect(s?.defaultSides).toEqual({ wrist: 'left', ankle: 'right', knee: 'left' });
  });
});

describe('export → import round trip', () => {
  it('restores identical data into an empty database', async () => {
    const src = freshDb();
    await populate(src);
    const text = serializeBackup(await buildBackup(src, 5000));

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary).toMatchObject({ sessions: 2, rom: 1, exercises: 9, media: 0, schemaVersion: SCHEMA_VERSION });

    const dst = freshDb();
    await importBackup(dst, parsed.file, 'replace');
    expect(await dump(dst)).toEqual(await dump(src));
  });

  it('merge into an empty database is equivalent too', async () => {
    const src = freshDb();
    await populate(src);
    const parsed = parseBackup(serializeBackup(await buildBackup(src)));
    if (!parsed.ok) throw new Error(parsed.error);
    const dst = freshDb();
    const stats = await importBackup(dst, parsed.file, 'merge');
    expect(stats).toEqual({ added: 13, updated: 0, skipped: 0 });
    expect(await dump(dst)).toEqual(await dump(src));
  });

  it('names the file with the local date', () => {
    expect(backupFileName(Date.parse('2026-10-02T22:00:00Z'))).toBe('rehab-yedek-2026-10-03.json');
  });
});

describe('merge mode', () => {
  it('newer updatedAt wins, older and equal are skipped, unknown ids are added', async () => {
    const d = freshDb();
    await d.sessions.bulkPut([
      session('keep-local', 50, { notes: 'local' }),
      session('take-remote', 10, { notes: 'local' }),
      session('equal', 20, { notes: 'local' }),
    ]);
    const src = freshDb();
    await src.sessions.bulkPut([
      session('keep-local', 40, { notes: 'remote' }),
      session('take-remote', 11, { notes: 'remote' }),
      session('equal', 20, { notes: 'remote' }),
      session('new', 1, { notes: 'remote' }),
    ]);
    const parsed = parseBackup(serializeBackup(await buildBackup(src)));
    if (!parsed.ok) throw new Error(parsed.error);
    const stats = await importBackup(d, parsed.file, 'merge');
    expect(stats).toEqual({ added: 1, updated: 1, skipped: 2 });
    const notes = Object.fromEntries((await d.sessions.toArray()).map((s) => [s.id, s.notes]));
    expect(notes).toEqual({ 'keep-local': 'local', 'take-remote': 'remote', equal: 'local', new: 'remote' });
  });
});

describe('replace mode', () => {
  it('snapshots current data first, then replaces it', async () => {
    const d = freshDb();
    await populate(d);
    const before = await dump(d);

    const other = freshDb();
    await other.sessions.put(session('only', 1));
    const parsed = parseBackup(serializeBackup(await buildBackup(other)));
    if (!parsed.ok) throw new Error(parsed.error);
    await importBackup(d, parsed.file, 'replace');

    expect((await d.sessions.toArray()).map((s) => s.id)).toEqual(['only']);
    expect(await d.exercises.count()).toBe(0);

    const snap = await getPreReplaceSnapshot(d);
    expect(snap?.data.sessions).toHaveLength(2);
    // the snapshot can itself be restored
    const restore = parseBackup(JSON.stringify(snap));
    if (!restore.ok) throw new Error(restore.error);
    await importBackup(d, restore.file, 'replace');
    expect(await dump(d)).toEqual(before);
  });
});

describe('parseBackup validation', () => {
  it('rejects non-JSON', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: expect.stringContaining('JSON') });
  });
  it('rejects files from other apps', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', schemaVersion: 1, data: {} }))).toMatchObject({ ok: false });
  });
  it('rejects newer schema versions', () => {
    const r = parseBackup(JSON.stringify({ app: 'rehab-pwa', schemaVersion: SCHEMA_VERSION + 1, exportedAt: 1, data: {} }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('daha yeni') });
  });
  it('rejects invalid shapes with a path in the message', async () => {
    const d = freshDb();
    await d.sessions.put(session('a', 1));
    const file = await buildBackup(d);
    (file.data.sessions[0].painBefore as Record<string, number>).ankle = 11;
    const r = parseBackup(JSON.stringify(file));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('data.sessions.0.painBefore.ankle') });
  });
});

describe('migrateBackup', () => {
  it('passes through the current version', () => {
    const raw = { app: 'rehab-pwa', schemaVersion: SCHEMA_VERSION, data: {} };
    expect(migrateBackup(raw)).toEqual(raw);
  });
  it('applies migrations step by step', () => {
    const migrations = {
      1: (r: Record<string, unknown>) => ({ ...r, step1: true }),
      2: (r: Record<string, unknown>) => ({ ...r, step2: true }),
    };
    expect(migrateBackup({ schemaVersion: 1 }, 3, migrations)).toEqual({ schemaVersion: 3, step1: true, step2: true });
  });
  it('fails on a missing migration step or invalid version', () => {
    expect(() => migrateBackup({ schemaVersion: 1 }, 2, {})).toThrow(BackupVersionError);
    expect(() => migrateBackup({ schemaVersion: 'x' })).toThrow(BackupVersionError);
  });
});

describe('markBackedUp', () => {
  it('stores lastBackupAt on settings', async () => {
    const d = freshDb();
    await ensureSeeded(d, 1);
    await markBackedUp(d, 12345);
    expect((await d.settings.get(SETTINGS_ID))?.lastBackupAt).toBe(12345);
  });
});
