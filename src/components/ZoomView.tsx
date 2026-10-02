import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';

interface T {
  s: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pinch-zoom (two fingers), pan (one finger when zoomed), double-tap to toggle 2.5×. */
export function ZoomView({ children, label }: { children: ComponentChildren; label: string }) {
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ t: T; dist: number; cx: number; cy: number } | null>(null);
  const lastTap = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const bound = (n: T): T => {
    const el = box.current;
    if (!el || n.s <= 1) return { s: Math.max(1, n.s), x: 0, y: 0 };
    const mx = (el.clientWidth * (n.s - 1)) / 2;
    const my = (el.clientHeight * (n.s - 1)) / 2;
    return { s: n.s, x: clamp(n.x, -mx, mx), y: clamp(n.y, -my, my) };
  };

  const snapshot = (cur: T) => {
    const p = [...pts.current.values()];
    if (p.length >= 2) {
      start.current = { t: cur, dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 };
    } else if (p.length === 1) {
      start.current = { t: cur, dist: 0, cx: p[0].x, cy: p[0].y };
    } else start.current = null;
  };

  return (
    <div
      ref={box}
      class="zoom-view"
      role="img"
      aria-label={`${label} (iki parmakla yakınlaştır, çift dokunarak büyüt)`}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        snapshot(t);
        if (pts.current.size === 1) {
          const now = Date.now();
          if (now - lastTap.current < 300) setT(t.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 });
          lastTap.current = now;
        }
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId) || !start.current) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = [...pts.current.values()];
        const st = start.current;
        if (p.length >= 2 && st.dist > 0) {
          const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          const cx = (p[0].x + p[1].x) / 2;
          const cy = (p[0].y + p[1].y) / 2;
          setT(bound({ s: clamp((st.t.s * dist) / st.dist, 1, 6), x: st.t.x + (cx - st.cx), y: st.t.y + (cy - st.cy) }));
        } else if (p.length === 1 && st.t.s > 1) {
          setT(bound({ s: st.t.s, x: st.t.x + (p[0].x - st.cx), y: st.t.y + (p[0].y - st.cy) }));
        }
      }}
      onPointerUp={(e) => {
        pts.current.delete(e.pointerId);
        snapshot(t);
      }}
      onPointerCancel={(e) => {
        pts.current.delete(e.pointerId);
        snapshot(t);
      }}
    >
      <div class="zoom-content" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>
        {children}
      </div>
    </div>
  );
}
