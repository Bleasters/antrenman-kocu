/**
 * Pain-monitoring rule engine. Pure and UI-independent.
 *
 * Based on the pain-monitoring model commonly used in sports rehab. All thresholds come
 * from Settings. Output wording guides but does not prescribe; this is not medical advice.
 */
import type { RedFlag, Region, Session, Settings } from '../db/types';
import { REGIONS } from '../db/types';
import { RED_FLAG_LABEL, REGION_LABEL } from './labels';

export type RuleLevel = 'red' | 'orange' | 'green';

export type RuleSettings = Pick<Settings, 'painIncreaseThreshold' | 'painMaxDuring' | 'nextMorningMustReturn'>;

export type Reason =
  | { code: 'red_flag'; flags: RedFlag[] }
  | { code: 'pain_max_exceeded'; source: 'during' | 'after'; value: number; limit: number }
  | { code: 'pain_increase'; before: number; after: number; delta: number; threshold: number }
  | { code: 'next_morning_not_returned'; before: number; morning: number };

export type Streak = 'orange_twice' | 'green_three';

export interface RegionEvaluation {
  region: Region;
  level: RuleLevel;
  reasons: Reason[];
  /** Next-morning pain still missing, so a green result may still turn orange. */
  provisional: boolean;
  streak?: Streak;
}

export interface SessionEvaluation {
  sessionId: string;
  date: string;
  startedAt: number;
  level: RuleLevel;
  provisional: boolean;
  regions: RegionEvaluation[];
}

/** Resolves an exercise id to its region (used when an entry has no region snapshot). */
export type ExerciseRegionLookup = (exerciseId: string) => Region | undefined;

const RANK: Record<RuleLevel, number> = { green: 0, orange: 1, red: 2 };

export function worstLevel(levels: RuleLevel[]): RuleLevel {
  return levels.reduce<RuleLevel>((acc, l) => (RANK[l] > RANK[acc] ? l : acc), 'green');
}

export function sessionRegions(session: Pick<Session, 'regions' | 'painBefore' | 'painAfter'>): Region[] {
  const set = new Set<Region>(session.regions ?? []);
  for (const r of Object.keys(session.painBefore ?? {}) as Region[]) set.add(r);
  for (const r of Object.keys(session.painAfter ?? {}) as Region[]) set.add(r);
  return REGIONS.filter((r) => set.has(r));
}

function maxPainDuring(session: Session, region: Region, lookup: ExerciseRegionLookup): number | undefined {
  let max: number | undefined;
  for (const e of session.entries ?? []) {
    if (e.painDuring == null) continue;
    const r = e.region ?? lookup(e.exerciseId);
    if (r !== region) continue;
    max = max == null ? e.painDuring : Math.max(max, e.painDuring);
  }
  return max;
}

export function evaluateRegion(
  session: Session,
  region: Region,
  settings: RuleSettings,
  lookup: ExerciseRegionLookup = () => undefined,
): RegionEvaluation {
  const before = session.painBefore?.[region];
  const after = session.painAfter?.[region];
  const morning = session.painNextMorning?.[region];
  const morningMissing = settings.nextMorningMustReturn && morning == null;

  // 🔴 Red flags override everything.
  const flags = session.redFlags ?? [];
  if (flags.length > 0) {
    return { region, level: 'red', reasons: [{ code: 'red_flag', flags: [...flags] }], provisional: false };
  }

  const reasons: Reason[] = [];
  const during = maxPainDuring(session, region, lookup);
  if (during != null && during > settings.painMaxDuring) {
    reasons.push({ code: 'pain_max_exceeded', source: 'during', value: during, limit: settings.painMaxDuring });
  }
  if (after != null && after > settings.painMaxDuring) {
    reasons.push({ code: 'pain_max_exceeded', source: 'after', value: after, limit: settings.painMaxDuring });
  }
  if (before != null && after != null && after - before >= settings.painIncreaseThreshold) {
    reasons.push({
      code: 'pain_increase',
      before,
      after,
      delta: after - before,
      threshold: settings.painIncreaseThreshold,
    });
  }
  if (settings.nextMorningMustReturn && before != null && morning != null && morning > before) {
    reasons.push({ code: 'next_morning_not_returned', before, morning });
  }

  const level: RuleLevel = reasons.length > 0 ? 'orange' : 'green';
  // Only a green result can still change once next-morning pain is entered.
  return { region, level, reasons, provisional: level === 'green' && morningMissing };
}

