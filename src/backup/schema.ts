import { z } from 'zod/mini';

export const BACKUP_APP_ID = 'rehab-pwa';

const region = z.enum(['wrist', 'ankle', 'knee']);
const side = z.enum(['left', 'right']);
const injured = z.enum(['left', 'right', 'none']);
const target = z.number().check(z.minimum(1), z.maximum(150));
const pain = z.number().check(z.minimum(0), z.maximum(10));
const nonNeg = () => z.number().check(z.minimum(0));
const opt = <T extends z.core.SomeType>(t: T) => z.optional(t);
const painMap = z.object({ wrist: opt(pain), ankle: opt(pain), knee: opt(pain) });
const date = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const base = {
  id: z.string().check(z.minLength(1)),
  createdAt: z.number(),
  updatedAt: z.number(),
};

export const exerciseSchema = z.object({
  ...base,
  name: z.string(),
  region,
  side: opt(side),
  kind: z.enum(['reps', 'hold', 'timed']),
  defaultSets: z.int().check(z.minimum(1)),
  defaultReps: opt(z.int().check(z.minimum(0))),
  holdSec: opt(nonNeg()),
  durationSec: opt(nonNeg()),
  restSec: nonNeg(),
  loadKg: opt(nonNeg()),
  bandLevel: opt(z.string()),
  instructions: opt(z.string()),
  mediaId: opt(z.string()),
  active: z.boolean(),
  order: z.number(),
  isSample: opt(z.boolean()),
});

const setLog = z.object({
  reps: opt(nonNeg()),
  holdSec: opt(nonNeg()),
  durationSec: opt(nonNeg()),
  loadKg: opt(nonNeg()),
  done: z.boolean(),
});

export const sessionSchema = z.object({
  ...base,
  date,
  startedAt: z.number(),
  endedAt: opt(z.number()),
  regions: z.array(region),
  painBefore: painMap,
  painAfter: painMap,
  painNextMorning: opt(painMap),
  entries: z.array(
    z.object({
      exerciseId: z.string(),
      region: opt(region),
      name: opt(z.string()),
      kind: opt(z.enum(['reps', 'hold', 'timed'])),
      sets: z.array(setLog),
      painDuring: opt(pain),
    }),
  ),
  notes: opt(z.string()),
  redFlags: opt(z.array(z.enum(['sudden_swelling', 'numbness', 'night_pain', 'locking', 'giving_way', 'warmth_redness']))),
});

export const romSchema = z.object({
  ...base,
  date,
  region,
  side,
  movement: z.enum([
    'wrist_flexion',
    'wrist_extension',
    'wrist_radial_dev',
    'wrist_ulnar_dev',
    'ankle_dorsiflexion',
    'ankle_plantarflexion',
    'knee_flexion',
    'knee_extension',
  ]),
  angleDeg: z.number(),
  method: z.enum(['sensor', 'manual']),
  timing: opt(z.enum(['pre', 'post'])),
  trials: opt(z.array(z.number())),
  notes: opt(z.string()),
});

export const settingsSchema = z.object({
  ...base,
  painIncreaseThreshold: z.number().check(z.minimum(0), z.maximum(10)),
  painMaxDuring: z.number().check(z.minimum(0), z.maximum(10)),
  nextMorningMustReturn: z.boolean(),
  lastBackupAt: opt(z.number()),
  backupReminderDays: z.int().check(z.minimum(1)),
  schemaVersion: z.int(),
  defaultSides: z.object({ wrist: side, ankle: side, knee: side }),
  injuredSides: z.object({ wrist: injured, ankle: injured, knee: injured }),
  symmetryTargets: z.object({ wrist: target, ankle: target, knee: target }),
  dominantHand: side,
});

/** Media metadata inside a full (ZIP) backup; the binary lives at `file` / `thumb` in the archive. */
export const mediaMetaSchema = z.object({
  ...base,
  date,
  region: opt(region),
  kind: z.enum(['xray', 'photo', 'exercise_video']),
  note: opt(z.string()),
  file: z.string(),
  type: z.string(),
  thumb: opt(z.string()),
  thumbType: opt(z.string()),
});

export const backupDataSchema = z.object({
  exercises: z.array(exerciseSchema),
  sessions: z.array(sessionSchema),
  rom: z.array(romSchema),
  settings: z.nullable(settingsSchema),
  media: opt(z.array(mediaMetaSchema)),
});

export const backupFileSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  schemaVersion: z.int().check(z.minimum(1)),
  exportedAt: z.number(),
  kind: z._default(z.enum(['data', 'full']), 'data'),
  data: backupDataSchema,
});

export type MediaMeta = z.infer<typeof mediaMetaSchema>;
export type BackupData = z.infer<typeof backupDataSchema>;
export type BackupFile = z.infer<typeof backupFileSchema>;
