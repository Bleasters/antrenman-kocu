/**
 * Limb symmetry: injured side vs. healthy side. Pure, UI-independent.
 *
 * - ratio   movements: symmetry index = injured / healthy × 100 (%).
 * - deficit movements: target is "full" range (e.g. knee extension), where a ratio is not
 *   meaningful; shown as degrees missing = healthy − injured (healthy side = full extension).
 *
 * The healthy side is measured once: its latest measurement (median of that day) is the
 * reference for every injured-side measurement, past and future, regardless of date or
 * pre/post-training timing. Measuring it again simply replaces the reference.
 */
import type { InjuredSide, Region, RomMeasurement, RomMovement, RomTiming, Side } from '../db/types';
import { REGIONS } from '../db/types';
import { addDays } from './dates';
import { median, movementsFor } from './rom';

export type SymmetryMode = 'ratio' | 'deficit';
/** 'unspecified' = measurements saved before the pre/post option existed */
export type SymmetryTiming = RomTiming | 'all' | 'unspecified';

/** Which calculation each movement uses. */
export const SYMMETRY_CONFIG: Record<RomMovement, { mode: SymmetryMode }> = {
  wrist_flexion: { mode: 'ratio' },
  wrist_extension: { mode: 'ratio' },
  wrist_radial_dev: { mode: 'ratio' },
  wrist_ulnar_dev: { mode: 'ratio' },
  ankle_dorsiflexion: { mode: 'ratio' },
  ankle_plantarflexion: { mode: 'ratio' },
  knee_flexion: { mode: 'ratio' },
  knee_extension: { mode: 'deficit' },
};

/** The movement whose symmetry represents the region (falls back to the latest measured one). */
export const PRIMARY_MOVEMENT: Record<Region, RomMovement> = {
  wrist: 'wrist_extension',
  ankle: 'ankle_dorsiflexion',
  knee: 'knee_flexion',
};

export const CHANGE_WINDOW_DAYS = 28;

export const otherSide = (s: Side): Side => (s === 'left' ? 'right' : 'left');

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface HealthyRef {
  value: number;
  lastDate: string;
  count: number;
}

/**
 * The healthy-side reference: the latest healthy-side measurement day (median if several
 * on that day). Date and pre/post timing do not matter — it applies everywhere.
 */
export function healthyReference(rom: RomMeasurement[], movement: RomMovement, healthySide: Side): HealthyRef | null {
  const list = rom.filter((m) => m.movement === movement && m.side === healthySide);
  if (list.length === 0) return null;
  const lastDate = list.reduce((d, m) => (m.date > d ? m.date : d), list[0].date);
  const lastDay = list.filter((m) => m.date === lastDate);
  return { value: r1(median(lastDay.map((m) => m.angleDeg))), lastDate, count: lastDay.length };
}

export type Symmetry =
  | { status: 'ok'; mode: 'ratio'; injured: number; healthy: number; percent: number; healthyDate: string }
  | { status: 'ok'; mode: 'deficit'; injured: number; healthy: number; deficit: number; healthyDate: string }
  | { status: 'no_healthy'; injured: number }
  | { status: 'no_injured' };

/**
 * ratio:   percent = injured / healthy × 100; a healthy value ≤ 0 means "no data" (no division by zero).
 * deficit: degrees missing to the healthy side (never negative).
 */
export function computeSymmetry(injured: number, ref: HealthyRef | null, mode: SymmetryMode): Symmetry {
  if (!ref) return { status: 'no_healthy', injured };
  if (mode === 'deficit') {
    return { status: 'ok', mode, injured, healthy: ref.value, deficit: r1(Math.max(0, ref.value - injured)), healthyDate: ref.lastDate };
  }
  if (!(ref.value > 0)) return { status: 'no_healthy', injured };
  return { status: 'ok', mode, injured, healthy: ref.value, percent: r1((injured / ref.value) * 100), healthyDate: ref.lastDate };
}

const timingMatches = (m: RomMeasurement, t: SymmetryTiming) => t === 'all' || (t === 'unspecified' ? !m.timing : m.timing === t);

export interface SymmetryPoint {
  date: string;
  angle: number;
  timing?: RomTiming;
  sym: Symmetry;
}