export function evaluateSession(
  session: Session,
  settings: RuleSettings,
  lookup?: ExerciseRegionLookup,
): SessionEvaluation {
  const regions = sessionRegions(session).map((r) => evaluateRegion(session, r, settings, lookup));
  return {
    sessionId: session.id,
    date: session.date,
    startedAt: session.startedAt,
    level: worstLevel(regions.map((r) => r.level)),
    provisional: regions.some((r) => r.provisional),
    regions,
  };
}

/**
 * Evaluates all finished sessions in chronological order and adds streak info per region:
 * - orange_twice: this and the previous session that trained the region were both orange.
 * - green_three: the last 3 sessions that trained the region were green and final (not provisional).
 */
export function evaluateHistory(
  sessions: Session[],
  settings: RuleSettings,
  lookup?: ExerciseRegionLookup,
): SessionEvaluation[] {
  const finished = sessions
    .filter((s) => s.endedAt != null)
    .sort((a, b) => a.startedAt - b.startedAt);
  const perRegion: Partial<Record<Region, RegionEvaluation[]>> = {};
  const out: SessionEvaluation[] = [];

  for (const s of finished) {
    const ev = evaluateSession(s, settings, lookup);
    for (const r of ev.regions) {
      const hist = (perRegion[r.region] ??= []);
      const prev = hist[hist.length - 1];
      if (r.level === 'orange' && prev?.level === 'orange') {
        r.streak = 'orange_twice';
      } else if (r.level === 'green' && !r.provisional && hist.length >= 2) {
        const last2 = hist.slice(-2);
        if (last2.every((h) => h.level === 'green' && !h.provisional)) r.streak = 'green_three';
      }
      hist.push(r);
    }
    out.push(ev);
  }
  return out;
}

// ---------- Wording (Turkish, guiding but non-prescriptive) ----------

export const LEVEL_TITLE: Record<RuleLevel, string> = {
  red: 'Dur — doktoruna/fizyoterapistine danış',
  orange: 'Yükü azalt',
  green: 'Mevcut yük uygun',
};

export const PROVISIONAL_NOTE = 'Geçici sonuç: ertesi sabah ağrısı henüz girilmedi.';

export const STREAK_TEXT: Record<Streak, string> = {
  orange_twice: 'Üst üste ikinci kez. Programı gözden geçir.',
  green_three: 'Son 3 seans üst üste yeşil. Fizyoterapistin onaylarsa ilerletmeyi düşünebilirsin.',
};

export function reasonText(r: Reason): string {
  switch (r.code) {
    case 'red_flag':
      return `Kırmızı bayrak: ${r.flags.map((f) => RED_FLAG_LABEL[f]).join(', ')}.`;
    case 'pain_max_exceeded':
      return `${r.source === 'during' ? 'Egzersiz sırasında' : 'Seans sonrası'} ağrı ${r.value}/10 — belirlediğin sınır ${r.limit}.`;
    case 'pain_increase':
      return `Ağrı seans öncesine göre arttı: ${r.before} → ${r.after} (+${r.delta}). Eşik +${r.threshold}.`;
    case 'next_morning_not_returned':
      return `Ertesi sabah ağrı ${r.morning}/10, seans öncesi seviyeye (${r.before}/10) dönmedi.`;
  }
}

export function regionSummary(r: RegionEvaluation): string[] {
  const lines = r.reasons.map(reasonText);
  if (r.streak) lines.push(STREAK_TEXT[r.streak]);
  if (r.provisional) lines.push(PROVISIONAL_NOTE);
  return lines.map((l) => `${REGION_LABEL[r.region]}: ${l}`);
}
