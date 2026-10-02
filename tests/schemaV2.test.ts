import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBackup, importBackup, parseBackup, serializeBackup } from '../src/backup/backup';
import { RehabDB, SCHEMA_VERSION, SETTINGS_ID } from '../src/db/db';
import { ensureSeeded } from '../src/db/seed';
import { DEFAULT_SYMMETRY_FIELDS, withSettingsDefaults } from '../src/db/settingsDefaults';

const names: string[] = [];
const uniq = () => {
  const n = `v2-${Math.random()}`;
  names.push(n);
  return n;
};
afterEach(async () => {
  for (const n of names.splice(0)) await Dexie.delete(n);
});

/** A settings record exactly as schema v1 stored it. */
const v1Settings = {
  id: 'settings',
  createdAt: 1,
  updatedAt: 2,
  painIncreaseThreshold: 3,
  painMaxDuring: 6,
  nextMorningMustReturn: false,
  backupReminderDays: 10,
  schemaVersion: 1,
  lastBackupAt: 5,
  defaultSides: { wrist: 'right', ankle: 'left', knee: 'left' },
};

const v1Stores = {
  exercises: 'id, region, order, active, updatedAt',
  sessions: 'id, date, startedAt, endedAt, updatedAt',
  rom: 'id, date, region, movement, updatedAt',
  media: 'id, date, region, kind, updatedAt',
  settings: 'id',
  meta: 'key',
};

describe('schema v2', () => {
  it('bumps the schema version', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('upgrades an existing v1 database without losing data', async () => {
    const name = uniq();
    const old = new Dexie(name);
    old.version(1).stores(v1Stores);
    await old.table('settings').put(v1Settings);
    await old.table('rom').put({ id: 'r1', createdAt: 1, updatedAt: 1, date: '2026-09-01', region: 'wrist', side: 'right', movement: 'wrist_flexion', angleDeg: 40, method: 'manual' });
    await old.table('sessions').put({ id: 's1', createdAt: 1, updatedAt: 1, date: '2026-09-01', startedAt: 1, endedAt: 2, regions: ['ankle'], painBefore: { ankle: 2 }, painAfter: { ankle: 3 }, entries: [] });
    old.close();

    const db = new RehabDB(name);
    const s = await db.settings.get(SETTINGS_ID);
    expect(s).toMatchObject({
      painIncreaseThreshold: 3,
      painMaxDuring: 6,
      nextMorningMustReturn: false,
      backupReminderDays: 10,
      lastBackupAt: 5,
      schemaVersion: 2,
      // injured side taken from the old default side for wrist/ankle; knee not tracked
      injuredSides: { wrist: 'right', ankle: 'left', knee: 'none' },
      symmetryTargets: { wrist: 90, ankle: 90, knee: 90 },
      dominantHand: 'right',
    });
    expect(await db.rom.count()).toBe(1);
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });

  it('seeds new installs with the symmetry defaults', async () => {
    const db = new RehabDB(uniq());
    await ensureSeeded(db);
    expect(await db.settings.get(SETTINGS_ID)).toMatchObject(DEFAULT_SYMMETRY_FIELDS);
    db.close();
  });

  it('imports an old v1 backup file without errors, filling defaults', async () => {
    const v1File = {
      app: 'rehab-pwa',
      schemaVersion: 1,
      exportedAt: 1,
      kind: 'data',
      data: { exercises: [], sessions: [], rom: [], settings: v1Settings },
    };
    const parsed = parseBackup(JSON.stringify(v1File));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.schemaVersion).toBe(2);
    expect(parsed.file.data.settings).toMatchObject({ injuredSides: { wrist: 'right', ankle: 'left', knee: 'none' }, dominantHand: 'right' });

    const db = new RehabDB(uniq());
    await importBackup(db, parsed.file, 'replace');
    expect(await db.settings.get(SETTINGS_ID)).toMatchObject({ painMaxDuring: 6, symmetryTargets: { wrist: 90, ankle: 90, knee: 90 } });
    db.close();
  });

  it('imports a v1 backup without settings', () => {
    const parsed = parseBackup(JSON.stringify({ app: 'rehab-pwa', schemaVersion: 1, exportedAt: 1, data: { exercises: [], sessions: [], rom: [], settings: null } }));
    expect(parsed.ok).toBe(true);
  });

  it('round-trips the new fields through export/import', async () => {
    const src = new RehabDB(uniq());
    await ensureSeeded(src);
    await src.settings.update(SETTINGS_ID, { injuredSides: { wrist: 'left', ankle: 'none', knee: 'right' }, symmetryTargets: { wrist: 85, ankle: 95, knee: 100 }, dominantHand: 'left' });
    const parsed = parseBackup(serializeBackup(await buildBackup(src)));
    if (!parsed.ok) throw new Error(parsed.error);
    const dst = new RehabDB(uniq());
    await importBackup(dst, parsed.file, 'replace');
    expect(await dst.settings.get(SETTINGS_ID)).toMatchObject({
      injuredSides: { wrist: 'left', ankle: 'none', knee: 'right' },
      symmetryTargets: { wrist: 85, ankle: 95, knee: 100 },
      dominantHand: 'left',
    });
    src.close();
    dst.close();
  });

  it('rejects invalid symmetry values in a v2 file', async () => {
    const db = new RehabDB(uniq());
    await ensureSeeded(db);
    const file = await buildBackup(db);
    (file.data.settings as unknown as { symmetryTargets: { wrist: number } }).symmetryTargets.wrist = 0;
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: expect.stringContaining('symmetryTargets.wrist') });
    db.close();
  });

  it('withSettingsDefaults keeps valid values and repairs invalid ones', () => {
    const s = withSettingsDefaults({
      injuredSides: { wrist: 'right', ankle: 'bogus', knee: 'left' } as never,
      symmetryTargets: { wrist: 80, ankle: -1, knee: 200 } as never,
      dominantHand: 'up' as never,
    });
    expect(s.injuredSides).toEqual({ wrist: 'right', ankle: 'right', knee: 'left' });
    expect(s.symmetryTargets).toEqual({ wrist: 80, ankle: 90, knee: 90 });
    expect(s.dominantHand).toBe('right');
  });
});
