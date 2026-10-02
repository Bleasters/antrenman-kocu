import { describe, expect, it } from 'vitest';
import type { Session } from '../src/db/types';
import {
  evaluateHistory,
  evaluateRegion,
  evaluateSession,
  reasonText,
  regionSummary,
  sessionRegions,
  worstLevel,
  type RuleSettings,
} from '../src/logic/painRules';

const S: RuleSettings = { painIncreaseThreshold: 2, painMaxDuring: 5, nextMorningMustReturn: true };

let counter = 0;
function session(p: Partial<Session> = {}): Session {
  counter++;
  return {
    id: `s${counter}`,
    createdAt: counter,
    updatedAt: counter,
    date: '2026-01-01',
    startedAt: counter * 1000,
    endedAt: counter * 1000 + 500,
    regions: ['ankle'],
    painBefore: { ankle: 2 },
    painAfter: { ankle: 2 },
    painNextMorning: { ankle: 2 },
    entries: [],
    ...p,
  };
}

describe('evaluateRegion — green', () => {
  it('is green when nothing is triggered', () => {
    const r = evaluateRegion(session(), 'ankle', S);
    expect(r.level).toBe('green');
    expect(r.reasons).toEqual([]);
    expect(r.provisional).toBe(false);
  });

  it('is green with no pain data at all (but provisional)', () => {
    const r = evaluateRegion(session({ painBefore: {}, painAfter: {}, painNextMorning: undefined }), 'ankle', S);
    expect(r.level).toBe('green');
    expect(r.provisional).toBe(true);
  });
});

describe('evaluateRegion — red flags', () => {
  it('any red flag gives red', () => {
    const r = evaluateRegion(session({ redFlags: ['numbness'] }), 'ankle', S);
    expect(r.level).toBe('red');
    expect(r.reasons).toEqual([{ code: 'red_flag', flags: ['numbness'] }]);
  });

  it('red flag overrides orange triggers and provisional state', () => {
    const r = evaluateRegion(
      session({
        redFlags: ['sudden_swelling', 'locking'],
        painBefore: { ankle: 1 },
        painAfter: { ankle: 9 },
        painNextMorning: undefined,
      }),
      'ankle',
      S,
    );
    expect(r.level).toBe('red');
    expect(r.reasons).toHaveLength(1);
    expect(r.provisional).toBe(false);
  });

  it('empty redFlags array is not red', () => {
    expect(evaluateRegion(session({ redFlags: [] }), 'ankle', S).level).toBe('green');
  });
});

describe('evaluateRegion — painMaxDuring', () => {
  const withDuring = (v: number) =>
    session({ entries: [{ exerciseId: 'e1', region: 'ankle', sets: [], painDuring: v }] });

  it('during pain exactly at the limit is green', () => {
    expect(evaluateRegion(withDuring(5), 'ankle', S).level).toBe('green');
  });

  it('during pain above the limit is orange', () => {
    const r = evaluateRegion(withDuring(6), 'ankle', S);
    expect(r.level).toBe('orange');
    expect(r.reasons).toEqual([{ code: 'pain_max_exceeded', source: 'during', value: 6, limit: 5 }]);
  });

  it('uses the max across entries of the region', () => {
    const s = session({
      entries: [
        { exerciseId: 'e1', region: 'ankle', sets: [], painDuring: 3 },
        { exerciseId: 'e2', region: 'ankle', sets: [], painDuring: 7 },
        { exerciseId: 'e3', region: 'ankle', sets: [] },
      ],
    });
    expect(evaluateRegion(s, 'ankle', S).reasons[0]).toMatchObject({ value: 7 });
  });

  it('ignores during pain from other regions', () => {
    const s = session({ entries: [{ exerciseId: 'e1', region: 'wrist', sets: [], painDuring: 9 }] });
    expect(evaluateRegion(s, 'ankle', S).level).toBe('green');
  });

  it('falls back to the lookup when an entry has no region snapshot', () => {
    const s = session({ entries: [{ exerciseId: 'e1', sets: [], painDuring: 8 }] });
    expect(evaluateRegion(s, 'ankle', S, () => 'ankle').level).toBe('orange');
    expect(evaluateRegion(s, 'ankle', S, () => 'knee').level).toBe('green');
    expect(evaluateRegion(s, 'ankle', S).level).toBe('green');
  });

  it('after pain exactly at the limit is green, above is orange', () => {
    expect(evaluateRegion(session({ painBefore: { ankle: 5 }, painAfter: { ankle: 5 }, painNextMorning: { ankle: 5 } }), 'ankle', S).level).toBe('green');
    const r = evaluateRegion(session({ painBefore: { ankle: 6 }, painAfter: { ankle: 6 }, painNextMorning: { ankle: 6 } }), 'ankle', S);
    expect(r.level).toBe('orange');
    expect(r.reasons).toEqual([{ code: 'pain_max_exceeded', source: 'after', value: 6, limit: 5 }]);
  });

  it('respects a custom painMaxDuring from settings', () => {
    expect(evaluateRegion(withDuring(6), 'ankle', { ...S, painMaxDuring: 6 }).level).toBe('green');
    expect(evaluateRegion(withDuring(4), 'ankle', { ...S, painMaxDuring: 3 }).level).toBe('orange');
  });
});

