import type { PainMap, Region, RomMeasurement, RomMovement, RomTiming, Session } from '../db/types';
import { addDays, daysBetween, startOfWeek } from './dates';

export type RegionFilter = Region | 'all';
export type TimeRange = '4w' | '3m' | 'all';

export function finishedSessions(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.endedAt != null).sort((a, b) => a.startedAt - b.startedAt);
}

/** Pain for one region, or the mean across regions present in the map. */
export function painValue(map: PainMap | undefined, region: RegionFilter): number | null {
  if (!map) return null;
  if (region !== 'all') return map[region] ?? null;
  const vals = Object.values(map).filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return null;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function sessionIncludesRegion(s: Session, region: RegionFilter): boolean {
  if (region === 'all') return true;
  return (s.regions ?? []).includes(region) || s.painBefore?.[region] != null || s.painAfter?.[region] != null;
}

export function rangeStart(range: TimeRange, today: string): string | undefined {
  if (range === '4w') return addDays(today, -27);
  if (range === '3m') return addDays(today, -90);
  return undefined;
}

export function filterSessions(sessions: Session[], region: RegionFilter, from?: string): Session[] {
  return finishedSessions(sessions).filter((s) => sessionIncludesRegion(s, region) && (!from || s.date >= from));
}

export interface PainSeries {
  x: number[]; // seconds (uPlot time axis)
  dates: string[];
  before: (number | null)[];
  after: (number | null)[];
  morning: (number | null)[];
}

export function painSeries(sessions: Session[], region: RegionFilter, from?: string): PainSeries {
  const list = filterSessions(sessions, region, from);
  return {
    x: list.map((s) => Math.floor(s.startedAt / 1000)),
    dates: list.map((s) => s.date),
    before: list.map((s) => painValue(s.painBefore, region)),
    after: list.map((s) => painValue(s.painAfter, region)),
    morning: list.map((s) => painValue(s.painNextMorning, region)),
  };
}

export interface WeekCount {
  weekStart: string;
  count: number;
}

/** Sessions per ISO week (Mon–Sun), contiguous from the first week to the current week. */
export function weeklyCounts(sessions: Session[], region: RegionFilter, today: string, from?: string): WeekCount[] {
  const list = filterSessions(sessions, region, from);
  const firstDate = from ?? list[0]?.date;
  if (!firstDate) return [];
  const counts = new Map<string, number>();
  for (const s of list) {
    const w = startOfWeek(s.date);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const out: WeekCount[] = [];
  const end = startOfWeek(today);
  for (let w = startOfWeek(firstDate); w <= end; w = addDays(w, 7)) {
    out.push({ weekStart: w, count: counts.get(w) ?? 0 });
  }
  return out;
}

export type Trend = 'up' | 'down' | 'flat';

/** Mean of all before/after pain values of a session. */
export function sessionPainMean(s: Session): number | null {
  const vals = [...Object.values(s.painBefore ?? {}), ...Object.values(s.painAfter ?? {})].filter(
    (v): v is number => typeof v === 'number',
  );
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function mean(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export interface WeeklySummary {
  count: number;
  avgThis: number | null;
  avgPrev: number | null;
  trend: Trend | null;
}

/** Last 7 days (incl. today) vs. the 7 days before. Trend needs both windows; ±0.5 is "flat". */
export function weeklySummary(sessions: Session[], today: string): WeeklySummary {
  const list = finishedSessions(sessions);
  const inWindow = (s: Session, startAgo: number, endAgo: number) => {
    const d = daysBetween(s.date, today);
    return d >= endAgo && d <= startAgo;
  };
  const thisWeek = list.filter((s) => inWindow(s, 6, 0));
  const prevWeek = list.filter((s) => inWindow(s, 13, 7));
  const avgThis = mean(thisWeek.map(sessionPainMean).filter((v): v is number => v != null));
  const avgPrev = mean(prevWeek.map(sessionPainMean).filter((v): v is number => v != null));
  let trend: Trend | null = null;
  if (avgThis != null && avgPrev != null) {
    const d = avgThis - avgPrev;
    trend = d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat';
  }
  return {
    count: thisWeek.length,
    avgThis: avgThis == null ? null : round1(avgThis),
    avgPrev: avgPrev == null ? null : round1(avgPrev),
    trend,
  };
}

/**
 * The session whose next-morning pain should be asked: the last finished session before
 * today (the day's last one if there were several), if any of its regions is still missing.
 */
export function morningPainTarget(sessions: Session[], today: string): Session | null {
  const before = finishedSessions(sessions).filter((s) => s.date < today);
  const last = before[before.length - 1];
  if (!last) return null;
  const regions = new Set<Region>([...(last.regions ?? []), ...(Object.keys(last.painBefore ?? {}) as Region[])]);
  const missing = [...regions].some((r) => last.painNextMorning?.[r] == null);
  return missing ? last : null;
}

/** Days since the last backup; falls back to the install time when never backed up. */
export function daysSinceBackup(lastBackupAt: number | undefined, installedAt: number, now: number): number {
  const ref = lastBackupAt ?? installedAt;
  return Math.floor((now - ref) / 86_400_000);
}

export function backupOverdue(lastBackupAt: number | undefined, installedAt: number, reminderDays: number, now: number): boolean {
  return daysSinceBackup(lastBackupAt, installedAt, now) >= reminderDays;
}

// ---------- Load / volume ----------

export type LoadMetric = 'volume' | 'reps' | 'hold' | 'duration';

export const LOAD_METRIC_LABEL: Record<LoadMetric, { title: string; unit: string }> = {
  volume: { title: 'Toplam hacim (set × tekrar × kg)', unit: 'kg' },
  reps: { title: 'Toplam tekrar', unit: 'tekrar' },
  hold: { title: 'En uzun tutuş', unit: 'sn' },
  duration: { title: 'En uzun süre', unit: 'sn' },
};

export interface LoadExercise {
  exerciseId: string;
  name: string;
  region?: Region;
}

/** Exercises that have at least one completed set in the filtered sessions. */
export function exercisesWithLoad(sessions: Session[], region: RegionFilter, from?: string): LoadExercise[] {
  const seen = new Map<string, LoadExercise>();
  for (const s of filterSessions(sessions, region, from)) {
    for (const e of s.entries) {
      if (region !== 'all' && e.region && e.region !== region) continue;
      if (!e.sets.some((x) => x.done)) continue;
      seen.set(e.exerciseId, { exerciseId: e.exerciseId, name: e.name ?? 'Egzersiz', region: e.region });
    }
  }
  return [...seen.values()];
}

export interface LoadSeries {
  metric: LoadMetric;
  dates: string[];
  values: number[];
}

/**
 * Per session: reps → Σ reps×kg when any set in range carries a load (else Σ reps);
 * hold → max hold seconds; timed → max duration seconds. Only completed sets count.
 */
export function loadSeries(sessions: Session[], exerciseId: string, from?: string): LoadSeries {
  const rows = filterSessions(sessions, 'all', from)
    .map((s) => ({ s, e: s.entries.find((x) => x.exerciseId === exerciseId) }))
    .filter((r): r is { s: Session; e: NonNullable<typeof r.e> } => !!r.e && r.e.sets.some((x) => x.done));
  const kind = rows.find((r) => r.e.kind)?.e.kind ?? 'reps';
  const anyLoad = rows.some((r) => r.e.sets.some((x) => x.done && (x.loadKg ?? 0) > 0));
  const metric: LoadMetric = kind === 'hold' ? 'hold' : kind === 'timed' ? 'duration' : anyLoad ? 'volume' : 'reps';
  const values = rows.map(({ e }) => {
    const done = e.sets.filter((x) => x.done);
    switch (metric) {
      case 'volume':
        return round1(done.reduce((a, x) => a + (x.reps ?? 0) * (x.loadKg ?? 0), 0));
      case 'reps':
        return done.reduce((a, x) => a + (x.reps ?? 0), 0);
      case 'hold':
        return Math.max(0, ...done.map((x) => x.holdSec ?? 0));
      case 'duration':
        return Math.max(0, ...done.map((x) => x.durationSec ?? 0));
    }
  });
  return { metric, dates: rows.map((r) => r.s.date), values };
}

// ---------- ROM ----------

export interface RomSeries {
  dates: string[];
  left: (number | null)[];
  right: (number | null)[];
}

/** 'all' also includes measurements without a timing (taken before timings existed). */
export type RomTimingFilter = RomTiming | 'all';

export function matchesTiming(r: Pick<RomMeasurement, 'timing'>, timing: RomTimingFilter): boolean {
  return timing === 'all' || r.timing === timing;
}

/** One point per date and side (the latest measurement of that day wins). */
export function romSeries(rom: RomMeasurement[], movement: RomMovement, from?: string, timing: RomTimingFilter = 'all'): RomSeries {
  const list = rom
    .filter((r) => r.movement === movement && (!from || r.date >= from) && matchesTiming(r, timing))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const dates = [...new Set(list.map((r) => r.date))];
  const pick = (side: 'left' | 'right') =>
    dates.map((d) => {
      const day = list.filter((r) => r.date === d && r.side === side);
      return day.length ? day[day.length - 1].angleDeg : null;
    });
  return { dates, left: pick('left'), right: pick('right') };
}

/**
 * Default timing for a new measurement: "post" if a session finished within the last
 * `windowMs` (the user is most likely measuring right after training), else "pre".
 */
export function defaultRomTiming(sessions: Pick<Session, 'endedAt'>[], now: number, windowMs = 3 * 3_600_000): RomTiming {
  return sessions.some((s) => s.endedAt != null && s.endedAt <= now && now - s.endedAt <= windowMs) ? 'post' : 'pre';
}

/** True if no ROM measurement exists in the last 7 days (incl. today). */
export function romDue(rom: RomMeasurement[], today: string): boolean {
  return !rom.some((r) => {
    const d = daysBetween(r.date, today);
    return d >= 0 && d <= 6;
  });
}
