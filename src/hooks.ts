import { db, SETTINGS_ID } from './db/db';
import { useLive } from './db/live';
import type { Exercise, Session, Settings } from './db/types';
import { evaluateHistory, type SessionEvaluation } from './logic/painRules';

export function useSettings(): Settings | undefined {
  return useLive(() => db.settings.get(SETTINGS_ID), [], undefined);
}

export function useSessions(): Session[] | undefined {
  return useLive<Session[] | undefined>(() => db.sessions.toArray(), [], undefined);
}

export function useExercises(): Exercise[] | undefined {
  return useLive<Exercise[] | undefined>(() => db.exercises.toArray(), [], undefined);
}

export function evaluateAll(sessions: Session[], settings: Settings, exercises: Exercise[] = []): SessionEvaluation[] {
  const byId = new Map(exercises.map((e) => [e.id, e.region]));
  return evaluateHistory(sessions, settings, (id) => byId.get(id));
}
