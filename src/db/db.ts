import Dexie, { type Table } from 'dexie';
import type { Exercise, Media, MetaRecord, RomMeasurement, Session, Settings } from './types';

/** Data schema version used both for Dexie and for backup files. */
export const SCHEMA_VERSION = 1;
export const SETTINGS_ID = 'settings';

export class RehabDB extends Dexie {
  exercises!: Table<Exercise, string>;
  sessions!: Table<Session, string>;
  rom!: Table<RomMeasurement, string>;
  media!: Table<Media, string>;
  settings!: Table<Settings, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = 'rehabflow') {
    super(name);
    this.version(1).stores({
      exercises: 'id, region, order, active, updatedAt',
      sessions: 'id, date, startedAt, endedAt, updatedAt',
      rom: 'id, date, region, movement, updatedAt',
      media: 'id, date, region, kind, updatedAt',
      settings: 'id',
      meta: 'key',
    });
    // Future: this.version(2).stores({...}).upgrade(tx => ...)
  }
}

export const db = new RehabDB();
