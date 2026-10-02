import { SCHEMA_VERSION } from '../db/db';

/** A migration upgrades a raw backup payload from version N to N+1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version they migrate FROM. Add an entry here whenever SCHEMA_VERSION is bumped,
 * e.g. `1: (raw) => ({ ...raw, schemaVersion: 2, data: { ...data, newTable: [] } })`.
 */
export const MIGRATIONS: Record<number, Migration> = {};

export class BackupVersionError extends Error {}

export function migrateBackup(
  raw: Record<string, unknown>,
  target = SCHEMA_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): Record<string, unknown> {
  const declared = raw.schemaVersion;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1) {
    throw new BackupVersionError('Yedek dosyasında geçerli bir şema sürümü yok.');
  }
  let v: number = declared;
  if (v > target) {
    throw new BackupVersionError(
      `Bu yedek daha yeni bir uygulama sürümüyle alınmış (şema ${v}). Önce uygulamayı güncelle.`,
    );
  }
  let cur = raw;
  while (v < target) {
    const m = migrations[v];
    if (!m) throw new BackupVersionError(`Şema ${v} → ${v + 1} için dönüşüm bulunamadı.`);
    cur = m(cur);
    v = v + 1;
    cur = { ...cur, schemaVersion: v };
  }
  return cur;
}
