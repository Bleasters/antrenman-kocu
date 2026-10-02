import type { Vec3 } from '../logic/rom';

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

/** Collects accelerationIncludingGravity samples for durationMs. */
export function collectSamples(durationMs = 1000): Promise<Vec3[]> {
  return new Promise((resolve) => {
    const out: Vec3[] = [];
    const on = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a && a.x != null && a.y != null && a.z != null) out.push([a.x, a.y, a.z]);
    };
    window.addEventListener('devicemotion', on);
    setTimeout(() => {
      window.removeEventListener('devicemotion', on);
      resolve(out);
    }, durationMs);
  });
}
