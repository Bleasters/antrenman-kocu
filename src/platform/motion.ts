import type { TimedSample } from '../logic/rom';

export type MotionPermission = 'granted' | 'denied' | 'unsupported';

type DME = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function motionSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

/** iOS: must be called directly from a tap handler (and over HTTPS). */
export async function requestMotionPermission(): Promise<MotionPermission> {
  if (!motionSupported()) return 'unsupported';
  const D = window.DeviceMotionEvent as DME;
  if (typeof D.requestPermission === 'function') {
    try {
      return (await D.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'granted'; // Android / desktop: no prompt
}

export interface MotionStream {
  samples(): TimedSample[];
  stop(): void;
}

/**
 * Keeps the sensor running while the ROM screen is open (no warm-up per capture) and
 * buffers the last few seconds of timestamped samples.
 */
export function startMotionStream(keepMs = 6000): MotionStream {
  let buf: TimedSample[] = [];
  const on = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    const t = performance.now();
    buf.push({ t, v: [a.x, a.y, a.z] });
    if (buf.length > 2000 || buf[0].t < t - keepMs) buf = buf.filter((s) => s.t >= t - keepMs);
  };
  window.addEventListener('devicemotion', on);
  return {
    samples: () => buf,
    stop: () => window.removeEventListener('devicemotion', on),
  };
}
