import type { Exercise, Region } from '../db/types';
import { REGIONS } from '../db/types';

export interface Pick {
  excluded: string[];
  included: string[];
}

/** Exercises for the session in program order: active ones minus exclusions, plus opted-in inactive ones. */
export function pickedExercises(all: Exercise[], regions: Region[], pick: Pick): Exercise[] {
  return all
    .filter((e) => regions.includes(e.region))
    .filter((e) => (e.active ? !pick.excluded.includes(e.id) : pick.included.includes(e.id)))
    .sort((a, b) => REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) || a.order - b.order);
}

export function togglePick(pick: Pick, e: Exercise): Pick {
  const flip = (list: string[]) => (list.includes(e.id) ? list.filter((x) => x !== e.id) : [...list, e.id]);
  return e.active ? { ...pick, excluded: flip(pick.excluded) } : { ...pick, included: flip(pick.included) };
}
