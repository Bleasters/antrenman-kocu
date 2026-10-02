/**
 * Inclinometer ROM math. The phone's gravity vector (accelerationIncludingGravity) is
 * averaged at the neutral position (g0) and at end range (g1); the joint angle is the
 * angle between the two vectors. Axis sign conventions differ between platforms, but
 * the angle between two vectors does not depend on them.
 */
import type { Region, RomMovement } from '../db/types';

export type Vec3 = [number, number, number];

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function norm(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

/** θ = acos((g0·g1) / (|g0||g1|)) in degrees. */
export function angleBetweenDeg(g0: Vec3, g1: Vec3): number {
  const d = norm(g0) * norm(g1);
  if (d === 0) return NaN;
  const c = Math.min(1, Math.max(-1, dot(g0, g1) / d)); // clamp float error
  return (Math.acos(c) * 180) / Math.PI;
}

export function meanVector(samples: Vec3[]): Vec3 {
  const n = samples.length;
  const s: Vec3 = [0, 0, 0];
  for (const v of samples) {
    s[0] += v[0];
    s[1] += v[1];
    s[2] += v[2];
  }
  return [s[0] / n, s[1] / n, s[2] / n];
}

/** Largest per-axis standard deviation (m/s²). */
export function maxAxisStdDev(samples: Vec3[]): number {
  const m = meanVector(samples);
  let worst = 0;
  for (let k = 0; k < 3; k++) {
    let acc = 0;
    for (const v of samples) acc += (v[k] - m[k]) ** 2;
    worst = Math.max(worst, Math.sqrt(acc / samples.length));
  }
  return worst;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const MIN_SAMPLES = 10;
/** Per-axis std-dev limit. Resting phone ≈ 0.02–0.05 m/s²; hand tremor/motion goes well above. */
export const STABILITY_LIMIT = 0.3;
/** |g| must be near 9.81; far off means the phone was accelerating, not just tilted. */
export const GRAVITY_MIN = 8.3;
export const GRAVITY_MAX = 11.3;

export type WindowResult =
  | { ok: true; vector: Vec3; std: number }
  | { ok: false; reason: 'insufficient' | 'unstable' | 'not_gravity'; std?: number };

/** Validates and averages one 1-second sample window. */
export function analyzeWindow(samples: Vec3[], limit = STABILITY_LIMIT): WindowResult {
  const valid = samples.filter((v) => v.every((x) => Number.isFinite(x)));
  if (valid.length < MIN_SAMPLES) return { ok: false, reason: 'insufficient' };
  const std = maxAxisStdDev(valid);
  if (std > limit) return { ok: false, reason: 'unstable', std };
  const vector = meanVector(valid);
  const g = norm(vector);
  if (g < GRAVITY_MIN || g > GRAVITY_MAX) return { ok: false, reason: 'not_gravity', std };
  return { ok: true, vector, std };
}

export const WINDOW_MESSAGE: Record<'insufficient' | 'unstable' | 'not_gravity', string> = {
  insufficient: 'Sensörden yeterli veri gelmedi. İzni ve cihazı kontrol et ya da manuel gir.',
  unstable: 'Telefon birkaç saniye boyunca sabitlenemedi. Uzvu destekleyip tekrar dene.',
  not_gravity: 'Telefon hızlanıyordu; tamamen durunca tekrar dene.',
};

export function roundAngle(a: number): number {
  return Math.round(a * 10) / 10;
}

// ---------- Movements ----------

export interface MovementInfo {
  region: Region;
  label: string;
  placement: string;
}

export const MOVEMENTS: Record<RomMovement, MovementInfo> = {
  wrist_flexion: {
    region: 'wrist',
    label: 'Bilek fleksiyon',
    placement: 'Önkol masada, avuç aşağı, el masanın kenarından dışarıda. Telefonu elin sırtına, uzun kenarı parmaklar yönünde koy. Nötrde sıfırla, sonra eli aşağı bük.',
  },
  wrist_extension: {
    region: 'wrist',
    label: 'Bilek ekstansiyon',
    placement: 'Önkol masada, avuç aşağı, el kenardan dışarıda. Telefon elin sırtında, uzun kenar parmaklar yönünde. Nötrde sıfırla, sonra eli yukarı kaldır.',
  },
  wrist_radial_dev: {
    region: 'wrist',
    label: 'Bilek radial deviasyon',
    placement: 'Önkol masada, avuç aşağı. Telefon elin sırtında. Bu hareket yatay düzlemde olduğu için önkolu dik tut (başparmak yukarı), telefonu elin dış kenarına koy. Nötrde sıfırla, eli başparmak yönüne bük.',
  },
  wrist_ulnar_dev: {
    region: 'wrist',
    label: 'Bilek ulnar deviasyon',
    placement: 'Önkol dik (başparmak yukarı), telefon elin dış kenarında. Nötrde sıfırla, eli serçe parmak yönüne (aşağı) bük.',
  },
  ankle_dorsiflexion: {
    region: 'ankle',
    label: 'Ayak bileği dorsifleksiyon',
    placement: 'Telefonu kaval kemiğinin ön yüzüne, uzun kenarı kemik boyunca bantla ya da tut. Topuk yerde, ayak düzken sıfırla. Sonra topuğu kaldırmadan dizi öne doğru it (diz-duvar testi gibi).',
  },
  ankle_plantarflexion: {
    region: 'ankle',
    label: 'Ayak bileği plantarfleksiyon',
    placement: 'Otur, bacak düz uzatılmış. Telefonu ayağın üst yüzüne, uzun kenarı parmaklar yönünde koy. Ayak bileği 90°’de sıfırla, sonra ayak ucunu ileri it.',
  },
  knee_flexion: {
    region: 'knee',
    label: 'Diz fleksiyon',
    placement: 'Sırtüstü yat. Telefonu kaval kemiğinin ön yüzüne, uzun kenar kemik boyunca koy. Bacak düzken sıfırla, topuğu kaydırarak dizi büktükten sonra ölç.',
  },
  knee_extension: {
    region: 'knee',
    label: 'Diz ekstansiyon',
    placement: 'Otur, diz 90° bükülü. Telefon kaval kemiğinin ön yüzünde. 90°’de sıfırla, dizi olabildiğince düzleştir ve ölç. Sonuç 90°’ye yaklaştıkça tam açılmaya yaklaşırsın.',
  },
};

export const MOVEMENT_LIST = Object.keys(MOVEMENTS) as RomMovement[];

export function movementsFor(region: Region): RomMovement[] {
  return MOVEMENT_LIST.filter((m) => MOVEMENTS[m].region === region);
}

// ---------- Capture over a continuous sample stream ----------

export interface TimedSample {
  t: number; // ms
  v: Vec3;
}

/** Ignore samples right after the tap: touching the screen jolts the phone. */
export const SETTLE_MS = 400;
export const WINDOW_MS = 1000;
/** How long to keep looking for a steady window before giving up. */
export const CAPTURE_TIMEOUT_MS = 4000;

export type CaptureStep = { status: 'ok'; vector: Vec3 } | { status: 'wait' } | { status: 'fail'; reason: 'insufficient' | 'unstable' | 'not_gravity' };

/**
 * One polling step of a capture that started at `start` (tap time). Uses the most recent
 * WINDOW_MS of samples taken after the settle period; succeeds on the first steady window,
 * keeps waiting while the user is still settling, and fails only after the timeout.
 */
export function captureStep(samples: TimedSample[], start: number, now: number, limit = STABILITY_LIMIT): CaptureStep {
  const from = start + SETTLE_MS;
  const kept = samples.filter((s) => s.t >= from && s.t <= now);
  let last: 'insufficient' | 'unstable' | 'not_gravity' = 'insufficient';
  if (kept.length) {
    const end = kept[kept.length - 1].t;
    if (end - kept[0].t >= WINDOW_MS * 0.9) {
      const r = analyzeWindow(kept.filter((s) => s.t > end - WINDOW_MS).map((s) => s.v), limit);
      if (r.ok) return { status: 'ok', vector: r.vector };
      last = r.reason;
    }
  }
  return now - start >= CAPTURE_TIMEOUT_MS ? { status: 'fail', reason: last } : { status: 'wait' };
}
