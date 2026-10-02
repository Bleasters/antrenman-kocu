export type Region = 'wrist' | 'ankle' | 'knee';
export type Side = 'left' | 'right';
export type ExerciseKind = 'reps' | 'hold' | 'timed';

export const REGIONS: Region[] = ['wrist', 'ankle', 'knee'];

export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Exercise extends BaseRecord {
  name: string;
  region: Region;
  side?: Side;
  kind: ExerciseKind;
  defaultSets: number;
  defaultReps?: number; // kind=reps
  holdSec?: number; // kind=hold
  durationSec?: number; // kind=timed
  restSec: number;
  loadKg?: number;
  bandLevel?: string;
  instructions?: string;
  mediaId?: string;
  active: boolean;
  order: number;
  isSample?: boolean; // seeded example, shown with "Örnek — düzenle"
}

export interface SetLog {
  reps?: number;
  holdSec?: number;
  durationSec?: number;
  loadKg?: number;
  done: boolean;
}

export interface SessionEntry {
  exerciseId: string;
  /** Snapshots taken at session start so history survives program edits/deletions. */
  region?: Region;
  name?: string;
  kind?: ExerciseKind;
  sets: SetLog[];
  painDuring?: number;
}

export type RedFlag =
  | 'sudden_swelling'
  | 'numbness'
  | 'night_pain'
  | 'locking'
  | 'giving_way'
  | 'warmth_redness';

export const RED_FLAGS: RedFlag[] = [
  'sudden_swelling',
  'numbness',
  'night_pain',
  'locking',
  'giving_way',
  'warmth_redness',
];

export type PainMap = Partial<Record<Region, number>>;

export interface Session extends BaseRecord {
  date: string; // YYYY-MM-DD, Europe/Istanbul
  startedAt: number;
  endedAt?: number; // undefined => in progress
  regions: Region[];
  painBefore: PainMap;
  painAfter: PainMap;
  painNextMorning?: PainMap;
  entries: SessionEntry[];
  notes?: string;
  redFlags?: RedFlag[];
}

export type RomMovement =
  | 'wrist_flexion'
  | 'wrist_extension'
  | 'wrist_radial_dev'
  | 'wrist_ulnar_dev'
  | 'ankle_dorsiflexion'
  | 'ankle_plantarflexion'
  | 'knee_flexion'
  | 'knee_extension';

/** When the ROM was measured relative to the training session. */
export type RomTiming = 'pre' | 'post';

export interface RomMeasurement extends BaseRecord {
  date: string;
  region: Region;
  side: Side;
  movement: RomMovement;
  angleDeg: number;
  method: 'sensor' | 'manual';
  /** Undefined for measurements taken before this field existed. */
  timing?: RomTiming;
  /** Individual sensor trials the stored (median) angle came from. */
  trials?: number[];
  notes?: string;
}

export type MediaKind = 'xray' | 'photo' | 'exercise_video';

export interface Media extends BaseRecord {
  date: string;
  region?: Region;
  kind: MediaKind;
  blob: Blob;
  thumbBlob?: Blob;
  note?: string;
}

export interface Settings extends BaseRecord {
  painIncreaseThreshold: number;
  painMaxDuring: number;
  nextMorningMustReturn: boolean;
  lastBackupAt?: number;
  backupReminderDays: number;
  schemaVersion: number;
  defaultSides: Record<Region, Side>;
  /** Injured/operated side per region; 'none' = no symmetry tracking for that region. */
  injuredSides: Record<Region, InjuredSide>;
  /** Target symmetry index (%) per region. */
  symmetryTargets: Record<Region, number>;
  dominantHand: Side;
}

export type InjuredSide = Side | 'none';

/** Key-value store for app-internal state (active session pointer, pre-replace snapshot). Not exported. */
export interface MetaRecord {
  key: string;
  value: unknown;
}
