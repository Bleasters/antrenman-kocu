import type { SessionProgress } from '../../db/repo';
import type { Session, SetLog } from '../../db/types';

/** Pure state transitions for the exercise step (unit tested). */

export function markSetDone(session: Session, p: SessionProgress, patch: Partial<SetLog>): Session {
  const entries = session.entries.map((e, i) =>
    i !== p.exIndex ? e : { ...e, sets: e.sets.map((s, j) => (j === p.setIndex ? { ...s, ...patch, done: true } : s)) },
  );
  return { ...session, entries };
}

export function afterSetDone(session: Session, p: SessionProgress, restSec: number): SessionProgress {
  const entry = session.entries[p.exIndex];
  if (p.setIndex >= entry.sets.length - 1) return { ...p, phase: 'complete', count: 0 };
  if (restSec > 0) return { ...p, phase: 'rest', count: 0 };
  return { ...p, setIndex: p.setIndex + 1, phase: 'work', count: 0 };
}

export function afterRest(p: SessionProgress): SessionProgress {
  return { ...p, setIndex: p.setIndex + 1, phase: 'work', count: 0 };
}

export function goToExercise(session: Session, p: SessionProgress, exIndex: number): SessionProgress {
  if (exIndex >= session.entries.length) return { ...p, step: 'after', phase: 'work', count: 0 };
  const idx = Math.max(0, exIndex);
  const sets = session.entries[idx]?.sets ?? [];
  const firstOpen = sets.findIndex((s) => !s.done);
  return {
    ...p,
    step: 'exercise',
    exIndex: idx,
    setIndex: firstOpen === -1 ? Math.max(0, sets.length - 1) : firstOpen,
    phase: firstOpen === -1 && sets.length > 0 ? 'complete' : 'work',
    count: 0,
  };
}

/** Applies a change to the current and all following not-yet-done sets of the exercise. */
export function editUpcomingSets(session: Session, p: SessionProgress, patch: Partial<SetLog>): Session {
  const entries = session.entries.map((e, i) =>
    i !== p.exIndex ? e : { ...e, sets: e.sets.map((s, j) => (j >= p.setIndex && !s.done ? { ...s, ...patch } : s)) },
  );
  return { ...session, entries };
}

export function setPainDuring(session: Session, exIndex: number, v: number | undefined): Session {
  const entries = session.entries.map((e, i) => (i === exIndex ? { ...e, painDuring: v } : e));
  return { ...session, entries };
}
