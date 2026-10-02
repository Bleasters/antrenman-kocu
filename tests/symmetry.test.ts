import { describe, expect, it } from 'vitest';
import type { RomMeasurement } from '../src/db/types';
import {
  computeSymmetry,
  healthyReference,
  injuredSeries,
  movementSymmetry,
  needsHealthyMeasurement,
  otherSide,
  PRIMARY_MOVEMENT,
  regionSymmetry,
  SYMMETRY_CONFIG,
  symmetryReportRows,
  symmetrySummary,
} from '../src/logic/symmetry';

let n = 0;
function m(p: Partial<RomMeasurement> & Pick<RomMeasurement, 'date' | 'side' | 'angleDeg'>): RomMeasurement {
  n++;
  return { id: `m${n}`, createdAt: n, updatedAt: n, region: 'wrist', movement: 'wrist_extension', method: 'sensor', ...p };
}
const TODAY = '2026-10-02';
const settings = {
  injuredSides: { wrist: 'left', ankle: 'right', knee: 'none' } as const,
  symmetryTargets: { wrist: 90, ankle: 90, knee: 90 },
};

describe('config', () => {
  it('knee extension is a deficit movement, the rest are ratios', () => {
    expect(SYMMETRY_CONFIG.knee_extension.mode).toBe('deficit');
    expect(Object.entries(SYMMETRY_CONFIG).filter(([, c]) => c.mode === 'deficit').map(([k]) => k)).toEqual(['knee_extension']);
    expect(PRIMARY_MOVEMENT).toEqual({ wrist: 'wrist_extension', ankle: 'ankle_dorsiflexion', knee: 'knee_flexion' });
    expect(otherSide('left')).toBe('right');
  });
});

describe('computeSymmetry', () => {
  const ref = (value: number, stale = false) => ({ value, stale, lastDate: '2026-10-01', count: 1 });
  it('normal ratio: injured / healthy × 100', () => {
    expect(computeSymmetry(48, ref(66), 'ratio')).toMatchObject({ status: 'ok', mode: 'ratio', percent: 72.7, injured: 48, healthy: 66 });
  });
  it('boundaries: equal sides = 100%, injured above healthy > 100%, injured 0 = 0%', () => {
    expect(computeSymmetry(60, ref(60), 'ratio')).toMatchObject({ percent: 100 });
    expect(computeSymmetry(70, ref(60), 'ratio')).toMatchObject({ percent: 116.7 });
    expect(computeSymmetry(0, ref(60), 'ratio')).toMatchObject({ percent: 0 });
  });
  it('no healthy data or healthy value 0 → "no data", never a division by zero', () => {
    expect(computeSymmetry(48, null, 'ratio')).toEqual({ status: 'no_healthy', injured: 48 });
    expect(computeSymmetry(48, ref(0), 'ratio')).toEqual({ status: 'no_healthy', injured: 48 });
    expect(computeSymmetry(48, ref(-3), 'ratio')).toEqual({ status: 'no_healthy', injured: 48 });
  });
  it('deficit movements report degrees missing to the healthy side, not a ratio', () => {
    expect(computeSymmetry(82, ref(90), 'deficit')).toMatchObject({ status: 'ok', mode: 'deficit', deficit: 8 });
    expect(computeSymmetry(92, ref(90), 'deficit')).toMatchObject({ deficit: 0 }); // never negative
    expect(computeSymmetry(5, ref(0), 'deficit')).toMatchObject({ status: 'ok', deficit: 0 }); // 0 healthy is fine here
    expect(computeSymmetry(5, null, 'deficit')).toEqual({ status: 'no_healthy', injured: 5 });
  });
  it('carries the stale flag', () => {
    expect(computeSymmetry(48, ref(66, true), 'ratio')).toMatchObject({ stale: true });
  });
});

