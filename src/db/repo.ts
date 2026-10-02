import { db, SETTINGS_ID } from './db';
import { newId } from './ids';
import { defaultSettings } from './seed';
import type { Exercise, Media, Region, RomMeasurement, RomTiming, Session, Settings } from './types';
import { REGIONS } from './types';
import { toISODate } from '../logic/dates';

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(SETTINGS_ID)) ?? defaultSettings(Date.now());
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: SETTINGS_ID, updatedAt: Date.now() });
}

// ---------- Exercises ----------

export async function listExercises(): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  return sortExercises(all);
}

export function sortExercises(list: Exercise[]): Exercise[] {
  return [...list].sort((a, b) => REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) || a.order - b.order);
}

export type ExerciseInput = Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'order'> & { order?: number };

export async function saveExercise(input: ExerciseInput, id?: string): Promise<string> {
  const now = Date.now();
  if (id) {
    const cur = await db.exercises.get(id);
    if (cur) {
      // Editing a sample makes it the user's own.
      await db.exercises.put({ ...cur, ...input, id, isSample: false, updatedAt: now });
      return id;
    }
  }
  const sameRegion = await db.exercises.where('region').equals(input.region).toArray();
  const order = input.order ?? Math.max(-1, ...sameRegion.map((e) => e.order)) + 1;
  const newRec: Exercise = { ...input, id: newId(), createdAt: now, updatedAt: now, order };
  await db.exercises.add(newRec);
  return newRec.id;
}

export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id);
}

export async function setExerciseActive(id: string, active: boolean): Promise<void> {
  await db.exercises.update(id, { active, updatedAt: Date.now() });
}

/** Swaps an exercise with its neighbour within the same region. */
export async function moveExercise(id: string, dir: -1 | 1): Promise<void> {
  await db.transaction('rw', db.exercises, async () => {
    const ex = await db.exercises.get(id);
    if (!ex) return;
    const list = (await db.exercises.where('region').equals(ex.region).toArray()).sort((a, b) => a.order - b.order);
    // normalise orders first so swaps are always well defined
    list.forEach((e, i) => (e.order = i));
    const i = list.findIndex((e) => e.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    const now = Date.now();
    await db.exercises.bulkPut(list.map((e) => (e.id === list[i].id || e.id === list[j].id ? { ...e, updatedAt: now } : e)));
  });
}

// ---------- Sessions ----------

export const ACTIVE_SESSION_KEY = 'activeSession';

export interface SessionProgress {
  sessionId: string;
  step: 'before' | 'exercise' | 'after';
  exIndex: number;
  setIndex: number;
  phase: 'work' | 'rest' | 'complete';
  count: number;
}

export async function getActiveProgress(): Promise<SessionProgress | null> {
  const rec = await db.meta.get(ACTIVE_SESSION_KEY);
  const p = rec?.value as SessionProgress | undefined;
  if (!p) return null;
  const s = await db.sessions.get(p.sessionId);
  if (!s || s.endedAt != null) {
    await db.meta.delete(ACTIVE_SESSION_KEY);
    return null;
  }
  return p;
}

export async function createSession(regions: Region[], exercises: Exercise[]): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    date: toISODate(now),
    startedAt: now,
    regions,
    painBefore: {},
    painAfter: {},
    entries: exercises.map((e) => ({
      exerciseId: e.id,
      region: e.region,
      name: e.name,
      kind: e.kind,
      sets: Array.from({ length: Math.max(1, e.defaultSets) }, () => ({
        reps: e.kind === 'reps' ? e.defaultReps : undefined,
        holdSec: e.kind === 'hold' ? e.holdSec : undefined,
        durationSec: e.kind === 'timed' ? e.durationSec : undefined,
        loadKg: e.loadKg,
        done: false,
      })),
    })),
  };
  const progress: SessionProgress = { sessionId: session.id, step: 'before', exIndex: 0, setIndex: 0, phase: 'work', count: 0 };
  await db.transaction('rw', db.sessions, db.meta, async () => {
    await db.sessions.add(session);
    await db.meta.put({ key: ACTIVE_SESSION_KEY, value: progress });
  });
  return session;
}

/** Persists the in-progress session and UI position in one transaction (crash-safe). */
export async function saveDraft(session: Session, progress: SessionProgress): Promise<void> {
  await db.transaction('rw', db.sessions, db.meta, async () => {
    await db.sessions.put({ ...session, updatedAt: Date.now() });
    await db.meta.put({ key: ACTIVE_SESSION_KEY, value: progress });
  });
}

export async function finishSession(session: Session): Promise<Session> {
  const now = Date.now();
  const done = { ...session, endedAt: now, updatedAt: now };
  await db.transaction('rw', db.sessions, db.meta, async () => {
    await db.sessions.put(done);
    await db.meta.delete(ACTIVE_SESSION_KEY);
  });
  return done;
}

export async function discardActiveSession(): Promise<void> {
  await db.transaction('rw', db.sessions, db.meta, async () => {
    const rec = await db.meta.get(ACTIVE_SESSION_KEY);
    const p = rec?.value as SessionProgress | undefined;
    if (p) await db.sessions.delete(p.sessionId);
    await db.meta.delete(ACTIVE_SESSION_KEY);
  });
}

export async function setMorningPain(sessionId: string, pain: Partial<Record<Region, number>>): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    await db.sessions.put({ ...s, painNextMorning: { ...(s.painNextMorning ?? {}), ...pain }, updatedAt: Date.now() });
  });
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', [db.exercises, db.sessions, db.rom, db.media, db.settings, db.meta], async () => {
    await Promise.all([db.exercises.clear(), db.sessions.clear(), db.rom.clear(), db.media.clear(), db.settings.clear(), db.meta.clear()]);
  });
}

/** Read-only variant for live queries (liveQuery must not write). */
export async function readActiveProgress(): Promise<SessionProgress | null> {
  const rec = await db.meta.get(ACTIVE_SESSION_KEY);
  const p = rec?.value as SessionProgress | undefined;
  if (!p) return null;
  const s = await db.sessions.get(p.sessionId);
  return s && s.endedAt == null ? p : null;
}

// ---------- ROM ----------

export type RomInput = Omit<RomMeasurement, 'id' | 'createdAt' | 'updatedAt'>;

export async function saveRom(input: RomInput): Promise<string> {
  const now = Date.now();
  const rec: RomMeasurement = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.rom.add(rec);
  return rec.id;
}

export async function updateRomMeta(id: string, patch: { notes: string; timing?: RomTiming }): Promise<void> {
  await db.rom.update(id, { notes: patch.notes.trim() || undefined, timing: patch.timing, updatedAt: Date.now() });
}

export async function deleteRom(id: string): Promise<void> {
  await db.rom.delete(id);
}

// ---------- Media ----------

export type MediaInput = Omit<Media, 'id' | 'createdAt' | 'updatedAt'>;

export async function saveMedia(input: MediaInput): Promise<string> {
  const now = Date.now();
  const rec: Media = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.media.add(rec);
  return rec.id;
}

export async function updateMedia(id: string, patch: Partial<Pick<Media, 'date' | 'region' | 'kind' | 'note'>>): Promise<void> {
  await db.media.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteMedia(id: string): Promise<void> {
  await db.media.delete(id);
}
