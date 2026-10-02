import { describe, expect, it } from 'vitest';
import type { Exercise } from '../src/db/types';
import { pickedExercises, togglePick } from '../src/logic/sessionPick';

const ex = (id: string, region: Exercise['region'], order: number, active = true): Exercise => ({
  id, region, order, active, name: id, kind: 'reps', defaultSets: 1, restSec: 0, createdAt: 0, updatedAt: 0,
});
const all = [ex('k1', 'knee', 0), ex('a2', 'ankle', 1), ex('a1', 'ankle', 0), ex('a3', 'ankle', 2, false), ex('w1', 'wrist', 0)];

describe('session exercise pick', () => {
  it('defaults to active exercises of the chosen regions in program order', () => {
    expect(pickedExercises(all, ['knee', 'ankle'], { excluded: [], included: [] }).map((e) => e.id)).toEqual(['a1', 'a2', 'k1']);
  });
  it('unticking an active exercise skips it; ticking an inactive one adds it', () => {
    let p = togglePick({ excluded: [], included: [] }, all[1]); // a2 off
    p = togglePick(p, all[3]); // a3 (inactive) on
    expect(pickedExercises(all, ['ankle'], p).map((e) => e.id)).toEqual(['a1', 'a3']);
    p = togglePick(p, all[1]); // a2 back on
    expect(pickedExercises(all, ['ankle'], p).map((e) => e.id)).toEqual(['a1', 'a2', 'a3']);
  });
  it('ignores picks from regions that are not selected', () => {
    const p = togglePick({ excluded: [], included: [] }, all[0]);
    expect(pickedExercises(all, ['wrist'], p).map((e) => e.id)).toEqual(['w1']);
  });
});
