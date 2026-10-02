import type { InjuredSide, Region, Settings, Side } from './types';

export const DEFAULT_SYMMETRY_TARGET = 90;

export const DEFAULT_SYMMETRY_FIELDS: Pick<Settings, 'injuredSides' | 'symmetryTargets' | 'dominantHand'> = {
  // Scaphoid: left wrist. Talus: right ankle. Knee: no ROM tracking.
  injuredSides: { wrist: 'left', ankle: 'right', knee: 'none' },
  symmetryTargets: { wrist: DEFAULT_SYMMETRY_TARGET, ankle: DEFAULT_SYMMETRY_TARGET, knee: DEFAULT_SYMMETRY_TARGET },
  dominantHand: 'right',
};

const SIDES: Side[] = ['left', 'right'];
const INJURED: InjuredSide[] = ['left', 'right', 'none'];
const REGIONS: Region[] = ['wrist', 'ankle', 'knee'];

/**
 * Fills fields added in schema v2 (symmetry). Used by the Dexie upgrade, the backup
 * migration and when reading settings, so records from older versions never lack them.
 * Existing values are kept; the injured side of wrist/ankle is taken from the
 * previous per-region default side when present.
 */
export function withSettingsDefaults<T extends Partial<Settings>>(s: T): T & Pick<Settings, 'injuredSides' | 'symmetryTargets' | 'dominantHand'> {
  const injured = { ...DEFAULT_SYMMETRY_FIELDS.injuredSides };
  for (const r of ['wrist', 'ankle'] as Region[]) {
    const d = s.defaultSides?.[r];
    if (d && SIDES.includes(d)) injured[r] = d;
  }
  const injuredSides = Object.fromEntries(
    REGIONS.map((r) => [r, INJURED.includes(s.injuredSides?.[r] as InjuredSide) ? s.injuredSides![r] : injured[r]]),
  ) as Record<Region, InjuredSide>;
  const symmetryTargets = Object.fromEntries(
    REGIONS.map((r) => {
      const v = s.symmetryTargets?.[r];
      return [r, typeof v === 'number' && v > 0 && v <= 150 ? v : DEFAULT_SYMMETRY_TARGET];
    }),
  ) as Record<Region, number>;
  const dominantHand = s.dominantHand && SIDES.includes(s.dominantHand) ? s.dominantHand : DEFAULT_SYMMETRY_FIELDS.dominantHand;
  return { ...s, injuredSides, symmetryTargets, dominantHand };
}
