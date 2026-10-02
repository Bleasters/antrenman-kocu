import { describe, expect, it } from 'vitest';
import type { Session } from '../src/db/types';
import { addDays, daysBetween, formatShortTR, startOfWeek, toISODate } from '../src/logic/dates';
import {
  backupOverdue,
  daysSinceBackup,
  morningPainTarget,
  painSeries,
  painValue,
  rangeStart,
  weeklyCounts,
  weeklySummary,
} from '../src/logic/stats';

let n = 0;
function s(date: string, p: Partial<Session> = {}): Session {
  n++;
  const startedAt = Date.parse(`${date}T10:00:00Z`) + n;
  return {
    id: `s${n}`,
    createdAt: startedAt,
    updatedAt: startedAt,
    date,
    startedAt,
    endedAt: startedAt + 1000,
    regions: ['ankle'],
    painBefore: { ankle: 2 },
    painAfter: { ankle: 3 },
    entries: [],
    ...p,
  };
}

describe('dates', () => {
  it('formats in Europe/Istanbul (UTC+3)', () => {
    expect(toISODate(Date.parse('2026-03-01T21:30:00Z'))).toBe('2026-03-02');
    expect(toISODate(Date.parse('2026-03-01T20:59:00Z'))).toBe('2026-03-01');
  });
  it('adds days across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });
  it('startOfWeek returns Monday', () => {
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // Sunday
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28'); // Monday
    expect(formatShortTR('2026-10-02')).toBe('2 Eki');
  });
});

describe('painValue / painSeries', () => {
  it('returns the region value or the mean across regions', () => {
    expect(painValue({ ankle: 3, knee: 4 }, 'ankle')).toBe(3);
    expect(painValue({ ankle: 3, knee: 4 }, 'all')).toBe(3.5);
    expect(painValue({}, 'all')).toBeNull();
    expect(painValue(undefined, 'knee')).toBeNull();
  });

  it('builds sorted series, skipping unfinished and other-region sessions', () => {
    const a = s('2026-01-02', { painNextMorning: { ankle: 1 } });
    const b = s('2026-01-01');
    const c = s('2026-01-03', { endedAt: undefined });
    const d = s('2026-01-04', { regions: ['wrist'], painBefore: { wrist: 5 }, painAfter: { wrist: 6 } });
    const series = painSeries([a, b, c, d], 'ankle');
    expect(series.dates).toEqual(['2026-01-01', '2026-01-02']);
    expect(series.before).toEqual([2, 2]);
    expect(series.after).toEqual([3, 3]);
    expect(series.morning).toEqual([null, 1]);
    expect(painSeries([a, b, c, d], 'all').dates).toHaveLength(3);
    expect(painSeries([a, b, c, d], 'all', '2026-01-02').dates).toEqual(['2026-01-02', '2026-01-04']);
  });

  it('rangeStart', () => {
    expect(rangeStart('4w', '2026-10-02')).toBe('2026-09-05');
    expect(rangeStart('3m', '2026-10-02')).toBe('2026-07-04');
    expect(rangeStart('all', '2026-10-02')).toBeUndefined();
  });
});

describe('weeklyCounts', () => {
  it('fills empty weeks up to the current week', () => {
    const list = [s('2026-09-14'), s('2026-09-15'), s('2026-09-29')];
    expect(weeklyCounts(list, 'all', '2026-10-02')).toEqual([
      { weekStart: '2026-09-14', count: 2 },
      { weekStart: '2026-09-21', count: 0 },
      { weekStart: '2026-09-28', count: 1 },
    ]);
  });
  it('is empty without sessions and no range', () => {
    expect(weeklyCounts([], 'all', '2026-10-02')).toEqual([]);
  });
});

describe('weeklySummary', () => {
  it('counts the last 7 days and computes the trend', () => {
    const list = [
      s('2026-09-20', { painBefore: { ankle: 4 }, painAfter: { ankle: 6 } }), // prev window (12 days ago)
      s('2026-09-26', { painBefore: { ankle: 1 }, painAfter: { ankle: 1 } }), // this window (6 days ago)
      s('2026-10-02', { painBefore: { ankle: 1 }, painAfter: { ankle: 3 } }),
    ];
    const w = weeklySummary(list, '2026-10-02');
    expect(w.count).toBe(2);
    expect(w.avgThis).toBe(1.5);
    expect(w.avgPrev).toBe(5);
    expect(w.trend).toBe('down');
  });
  it('flat within ±0.5 and null without a previous week', () => {
    expect(weeklySummary([s('2026-09-24'), s('2026-10-01')], '2026-10-02').trend).toBe('flat');
    expect(weeklySummary([s('2026-10-01')], '2026-10-02').trend).toBeNull();
  });
});

describe('morningPainTarget', () => {
  it('returns the last session before today when morning pain is missing', () => {
    const a = s('2026-09-29');
    const b1 = s('2026-09-30');
    const b2 = s('2026-09-30');
    const today = s('2026-10-02');
    expect(morningPainTarget([a, b1, b2, today], '2026-10-02')?.id).toBe(b2.id);
  });
  it('returns null when already filled or no earlier session', () => {
    expect(morningPainTarget([s('2026-10-01', { painNextMorning: { ankle: 1 } })], '2026-10-02')).toBeNull();
    expect(morningPainTarget([s('2026-10-02')], '2026-10-02')).toBeNull();
  });
  it('is still asked when only some regions are filled', () => {
    const x = s('2026-10-01', { regions: ['ankle', 'knee'], painBefore: { ankle: 1, knee: 1 }, painNextMorning: { ankle: 1 } });
    expect(morningPainTarget([x], '2026-10-02')?.id).toBe(x.id);
  });
});

describe('backup reminder', () => {
  const day = 86_400_000;
  it('uses install time when never backed up', () => {
    expect(daysSinceBackup(undefined, 0, 3 * day)).toBe(3);
    expect(backupOverdue(undefined, 0, 7, 6 * day)).toBe(false);
    expect(backupOverdue(undefined, 0, 7, 7 * day)).toBe(true);
  });
  it('uses lastBackupAt when present', () => {
    expect(backupOverdue(10 * day, 0, 7, 16 * day)).toBe(false);
    expect(backupOverdue(10 * day, 0, 7, 17 * day)).toBe(true);
  });
});
