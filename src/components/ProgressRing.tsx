import type { ComponentChildren } from 'preact';

interface Props {
  /** 0..1 */
  progress: number;
  variant?: 'work' | 'rest' | 'reached';
  children?: ComponentChildren;
  label?: string;
  /** quick transitions (rep counter) instead of the smooth 1 s timer sweep */
  fast?: boolean;
}

const R = 104;
const C = 2 * Math.PI * R;

/** Circular progress ring around a big number (timer / rep counter). Colour follows the region. */
export function ProgressRing({ progress, variant = 'work', children, label, fast = false }: Props) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div class={`ring-wrap${variant === 'work' ? '' : ` ${variant}`}${fast ? ' fast' : ''}`} role={label ? 'img' : undefined} aria-label={label}>
      <svg class="ring" viewBox="0 0 240 240" aria-hidden="true">
        <circle class="ring-track" cx="120" cy="120" r={R} fill="none" stroke-width="14" />
        <circle
          class="ring-fill"
          cx="120"
          cy="120"
          r={R}
          fill="none"
          stroke-width="14"
          stroke-linecap="round"
          stroke-dasharray={String(C)}
          stroke-dashoffset={String(C * (1 - p))}
          style={{ opacity: p === 0 ? '0' : '1' }}
        />
      </svg>
      <div class="ring-center">{children}</div>
    </div>
  );
}
