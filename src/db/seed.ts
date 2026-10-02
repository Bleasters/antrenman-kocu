import type { RehabDB } from './db';
import { SCHEMA_VERSION, SETTINGS_ID } from './db';
import { newId } from './ids';
import type { Exercise, Settings } from './types';

export function defaultSettings(now: number): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: now,
    updatedAt: now,
    painIncreaseThreshold: 2,
    painMaxDuring: 5,
    nextMorningMustReturn: true,
    backupReminderDays: 7,
    schemaVersion: SCHEMA_VERSION,
    // Talus fracture: right ankle. Scaphoid: left wrist. Knee: left (not operated).
    defaultSides: { wrist: 'left', ankle: 'right', knee: 'left' },
  };
}

type SampleExercise = Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'active' | 'isSample'>;

export const SAMPLE_EXERCISES: SampleExercise[] = [
  {
    name: 'Bilek fleksiyon-ekstansiyon',
    region: 'wrist',
    side: 'left',
    kind: 'reps',
    defaultSets: 3,
    defaultReps: 10,
    restSec: 30,
    instructions: 'Önkol masada, el kenardan dışarıda. Bileği ağrısız aralıkta yavaşça yukarı-aşağı hareket ettir.',
  },
  {
    name: 'Top sıkma (izometrik kavrama)',
    region: 'wrist',
    side: 'left',
    kind: 'hold',
    defaultSets: 5,
    holdSec: 5,
    restSec: 15,
    instructions: 'Yumuşak bir topu orta şiddette sık, tut, bırak.',
  },
  {
    name: 'Önkol pronasyon-supinasyon',
    region: 'wrist',
    side: 'left',
    kind: 'reps',
    defaultSets: 3,
    defaultReps: 10,
    restSec: 30,
    instructions: 'Dirsek 90°, gövdeye yakın. Avucu yavaşça yukarı ve aşağı çevir.',
  },
  {
    name: 'Ayak bileği alfabesi',
    region: 'ankle',
    side: 'right',
    kind: 'timed',
    defaultSets: 2,
    durationSec: 60,
    restSec: 30,
    instructions: 'Otururken ayak başparmağıyla havada harfleri çiz.',
  },
  {
    name: 'Havlu ile baldır germe',
    region: 'ankle',
    side: 'right',
    kind: 'hold',
    defaultSets: 3,
    holdSec: 30,
    restSec: 15,
    instructions: 'Bacak düz, havluyu ayak tabanından geçir ve kendine doğru çek.',
  },
  {
    name: 'Bantlı dorsifleksiyon',
    region: 'ankle',
    side: 'right',
    kind: 'reps',
    defaultSets: 3,
    defaultReps: 12,
    restSec: 45,
    bandLevel: 'Sarı',
    instructions: 'Bant ayağın üstünde, karşıdan sabitlenmiş. Ayak ucunu kendine doğru çek.',
  },
  {
    name: 'Quadriceps kasma (izometrik)',
    region: 'knee',
    side: 'left',
    kind: 'hold',
    defaultSets: 10,
    holdSec: 5,
    restSec: 10,
    instructions: 'Diz altında rulo havlu. Dizi havluya bastırarak uyluk kasını kas.',
  },
  {
    name: 'Düz bacak kaldırma',
    region: 'knee',
    side: 'left',
    kind: 'reps',
    defaultSets: 3,
    defaultReps: 10,
    restSec: 45,
    instructions: 'Sırtüstü, diğer diz bükülü. Diz kilitli, bacağı karşı diz hizasına kaldır.',
  },
  {
    name: 'Topuk kaydırma',
    region: 'knee',
    side: 'left',
    kind: 'reps',
    defaultSets: 2,
    defaultReps: 15,
    restSec: 30,
    instructions: 'Sırtüstü, topuğu yatakta kaydırarak dizi bük ve aç.',
  },
];

export function buildSampleExercises(now: number): Exercise[] {
  return SAMPLE_EXERCISES.map((e, i) => ({
    ...e,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    order: i,
    active: true,
    isSample: true,
  }));
}

/** Seeds settings + example exercises on first launch. Idempotent. */
export async function ensureSeeded(database: RehabDB, now = Date.now()): Promise<boolean> {
  return database.transaction('rw', database.settings, database.exercises, async () => {
    const existing = await database.settings.get(SETTINGS_ID);
    if (existing) return false;
    await database.settings.put(defaultSettings(now));
    if ((await database.exercises.count()) === 0) {
      await database.exercises.bulkPut(buildSampleExercises(now));
    }
    return true;
  });
}
