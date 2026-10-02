import { describe, expect, it } from 'vitest';
import type { RomMeasurement, Session, SessionEntry } from '../src/db/types';
import { buildReport, halfTrend } from '../src/logic/report';
import { defaultRomTiming, exercisesWithLoad, loadSeries, romDue, romSeries } from '../src/logic/stats';

let n = 0;
function s(date: string, entries: SessionEntry[], p: Partial<Session> = {}): Session {
  n++;
  const t = Date.parse(`${date}T10:00:00Z`) + n;
  return { id: `s${n}`, createdAt: t, updatedAt: t, date, startedAt: t, endedAt: t + 1, regions: ['ankle'], painBefore: { ankle: 2 }, painAfter: { ankle: 3 }, entries, ...p };
}
function rom(date: string, angle: number, p: Partial<RomMeasurement> = {}): RomMeasurement {
  n++;
  return { id: `r${n}`, createdAt: n, updatedAt: n, date, region: 'ankle', side: 'right', movement: 'ankle_dorsiflexion', angleDeg: angle, method: 'sensor', ...p };
}
const reps = (sets: [number, number | undefined, boolean][]): SessionEntry => ({
  exerciseId: 'band', region: 'ankle', name: 'Bantlı', kind: 'reps',
  sets: sets.map(([r, kg, done]) => ({ reps: r, loadKg: kg, done })),
});

describe('loadSeries', () => {
  it('uses volume when any set carries a load; undone sets are ignored', () => {
    const list = [s('2026-09-01', [reps([[10, 2, true], [10, 2, true], [10, 2, false]])]), s('2026-09-03', [reps([[12, undefined, true]])])];
    expect(loadSeries(list, 'band')).toEqual({ metric: 'volume', dates: ['2026-09-01', '2026-09-03'], values: [40, 0] });
  });
  it('falls back to total reps without loads', () => {
    expect(loadSeries([s('2026-09-01', [reps([[10, undefined, true], [8, 0, true]])])], 'band')).toMatchObject({ metric: 'reps', values: [18] });
  });
  it('uses the max hold / duration for isometric and timed exercises', () => {
    const hold: SessionEntry = { exerciseId: 'h', kind: 'hold', sets: [{ holdSec: 10, done: true }, { holdSec: 25, done: true }, { holdSec: 60, done: false }] };
    const timed: SessionEntry = { exerciseId: 't', kind: 'timed', sets: [{ durationSec: 45, done: true }] };
    const list = [s('2026-09-01', [hold, timed])];
    expect(loadSeries(list, 'h')).toMatchObject({ metric: 'hold', values: [25] });
    expect(loadSeries(list, 't')).toMatchObject({ metric: 'duration', values: [45] });
  });
  it('skips sessions where the exercise had no completed set and respects from', () => {
    const list = [s('2026-08-01', [reps([[5, 1, true]])]), s('2026-09-01', [reps([[5, 1, false]])]), s('2026-09-02', [reps([[5, 1, true]])])];
    expect(loadSeries(list, 'band').dates).toEqual(['2026-08-01', '2026-09-02']);
    expect(loadSeries(list, 'band', '2026-09-01').dates).toEqual(['2026-09-02']);
  });
  it('exercisesWithLoad lists exercises with completed sets per region', () => {
    const list = [s('2026-09-01', [reps([[5, 1, true]]), { exerciseId: 'w', region: 'wrist', name: 'Bilek', sets: [{ reps: 1, done: true }] }], { regions: ['ankle', 'wrist'] })];
    expect(exercisesWithLoad(list, 'ankle').map((e) => e.exerciseId)).toEqual(['band']);
    expect(exercisesWithLoad(list, 'all')).toHaveLength(2);
  });
});

describe('romSeries / romDue', () => {
  it('builds per-side series with the last value of each day', () => {
    const list = [rom('2026-09-01', 10), rom('2026-09-01', 12), rom('2026-09-05', 15), rom('2026-09-05', 20, { side: 'left' }), rom('2026-09-06', 30, { movement: 'ankle_plantarflexion' })];
    expect(romSeries(list, 'ankle_dorsiflexion')).toEqual({ dates: ['2026-09-01', '2026-09-05'], right: [12, 15], left: [null, 20] });
    expect(romSeries(list, 'ankle_dorsiflexion', '2026-09-02').dates).toEqual(['2026-09-05']);
  });
  it('romDue is true without a measurement in the last 7 days', () => {
    expect(romDue([], '2026-10-02')).toBe(true);
    expect(romDue([rom('2026-09-26', 1)], '2026-10-02')).toBe(false);
    expect(romDue([rom('2026-09-25', 1)], '2026-10-02')).toBe(true);
  });
});

