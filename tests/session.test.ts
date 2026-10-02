import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import {
  createSession,
  discardActiveSession,
  finishSession,
  getActiveProgress,
  listExercises,
  moveExercise,
  saveDraft,
  saveExercise,
  setMorningPain,
  type SessionProgress,
} from '../src/db/repo';
import { ensureSeeded } from '../src/db/seed';
import { afterRest, afterSetDone, editUpcomingSets, goToExercise, markSetDone, setPainDuring } from '../src/screens/session/flow';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureSeeded(db);
});

async function startAnkle() {
  const ex = (await listExercises()).filter((e) => e.region === 'ankle');
  const s = await createSession(['ankle'], ex);
  const p = (await getActiveProgress())!;
  return { s, p, ex };
}

describe('session persistence (crash recovery)', () => {
  it('creates a draft with planned sets from exercise defaults', async () => {
    const { s, p, ex } = await startAnkle();
    expect(p).toEqual({ sessionId: s.id, step: 'before', exIndex: 0, setIndex: 0, phase: 'work', count: 0 });
    expect(s.endedAt).toBeUndefined();
    expect(s.entries).toHaveLength(ex.length);
    const first = s.entries[0];
    expect(first.region).toBe('ankle');
    expect(first.name).toBe(ex[0].name);
    expect(first.sets).toHaveLength(ex[0].defaultSets);
    expect(first.sets.every((x) => !x.done)).toBe(true);
  });

  it('a draft written mid-session is fully recoverable after "restart"', async () => {
    const { s, p } = await startAnkle();
    const s2 = { ...s, painBefore: { ankle: 3 } };
    const p2: SessionProgress = { ...goToExercise(s2, p, 0) };
    const s3 = markSetDone(s2, p2, { durationSec: 60 });
    const p3 = afterSetDone(s3, p2, 30);
    await saveDraft(s3, p3);

    // simulate the app being killed: read everything back from IndexedDB
    const restoredP = await getActiveProgress();
    const restoredS = await db.sessions.get(s.id);
    expect(restoredP).toEqual(p3);
    expect(restoredS?.painBefore).toEqual({ ankle: 3 });
    expect(restoredS?.entries[0].sets[0]).toMatchObject({ durationSec: 60, done: true });
  });

  it('finishing clears the active pointer; discarding deletes the session', async () => {
    const a = await startAnkle();
    const done = await finishSession(a.s);
    expect(done.endedAt).toBeTypeOf('number');
    expect(await getActiveProgress()).toBeNull();

    const b = await startAnkle();
    await discardActiveSession();
    expect(await getActiveProgress()).toBeNull();
    expect(await db.sessions.get(b.s.id)).toBeUndefined();
    expect(await db.sessions.get(a.s.id)).toBeDefined();
  });

  it('setMorningPain merges per region', async () => {
    const { s } = await startAnkle();
    await finishSession(s);
    await setMorningPain(s.id, { ankle: 2 });
    await setMorningPain(s.id, { knee: 1 });
    expect((await db.sessions.get(s.id))?.painNextMorning).toEqual({ ankle: 2, knee: 1 });
  });
});

describe('session flow transitions', () => {
  it('walks sets → rest → next set → complete → next exercise → after', async () => {
    const { s, p } = await startAnkle();
    let sess = s;
    let prog = goToExercise(sess, p, 0);
    expect(prog).toMatchObject({ step: 'exercise', exIndex: 0, setIndex: 0, phase: 'work' });

    const nSets = sess.entries[0].sets.length;
    for (let i = 0; i < nSets; i++) {
      sess = markSetDone(sess, prog, { durationSec: 60 });
      prog = afterSetDone(sess, prog, 30);
      if (i < nSets - 1) {
        expect(prog.phase).toBe('rest');
        prog = afterRest(prog);
        expect(prog).toMatchObject({ setIndex: i + 1, phase: 'work' });
      }
    }
    expect(prog.phase).toBe('complete');
    prog = goToExercise(sess, prog, prog.exIndex + 1);
    expect(prog).toMatchObject({ exIndex: 1, setIndex: 0, phase: 'work' });
    prog = goToExercise(sess, prog, sess.entries.length);
    expect(prog.step).toBe('after');
  });

  it('skips rest when restSec is 0', async () => {
    const { s, p } = await startAnkle();
    const prog = goToExercise(s, p, 0);
    const next = afterSetDone(markSetDone(s, prog, {}), prog, 0);
    expect(next).toMatchObject({ setIndex: 1, phase: 'work' });
  });

  it('going back to a finished exercise lands on complete; partial lands on first open set', async () => {
    const { s, p } = await startAnkle();
    let sess = s;
    let prog = goToExercise(sess, p, 0);
    sess = markSetDone(sess, prog, {});
    expect(goToExercise(sess, prog, 0)).toMatchObject({ setIndex: 1, phase: 'work' });
    for (let i = 1; i < sess.entries[0].sets.length; i++) sess = markSetDone(sess, { ...prog, setIndex: i }, {});
    prog = goToExercise(sess, prog, 0);
    expect(prog.phase).toBe('complete');
    expect(goToExercise(sess, prog, -3).exIndex).toBe(0);
  });

  it('editUpcomingSets changes only the current and later open sets', async () => {
    const { s, p } = await startAnkle();
    let prog = goToExercise(s, p, 2); // Bantlı dorsifleksiyon, reps
    let sess = markSetDone(s, prog, { reps: 12 });
    prog = { ...prog, setIndex: 1 };
    sess = editUpcomingSets(sess, prog, { reps: 8, loadKg: 1 });
    expect(sess.entries[2].sets.map((x) => [x.reps, x.loadKg, x.done])).toEqual([
      [12, undefined, true],
      [8, 1, false],
      [8, 1, false],
    ]);
    sess = setPainDuring(sess, 2, 4);
    expect(sess.entries[2].painDuring).toBe(4);
  });
});

describe('program CRUD', () => {
  it('adds at the end of the region and reorders within the region', async () => {
    const id = await saveExercise({ name: 'Yeni', region: 'knee', kind: 'reps', defaultSets: 2, defaultReps: 5, restSec: 10, active: true });
    let knee = (await listExercises()).filter((e) => e.region === 'knee');
    expect(knee[knee.length - 1].id).toBe(id);
    await moveExercise(id, -1);
    knee = (await listExercises()).filter((e) => e.region === 'knee');
    expect(knee[knee.length - 2].id).toBe(id);
    await moveExercise(knee[0].id, -1); // no-op at the top
    expect((await listExercises()).filter((e) => e.region === 'knee')[0].id).toBe(knee[0].id);
  });

  it('editing a sample clears its sample flag', async () => {
    const ex = (await listExercises())[0];
    expect(ex.isSample).toBe(true);
    await saveExercise({ ...ex, name: 'Düzenlendi' }, ex.id);
    const after = await db.exercises.get(ex.id);
    expect(after).toMatchObject({ name: 'Düzenlendi', isSample: false, createdAt: ex.createdAt });
  });
});