describe('healthyReference', () => {
  const list = [
    m({ date: '2026-09-20', side: 'right', angleDeg: 60 }),
    m({ date: '2026-09-25', side: 'right', angleDeg: 70 }),
    m({ date: '2026-09-28', side: 'right', angleDeg: 64 }),
    m({ date: '2026-09-29', side: 'left', angleDeg: 40 }),
    m({ date: '2026-09-29', side: 'right', angleDeg: 99, movement: 'wrist_flexion' }),
  ];
  it('is the median of the healthy side over the last 30 days', () => {
    expect(healthyReference(list, 'wrist_extension', 'right', TODAY)).toEqual({ value: 64, stale: false, lastDate: '2026-09-28', count: 3 });
  });
  it('only uses measurements on or before asOf', () => {
    expect(healthyReference(list, 'wrist_extension', 'right', '2026-09-24')).toMatchObject({ value: 60, count: 1 });
    expect(healthyReference(list, 'wrist_extension', 'right', '2026-09-19')).toBeNull();
  });
  it('exactly 30 days old still counts; 31 days is stale', () => {
    const one = [m({ date: '2026-09-02', side: 'right', angleDeg: 66 })];
    expect(healthyReference(one, 'wrist_extension', 'right', TODAY)).toMatchObject({ stale: false }); // 30 days
    expect(healthyReference(one, 'wrist_extension', 'right', '2026-10-03')).toMatchObject({ stale: true, value: 66 }); // 31 days
  });
  it('stale reference uses the latest measured day', () => {
    const old = [m({ date: '2026-07-01', side: 'right', angleDeg: 50 }), m({ date: '2026-08-01', side: 'right', angleDeg: 60 }), m({ date: '2026-08-01', side: 'right', angleDeg: 62 })];
    expect(healthyReference(old, 'wrist_extension', 'right', TODAY)).toEqual({ value: 61, stale: true, lastDate: '2026-08-01', count: 2 });
  });
  it('is null without healthy-side data', () => {
    expect(healthyReference(list, 'wrist_extension', 'left', TODAY)).toMatchObject({ value: 40 });
    expect(healthyReference([], 'wrist_extension', 'right', TODAY)).toBeNull();
  });
});

describe('injuredSeries / movementSymmetry', () => {
  const list = [
    m({ date: '2026-08-20', side: 'right', angleDeg: 66 }),
    m({ date: '2026-09-01', side: 'left', angleDeg: 33, timing: 'pre' }),
    m({ date: '2026-09-04', side: 'left', angleDeg: 40, timing: 'pre' }),
    m({ date: '2026-09-20', side: 'right', angleDeg: 66 }),
    m({ date: '2026-09-30', side: 'left', angleDeg: 50, timing: 'pre' }),
    m({ date: '2026-09-30', side: 'left', angleDeg: 54, timing: 'post' }),
  ];
  it('uses the reference that applied on each measurement date', () => {
    const s = injuredSeries(list, 'wrist_extension', 'left');
    expect(s.map((p) => [p.date, p.angle])).toEqual([
      ['2026-09-01', 33],
      ['2026-09-04', 40],
      ['2026-09-30', 54], // latest of the day
    ]);
    expect(s[0].sym).toMatchObject({ percent: 50 });
  });
  it('filters by timing', () => {
    expect(injuredSeries(list, 'wrist_extension', 'left', 'pre').map((p) => p.angle)).toEqual([33, 40, 50]);
    expect(injuredSeries(list, 'wrist_extension', 'left', 'post').map((p) => p.angle)).toEqual([54]);
    expect(injuredSeries([...list, m({ date: '2026-09-10', side: 'left', angleDeg: 45 })], 'wrist_extension', 'left', 'unspecified').map((p) => p.angle)).toEqual([45]);
  });
  it('current value and 4-week change in points', () => {
    const ms = movementSymmetry(list, 'wrist_extension', 'left', TODAY, 'pre');
    expect(ms.current).toMatchObject({ status: 'ok', percent: 75.8 });
    // baseline = latest point on/before today−28 (2026-09-04): 40/66 = 60.6%
    expect(ms.baselineDate).toBe('2026-09-04');
    expect(ms.change).toBe(15.2);
    expect(ms.healthyNow).toMatchObject({ value: 66, stale: false });
  });
  it('falls back to the first point inside the window, and is null with a single point', () => {
    const inWindow = [m({ date: '2026-09-20', side: 'right', angleDeg: 60 }), m({ date: '2026-09-21', side: 'left', angleDeg: 30 }), m({ date: '2026-09-30', side: 'left', angleDeg: 45 })];
    expect(movementSymmetry(inWindow, 'wrist_extension', 'left', TODAY)).toMatchObject({ change: 25, baselineDate: '2026-09-21' });
    expect(movementSymmetry(inWindow.slice(0, 2), 'wrist_extension', 'left', TODAY).change).toBeNull();
  });
  it('no injured data', () => {
    expect(movementSymmetry([], 'wrist_extension', 'left', TODAY)).toMatchObject({ current: { status: 'no_injured' }, change: null });
  });
  it('deficit change is in degrees (negative = improvement)', () => {
    const knee = [
      m({ date: '2026-08-01', side: 'right', angleDeg: 90, movement: 'knee_extension', region: 'knee' }),
      m({ date: '2026-08-30', side: 'left', angleDeg: 70, movement: 'knee_extension', region: 'knee' }),
      m({ date: '2026-09-30', side: 'left', angleDeg: 84, movement: 'knee_extension', region: 'knee' }),
    ];
    const ms = movementSymmetry(knee, 'knee_extension', 'left', TODAY);
    expect(ms.current).toMatchObject({ mode: 'deficit', deficit: 6, stale: true });
    expect(ms.change).toBe(-14);
  });
  it('needsHealthyMeasurement when missing or stale', () => {
    expect(needsHealthyMeasurement(list, 'wrist_extension', 'left', TODAY)).toBe(false);
    expect(needsHealthyMeasurement(list, 'wrist_extension', 'left', '2026-11-01')).toBe(true);
    expect(needsHealthyMeasurement(list, 'wrist_flexion', 'left', TODAY)).toBe(true);
  });
});

