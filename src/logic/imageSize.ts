/** Scales (w, h) so the longer edge is at most maxEdge; never upscales. */
export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= maxEdge || long === 0) return { width: Math.round(w), height: Math.round(h) };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 300;
export const JPEG_QUALITY = 0.8;
export const VIDEO_WARN_BYTES = 30 * 1024 * 1024;