/** Injured-side measurements (latest per day) with the symmetry against the reference of that day. */
export function injuredSeries(
  rom: RomMeasurement[],
  movement: RomMovement,
  injuredSide: Side,
  timing: SymmetryTiming = 'all',
  from?: string,
  to?: string,
): SymmetryPoint[] {
  const mode = SYMMETRY_CONFIG[movement].mode;
  const ref = healthyReference(rom, movement, otherSide(injuredSide));
  const list = rom
    .filter((m) => m.movement === movement && m.side === injuredSide && timingMatches(m, timing) && (!from || m.date >= from) && (!to || m.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const byDay = new Map<string, RomMeasurement>();
  for (const m of list) byDay.set(m.date, m); // latest of the day wins
  return [...byDay.values()].map((m) => ({
    date: m.date,
    angle: m.angleDeg,
    timing: m.timing,
    sym: computeSymmetry(m.angleDeg, ref, mode),
  }));
}

export interface MovementSymmetry {
  movement: RomMovement;
  mode: SymmetryMode;
  injuredSide: Side;
  healthySide: Side;
  current: Symmetry;
  currentDate?: string;
  currentTiming?: RomTiming;
  /** ratio: change in percentage points; deficit: change in degrees missing (negative = better) */
  change: number | null;
  baselineDate?: string;
  series: SymmetryPoint[];
  /** the healthy-side reference used for every point */
  healthyNow: HealthyRef | null;
}

function symValue(s: Symmetry): number | null {
  if (s.status !== 'ok') return null;
  return s.mode === 'ratio' ? s.percent : s.deficit;
}

export function movementSymmetry(
  rom: RomMeasurement[],
  movement: RomMovement,
  injuredSide: Side,
  today: string,
  timing: SymmetryTiming = 'all',
): MovementSymmetry {
  const mode = SYMMETRY_CONFIG[movement].mode;
  const healthySide = otherSide(injuredSide);
  const series = injuredSeries(rom, movement, injuredSide, timing, undefined, today);
  const last = series[series.length - 1];
  const current: Symmetry = last ? last.sym : { status: 'no_injured' };

  // Baseline for the 4-week change: latest point on/before today−28, else the first one in the window.
  let change: number | null = null;
  let baselineDate: string | undefined;
  if (last) {
    const cutoff = addDays(today, -CHANGE_WINDOW_DAYS);
    const before = series.filter((p) => p.date <= cutoff);
    const base = before.length ? before[before.length - 1] : series[0] !== last ? series[0] : undefined;
    const a = symValue(current);
    const b = base ? symValue(base.sym) : null;
    if (base && a != null && b != null) {
      change = r1(a - b);
      baselineDate = base.date;
    }
  }
  return {
    movement,
    mode,
    injuredSide,
    healthySide,
    current,
    currentDate: last?.date,
    currentTiming: last?.timing,
    change,
    baselineDate,
    series,
    healthyNow: healthyReference(rom, movement, healthySide),
  };
}

/** True only when the healthy side of this movement has never been measured. */
export function needsHealthyMeasurement(rom: RomMeasurement[], movement: RomMovement, injuredSide: Side): boolean {
  return healthyReference(rom, movement, otherSide(injuredSide)) === null;
}

export interface RegionSymmetry {
  region: Region;
  injuredSide: Side;
  target: number;
  /** movement shown as the region's headline (primary, else the most recent ratio result) */
  headline: MovementSymmetry | null;
  movements: MovementSymmetry[];
  /** headline percent / target, clamped to 0..1 */
  progress: number | null;
}

export interface SymmetrySettings {
  injuredSides: Record<Region, InjuredSide>;
  symmetryTargets: Record<Region, number>;
}

export function regionSymmetry(
  rom: RomMeasurement[],
  region: Region,
  settings: SymmetrySettings,
  today: string,
  timing: SymmetryTiming = 'all',
): RegionSymmetry | null {
  const injuredSide = settings.injuredSides[region];
  if (injuredSide === 'none') return null;
  const target = settings.symmetryTargets[region];
  const movements = movementsFor(region)
    .filter((mv) => rom.some((m) => m.movement === mv))
    .map((mv) => movementSymmetry(rom, mv, injuredSide, today, timing));

  const okRatio = (m: MovementSymmetry) => m.current.status === 'ok' && m.current.mode === 'ratio';
  const primary = movements.find((m) => m.movement === PRIMARY_MOVEMENT[region] && okRatio(m));
  const fallback = movements.filter(okRatio).sort((a, b) => (b.currentDate ?? '').localeCompare(a.currentDate ?? ''))[0];
  const headline = primary ?? fallback ?? null;
  const pct = headline && headline.current.status === 'ok' && headline.current.mode === 'ratio' ? headline.current.percent : null;
  return {
    region,
    injuredSide,
    target,
    headline,
    movements,
    progress: pct == null || !(target > 0) ? null : Math.min(1, Math.max(0, pct / target)),
  };
}

export function symmetrySummary(rom: RomMeasurement[], settings: SymmetrySettings, today: string, timing: SymmetryTiming = 'all'): RegionSymmetry[] {
  return REGIONS.map((r) => regionSymmetry(rom, r, settings, today, timing)).filter((r): r is RegionSymmetry => r !== null);
}

// ---------- Doctor report ----------

export interface SymmetryReportRow {
  movement: RomMovement;
  region: Region;
  mode: SymmetryMode;
  injuredSide: Side;
  timing?: RomTiming;
  first: SymmetryPoint;
  last: SymmetryPoint;
  /** ratio: points; deficit: degrees missing (negative = better). null if either end lacks a reference */
  diff: number | null;
}

/** One row per injured-region movement and timing with at least one injured-side measurement in range. */
export function symmetryReportRows(rom: RomMeasurement[], settings: Pick<SymmetrySettings, 'injuredSides'>, from: string, to: string): SymmetryReportRow[] {
  const rows: SymmetryReportRow[] = [];
  for (const region of REGIONS) {
    const injuredSide = settings.injuredSides[region];
    if (injuredSide === 'none') continue;
    for (const movement of movementsFor(region)) {
      for (const t of ['pre', 'post', 'unspecified'] as const) {
        const pts = injuredSeries(rom, movement, injuredSide, t, from, to);
        if (!pts.length) continue;
        const first = pts[0];
        const last = pts[pts.length - 1];
        const a = symValue(last.sym);
        const b = symValue(first.sym);
        rows.push({
          movement,
          region,
          mode: SYMMETRY_CONFIG[movement].mode,
          injuredSide,
          timing: t === 'unspecified' ? undefined : t,
          first,
          last,
          diff: a != null && b != null && pts.length > 1 ? r1(a - b) : null,
        });
      }
    }
  }
  return rows;
}
