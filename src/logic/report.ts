/** Data for the printable doctor report (pure). */
import type { RedFlag, Region, RomMeasurement, RomMovement, Session, Side } from '../db/types';
import { REGIONS } from '../db/types';
import { evaluateHistory, type RuleLevel, type RuleSettings } from './painRules';
import { finishedSessions, sessionIncludesRegion, type Trend } from './stats';

export interface PainRow {
  region: Region;
  n: number;
  before: number | null;
  after: number | null;
  morning: number | null;
  trend: Trend | null;
  points: { date: string; before: number | null; after: number | null }[];
}

export interface RomRow {
  movement: RomMovement;
  side: Side;
  n: number;
  first: { date: string; angle: number };
  last: { date: string; angle: number };
  diff: number;
  points: { date: string; angle: number }[];
}

export interface ReportData {
  from: string;
  to: string;
  sessionCount: number;
  byRegion: Record<Region, number>;
  levels: Record<RuleLevel, number> & { provisional: number };
  pain: PainRow[];
  rom: RomRow[];
  redFlags: { date: string; flags: RedFlag[]; notes?: string }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
function avg(values: (number | undefined | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number');
  return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** First half vs second half of the period (by session order); ±0.5 counts as flat. */
export function halfTrend(values: number[]): Trend | null {
  if (values.length < 2) return null;
  const mid = Math.floor(values.length / 2);
  const a = values.slice(0, mid);
  const b = values.slice(values.length - mid);
  const d = b.reduce((x, y) => x + y, 0) / b.length - a.reduce((x, y) => x + y, 0) / a.length;
  return d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat';
}

export function buildReport(input: {
  sessions: Session[];
  rom: RomMeasurement[];
  settings: RuleSettings;
  from: string;
  to: string;
}): ReportData {
  const { from, to } = input;
  const inRange = (d: string) => d >= from && d <= to;
  const sessions = finishedSessions(input.sessions).filter((s) => inRange(s.date));
  const ids = new Set(sessions.map((s) => s.id));
  // evaluate over full history so streaks are correct, then keep the period
  const evals = evaluateHistory(input.sessions, input.settings).filter((e) => ids.has(e.sessionId));

  const levels = { green: 0, orange: 0, red: 0, provisional: 0 };
  for (const e of evals) {
    levels[e.level]++;
    if (e.provisional) levels.provisional++;
  }

  const byRegion = { wrist: 0, ankle: 0, knee: 0 } as Record<Region, number>;
  const pain: PainRow[] = [];
  for (const region of REGIONS) {
    const list = sessions.filter((s) => sessionIncludesRegion(s, region));
    byRegion[region] = list.length;
    if (!list.length) continue;
    const perSession = list
      .map((s) => {
        const vals = [s.painBefore[region], s.painAfter[region]].filter((v): v is number => v != null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      })
      .filter((v): v is number => v != null);
    pain.push({
      region,
      n: list.length,
      before: avg(list.map((s) => s.painBefore[region])),
      after: avg(list.map((s) => s.painAfter[region])),
      morning: avg(list.map((s) => s.painNextMorning?.[region])),
      trend: halfTrend(perSession),
      points: list.map((s) => ({ date: s.date, before: s.painBefore[region] ?? null, after: s.painAfter[region] ?? null })),
    });
  }

  const romRows: RomRow[] = [];
  const groups = new Map<string, RomMeasurement[]>();
  for (const m of input.rom.filter((m) => inRange(m.date))) {
    const k = `${m.movement}|${m.side}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const first = list[0];
    const last = list[list.length - 1];
    romRows.push({
      movement: first.movement,
      side: first.side,
      n: list.length,
      first: { date: first.date, angle: first.angleDeg },
      last: { date: last.date, angle: last.angleDeg },
      diff: r1(last.angleDeg - first.angleDeg),
      points: list.map((m) => ({ date: m.date, angle: m.angleDeg })),
    });
  }
  romRows.sort((a, b) => a.movement.localeCompare(b.movement) || a.side.localeCompare(b.side));

  return {
    from,
    to,
    sessionCount: sessions.length,
    byRegion,
    levels,
    pain,
    rom: romRows,
    redFlags: sessions
      .filter((s) => (s.redFlags?.length ?? 0) > 0)
      .map((s) => ({ date: s.date, flags: s.redFlags!, notes: s.notes })),
  };
}