describe('evaluateRegion — pain increase', () => {
  const inc = (before: number, after: number, settings = S) =>
    evaluateRegion(session({ painBefore: { ankle: before }, painAfter: { ankle: after }, painNextMorning: { ankle: before } }), 'ankle', settings);

  it('increase exactly equal to the threshold is orange', () => {
    const r = inc(1, 3);
    expect(r.level).toBe('orange');
    expect(r.reasons).toEqual([{ code: 'pain_increase', before: 1, after: 3, delta: 2, threshold: 2 }]);
  });

  it('increase one below the threshold is green', () => {
    expect(inc(1, 2).level).toBe('green');
  });

  it('decrease is green', () => {
    expect(inc(4, 1).level).toBe('green');
  });

  it('respects a custom threshold', () => {
    expect(inc(1, 3, { ...S, painIncreaseThreshold: 3 }).level).toBe('green');
    expect(inc(1, 4, { ...S, painIncreaseThreshold: 3 }).level).toBe('orange');
    expect(inc(1, 2, { ...S, painIncreaseThreshold: 1 }).level).toBe('orange');
  });

  it('skips the rule when before or after is missing', () => {
    expect(evaluateRegion(session({ painBefore: {}, painAfter: { ankle: 5 } }), 'ankle', S).reasons).toEqual([]);
    expect(evaluateRegion(session({ painBefore: { ankle: 0 }, painAfter: {}, painNextMorning: { ankle: 0 } }), 'ankle', S).reasons).toEqual([]);
  });

  it('can report several reasons at once', () => {
    const r = inc(2, 8);
    expect(r.reasons.map((x) => x.code)).toEqual(['pain_max_exceeded', 'pain_increase']);
  });
});

describe('evaluateRegion — next morning', () => {
  const morning = (before: number, m: number | undefined, settings = S) =>
    evaluateRegion(
      session({ painBefore: { ankle: before }, painAfter: { ankle: before }, painNextMorning: m == null ? undefined : { ankle: m } }),
      'ankle',
      settings,
    );

  it('morning back at the pre-session level is green', () => {
    expect(morning(3, 3).level).toBe('green');
  });

  it('morning below pre-session is green', () => {
    expect(morning(3, 1).level).toBe('green');
  });

  it('morning one above pre-session is orange', () => {
    const r = morning(3, 4);
    expect(r.level).toBe('orange');
    expect(r.reasons).toEqual([{ code: 'next_morning_not_returned', before: 3, morning: 4 }]);
  });

  it('is ignored when nextMorningMustReturn is off', () => {
    const off = { ...S, nextMorningMustReturn: false };
    expect(morning(3, 6, off).level).toBe('green');
    expect(morning(3, undefined, off).provisional).toBe(false);
  });

  it('missing morning makes a green result provisional', () => {
    const r = morning(3, undefined);
    expect(r.level).toBe('green');
    expect(r.provisional).toBe(true);
  });

  it('missing morning for another region only does not make this region provisional', () => {
    const s = session({ regions: ['ankle', 'knee'], painBefore: { ankle: 1, knee: 1 }, painAfter: { ankle: 1, knee: 1 }, painNextMorning: { knee: 1 } });
    expect(evaluateRegion(s, 'ankle', S).provisional).toBe(true);
    expect(evaluateRegion(s, 'knee', S).provisional).toBe(false);
  });

  it('an orange result is final even without the morning value', () => {
    const r = evaluateRegion(session({ painBefore: { ankle: 1 }, painAfter: { ankle: 4 }, painNextMorning: undefined }), 'ankle', S);
    expect(r.level).toBe('orange');
    expect(r.provisional).toBe(false);
  });
});

describe('evaluateSession', () => {
  it('uses the worst region as the session level', () => {
    const s = session({
      regions: ['wrist', 'ankle', 'knee'],
      painBefore: { wrist: 1, ankle: 1, knee: 1 },
      painAfter: { wrist: 1, ankle: 4, knee: 1 },
      painNextMorning: { wrist: 1, ankle: 1, knee: 1 },
    });
    const ev = evaluateSession(s, S);
    expect(ev.level).toBe('orange');
    expect(ev.regions.map((r) => [r.region, r.level])).toEqual([
      ['wrist', 'green'],
      ['ankle', 'orange'],
      ['knee', 'green'],
    ]);
    expect(ev.provisional).toBe(false);
  });

  it('is provisional when any green region lacks the morning value', () => {
    const ev = evaluateSession(session({ painNextMorning: undefined }), S);
    expect(ev.provisional).toBe(true);
  });

  it('marks every region red when a red flag is set', () => {
    const ev = evaluateSession(session({ regions: ['wrist', 'knee'], painBefore: { wrist: 0, knee: 0 }, painAfter: {}, redFlags: ['giving_way'] }), S);
    expect(ev.level).toBe('red');
    expect(ev.regions.every((r) => r.level === 'red')).toBe(true);
  });
});