describe('buildReport', () => {
  const settings = { painIncreaseThreshold: 2, painMaxDuring: 5, nextMorningMustReturn: true };
  it('summarises the period', () => {
    const sessions = [
      s('2026-08-20', [], { painBefore: { ankle: 9 }, painAfter: { ankle: 9 } }), // outside
      s('2026-09-01', [], { painBefore: { ankle: 4 }, painAfter: { ankle: 6 }, painNextMorning: { ankle: 4 } }),
      s('2026-09-08', [], { painBefore: { ankle: 3 }, painAfter: { ankle: 3 }, painNextMorning: { ankle: 3 }, redFlags: ['numbness'], notes: 'uyuşma' }),
      s('2026-09-15', [], { regions: ['ankle', 'knee'], painBefore: { ankle: 1, knee: 2 }, painAfter: { ankle: 1, knee: 2 } }),
      s('2026-09-16', [], { endedAt: undefined }),
    ];
    const r = buildReport({
      sessions,
      rom: [rom('2026-09-02', 8), rom('2026-09-14', 14.5), rom('2026-09-03', 30, { movement: 'knee_flexion', region: 'knee', side: 'left' }), rom('2026-07-01', 1)],
      settings,
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(r.sessionCount).toBe(3);
    expect(r.byRegion).toEqual({ wrist: 0, ankle: 3, knee: 1 });
    expect(r.levels).toEqual({ green: 1, orange: 1, red: 1, provisional: 1 });
    const ankle = r.pain.find((p) => p.region === 'ankle')!;
    expect(ankle).toMatchObject({ n: 3, before: 2.7, after: 3.3, morning: 3.5, trend: 'down' });
    expect(r.rom).toHaveLength(2);
    expect(r.rom.find((x) => x.movement === 'ankle_dorsiflexion')).toMatchObject({ n: 2, first: { angle: 8 }, last: { angle: 14.5 }, diff: 6.5 });
    expect(r.redFlags).toEqual([{ date: '2026-09-08', flags: ['numbness'], notes: 'uyuşma' }]);
  });
  it('halfTrend', () => {
    expect(halfTrend([1])).toBeNull();
    expect(halfTrend([5, 5, 1, 1])).toBe('down');
    expect(halfTrend([1, 2, 1, 2])).toBe('flat');
    expect(halfTrend([1, 9, 3])).toBe('up');
  });
});

describe('ROM timing (pre/post training)', () => {
  it('romSeries filters by timing; "all" includes legacy entries', () => {
    const list = [rom('2026-09-01', 10, { timing: 'pre' }), rom('2026-09-01', 14, { timing: 'post' }), rom('2026-09-02', 11)];
    expect(romSeries(list, 'ankle_dorsiflexion', undefined, 'pre')).toMatchObject({ dates: ['2026-09-01'], right: [10] });
    expect(romSeries(list, 'ankle_dorsiflexion', undefined, 'post')).toMatchObject({ dates: ['2026-09-01'], right: [14] });
    expect(romSeries(list, 'ankle_dorsiflexion', undefined, 'all').dates).toEqual(['2026-09-01', '2026-09-02']);
  });
  it('defaultRomTiming is "post" within 3 h after a finished session', () => {
    const h = 3_600_000;
    expect(defaultRomTiming([], 10 * h)).toBe('pre');
    expect(defaultRomTiming([{ endedAt: 8 * h }], 10 * h)).toBe('post');
    expect(defaultRomTiming([{ endedAt: 6 * h }], 10 * h)).toBe('pre');
    expect(defaultRomTiming([{ endedAt: undefined }], 10 * h)).toBe('pre');
  });
  it('report keeps pre and post as separate rows', () => {
    const r = buildReport({
      sessions: [],
      rom: [rom('2026-09-01', 10, { timing: 'pre' }), rom('2026-09-08', 12, { timing: 'pre' }), rom('2026-09-01', 15, { timing: 'post' }), rom('2026-09-08', 20, { timing: 'post' })],
      settings: { painIncreaseThreshold: 2, painMaxDuring: 5, nextMorningMustReturn: true },
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(r.rom.map((x) => [x.timing, x.diff])).toEqual([
      ['pre', 2],
      ['post', 5],
    ]);
  });
});
