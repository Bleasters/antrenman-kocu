import { describe, expect, it } from 'vitest';
import {
  analyzeWindow,
  angleBetweenDeg,
  maxAxisStdDev,
  median,
  meanVector,
  MOVEMENTS,
  movementsFor,
  roundAngle,
  type Vec3,
} from '../src/logic/rom';

const G = 9.81;
const rad = (d: number) => (d * Math.PI) / 180;
/** gravity vector of a phone tilted by deg around its x axis */
const tilted = (deg: number): Vec3 => [0, G * Math.sin(rad(deg)), G * Math.cos(rad(deg))];

describe('angleBetweenDeg', () => {
  it('is 0 for identical vectors', () => {
    expect(angleBetweenDeg([0, 0, G], [0, 0, G])).toBeCloseTo(0, 6);
  });
  it('recovers known tilts', () => {
    for (const d of [5, 15, 30, 45, 60, 90, 120, 150, 180]) {
      expect(angleBetweenDeg(tilted(0), tilted(d))).toBeCloseTo(d, 6);
    }
  });
  it('is independent of the starting orientation and magnitude', () => {
    expect(angleBetweenDeg(tilted(20), tilted(55))).toBeCloseTo(35, 6);
    expect(angleBetweenDeg([1, 0, 0], [0, 5, 0])).toBeCloseTo(90, 6);
  });
  it('is invariant to axis sign conventions (iOS vs Android)', () => {
    const a = tilted(10);
    const b = tilted(40);
    const flip = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
    expect(angleBetweenDeg(flip(a), flip(b))).toBeCloseTo(30, 6);
  });
  it('clamps float error and handles zero vectors', () => {
    const v: Vec3 = [0.1, 0.2, 9.8];
    expect(Number.isNaN(angleBetweenDeg(v, v))).toBe(false);
    expect(angleBetweenDeg([0, 0, 0], v)).toBeNaN();
  });
});

describe('window analysis', () => {
  const noisy = (base: Vec3, amp: number, n = 60): Vec3[] =>
    Array.from({ length: n }, (_, i) => {
      const e = amp * Math.sin(i * 1.7);
      return [base[0] + e, base[1] - e, base[2] + e / 2];
    });

  it('averages a steady window', () => {
    const r = analyzeWindow(noisy(tilted(30), 0.03));
    expect(r.ok).toBe(true);
    if (r.ok) expect(angleBetweenDeg(r.vector, tilted(30))).toBeLessThan(0.5);
  });
  it('rejects a shaky window', () => {
    expect(analyzeWindow(noisy(tilted(30), 1.2))).toMatchObject({ ok: false, reason: 'unstable' });
  });
  it('rejects too few samples', () => {
    expect(analyzeWindow(noisy(tilted(0), 0, 5))).toMatchObject({ ok: false, reason: 'insufficient' });
    expect(analyzeWindow([])).toMatchObject({ ok: false, reason: 'insufficient' });
  });
  it('rejects a window that is not gravity (phone accelerating)', () => {
    expect(analyzeWindow(noisy([0, 0, 4], 0.01))).toMatchObject({ ok: false, reason: 'not_gravity' });
  });
  it('ignores non-finite samples', () => {
    const s = noisy(tilted(0), 0.01);
    s.push([NaN, 0, 0]);
    expect(analyzeWindow(s).ok).toBe(true);
  });
  it('meanVector and std', () => {
    expect(meanVector([[0, 0, 0], [2, 4, 6]])).toEqual([1, 2, 3]);
    expect(maxAxisStdDev([[0, 0, 0], [0, 2, 0]])).toBeCloseTo(1, 6);
  });
});

describe('median / rounding', () => {
  it('median of 3 resists one outlier', () => {
    expect(median([30, 31, 55])).toBe(31);
    expect(median([2, 1])).toBe(1.5);
    expect(median([])).toBeNaN();
  });
  it('rounds to 0.1°', () => {
    expect(roundAngle(12.345)).toBe(12.3);
  });
});

describe('movements', () => {
  it('every movement belongs to its region and has a placement text', () => {
    expect(movementsFor('ankle')).toEqual(['ankle_dorsiflexion', 'ankle_plantarflexion']);
    expect(movementsFor('wrist')).toHaveLength(4);
    for (const m of Object.values(MOVEMENTS)) expect(m.placement.length).toBeGreaterThan(20);
  });
});