describe('sessionRegions / worstLevel', () => {
  it('merges explicit regions with pain keys in canonical order', () => {
    expect(sessionRegions({ regions: ['knee'], painBefore: { wrist: 1 }, painAfter: { ankle: 2 } })).toEqual(['wrist', 'ankle', 'knee']);
  });
  it('worstLevel orders red > orange > green and defaults to green', () => {
    expect(worstLevel([])).toBe('green');
    expect(worstLevel(['green', 'orange'])).toBe('orange');
    expect(worstLevel(['orange', 'red', 'green'])).toBe('red');
  });
});

describe('evaluateHistory — streaks', () => {
  const green = (p: Partial<Session> = {}) => session(p);
  const orange = (p: Partial<Session> = {}) => session({ painBefore: { ankle: 1 }, painAfter: { ankle: 4 }, ...p });

  it('flags the second consecutive orange session for a region', () => {
    const evs = evaluateHistory([orange(), orange()], S);
    expect(evs[0].regions[0].streak).toBeUndefined();
    expect(evs[1].regions[0].streak).toBe('orange_twice');
  });

  it('a green in between breaks the orange streak', () => {
    const evs = evaluateHistory([orange(), green(), orange()], S);
    expect(evs[2].regions[0].streak).toBeUndefined();
  });

  it('sessions for other regions do not break a region streak', () => {
    const evs = evaluateHistory(
      [orange(), green({ regions: ['wrist'], painBefore: { wrist: 0 }, painAfter: { wrist: 0 }, painNextMorning: { wrist: 0 } }), orange()],
      S,
    );
    expect(evs[2].regions[0].streak).toBe('orange_twice');
  });

  it('red then orange is not an orange streak', () => {
    const evs = evaluateHistory([green({ redFlags: ['night_pain'] }), orange()], S);
    expect(evs[1].regions[0].streak).toBeUndefined();
  });

  it('three final greens in a row trigger the progression hint', () => {
    const evs = evaluateHistory([green(), green(), green()], S);
    expect(evs[1].regions[0].streak).toBeUndefined();
    expect(evs[2].regions[0].streak).toBe('green_three');
  });

  it('a provisional green does not count toward three greens', () => {
    const evs = evaluateHistory([green(), green(), green({ painNextMorning: undefined })], S);
    expect(evs[2].regions[0].streak).toBeUndefined();
    const evs2 = evaluateHistory([green({ painNextMorning: undefined }), green(), green()], S);
    expect(evs2[2].regions[0].streak).toBeUndefined();
  });

  it('an orange resets the green count', () => {
    const evs = evaluateHistory([green(), orange(), green(), green()], S);
    expect(evs[3].regions[0].streak).toBeUndefined();
  });

  it('ignores unfinished sessions and sorts by start time', () => {
    const a = orange();
    const b = orange();
    const unfinished = orange({ endedAt: undefined });
    const evs = evaluateHistory([b, unfinished, a], S);
    expect(evs.map((e) => e.sessionId)).toEqual([a.id, b.id]);
    expect(evs[1].regions[0].streak).toBe('orange_twice');
  });
});

describe('wording', () => {
  it('produces non-prescriptive Turkish text for each reason', () => {
    expect(reasonText({ code: 'red_flag', flags: ['numbness', 'night_pain'] })).toBe('Kırmızı bayrak: Uyuşma / karıncalanma, Gece ağrısı.');
    expect(reasonText({ code: 'pain_max_exceeded', source: 'during', value: 7, limit: 5 })).toContain('Egzersiz sırasında ağrı 7/10');
    expect(reasonText({ code: 'pain_max_exceeded', source: 'after', value: 6, limit: 5 })).toContain('Seans sonrası');
    expect(reasonText({ code: 'pain_increase', before: 1, after: 3, delta: 2, threshold: 2 })).toContain('1 → 3 (+2)');
    expect(reasonText({ code: 'next_morning_not_returned', before: 2, morning: 4 })).toContain('dönmedi');
  });

  it('regionSummary includes streak and provisional notes with the region name', () => {
    const lines = regionSummary({ region: 'knee', level: 'green', reasons: [], provisional: true, streak: 'green_three' });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Diz: .*Fizyoterapistin onaylarsa/);
    expect(lines[1]).toMatch(/Geçici/);
  });
});