describe('regionSymmetry', () => {
  it('is null for regions without an injured side', () => {
    expect(regionSymmetry([], 'knee', settings, TODAY)).toBeNull();
    expect(symmetrySummary([], settings, TODAY).map((r) => r.region)).toEqual(['wrist', 'ankle']);
  });
  it('headline is the primary movement with progress toward the target', () => {
    const list = [
      m({ date: '2026-09-20', side: 'right', angleDeg: 60 }),
      m({ date: '2026-09-30', side: 'left', angleDeg: 45 }),
      m({ date: '2026-09-20', side: 'right', angleDeg: 80, movement: 'wrist_flexion' }),
      m({ date: '2026-10-01', side: 'left', angleDeg: 72, movement: 'wrist_flexion' }),
    ];
    const r = regionSymmetry(list, 'wrist', settings, TODAY)!;
    expect(r.headline?.movement).toBe('wrist_extension');
    expect(r.headline?.current).toMatchObject({ percent: 75 });
    expect(r.progress).toBeCloseTo(75 / 90, 5);
    expect(r.movements.map((x) => x.movement)).toEqual(['wrist_flexion', 'wrist_extension']);
  });
  it('falls back to the latest ratio movement when the primary has no result', () => {
    const list = [m({ date: '2026-09-20', side: 'right', angleDeg: 80, movement: 'wrist_flexion' }), m({ date: '2026-10-01', side: 'left', angleDeg: 72, movement: 'wrist_flexion' })];
    const r = regionSymmetry(list, 'wrist', settings, TODAY)!;
    expect(r.headline?.movement).toBe('wrist_flexion');
    expect(r.progress).toBe(1); // 90% of a 90% target
  });
  it('has no headline without healthy data', () => {
    const r = regionSymmetry([m({ date: '2026-10-01', side: 'left', angleDeg: 40 })], 'wrist', settings, TODAY)!;
    expect(r.headline).toBeNull();
    expect(r.progress).toBeNull();
    expect(r.movements[0].current).toEqual({ status: 'no_healthy', injured: 40 });
  });
});

describe('symmetryReportRows', () => {
  it('one row per movement and timing with first/last and difference', () => {
    const list = [
      m({ date: '2026-09-01', side: 'right', angleDeg: 60, movement: 'ankle_dorsiflexion', region: 'ankle' }),
      m({ date: '2026-09-02', side: 'left', angleDeg: 20, movement: 'ankle_dorsiflexion', region: 'ankle' }), // healthy side for ankle (injured right)
      m({ date: '2026-09-05', side: 'right', angleDeg: 10, movement: 'ankle_dorsiflexion', region: 'ankle', timing: 'pre' }),
      m({ date: '2026-09-25', side: 'right', angleDeg: 15, movement: 'ankle_dorsiflexion', region: 'ankle', timing: 'pre' }),
      m({ date: '2026-09-25', side: 'right', angleDeg: 17, movement: 'ankle_dorsiflexion', region: 'ankle', timing: 'post' }),
    ];
    const rows = symmetryReportRows(list, settings, '2026-09-03', '2026-09-30');
    expect(rows.map((r) => [r.movement, r.timing, r.first.angle, r.last.angle, r.diff])).toEqual([
      ['ankle_dorsiflexion', 'pre', 10, 15, 25],
      ['ankle_dorsiflexion', 'post', 17, 17, null],
    ]);
    expect(rows[0].last.sym).toMatchObject({ percent: 75 });
  });
});
