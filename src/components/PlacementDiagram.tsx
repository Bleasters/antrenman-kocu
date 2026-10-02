import type { RomMovement } from '../db/types';
import { MOVEMENTS } from '../logic/rom';

/**
 * Schematic: proximal segment (grey), distal segment (accent) with the phone on it,
 * and an arrow showing the direction of motion from the zero position.
 */
const SHAPES: Record<RomMovement, { prox: string; dist: string; phone: [number, number, number]; arrow: string }> = {
  wrist_flexion: { prox: 'M20 70 H120', dist: 'M120 70 H190', phone: [155, 62, 0], arrow: 'M195 80 Q195 115 165 128' },
  wrist_extension: { prox: 'M20 80 H120', dist: 'M120 80 H190', phone: [155, 72, 0], arrow: 'M195 70 Q195 35 165 22' },
  wrist_radial_dev: { prox: 'M20 80 H120', dist: 'M120 80 H190', phone: [155, 72, 0], arrow: 'M195 70 Q195 35 165 22' },
  wrist_ulnar_dev: { prox: 'M20 70 H120', dist: 'M120 70 H190', phone: [155, 62, 0], arrow: 'M195 80 Q195 115 165 128' },
  ankle_dorsiflexion: { prox: 'M40 130 H140', dist: 'M90 130 L90 20', phone: [90, 70, 90], arrow: 'M105 22 Q150 25 165 60' },
  ankle_plantarflexion: { prox: 'M20 60 H120', dist: 'M120 60 L120 120', phone: [120, 92, 90], arrow: 'M135 125 Q170 120 180 90' },
  knee_flexion: { prox: 'M20 120 H110', dist: 'M110 120 H200', phone: [160, 112, 0], arrow: 'M200 105 Q190 50 145 35' },
  knee_extension: { prox: 'M20 50 H110', dist: 'M110 50 L110 140', phone: [110, 100, 90], arrow: 'M125 140 Q175 130 190 70' },
};

export function PlacementDiagram({ movement }: { movement: RomMovement }) {
  const s = SHAPES[movement];
  const [px, py, rot] = s.phone;
  return (
    <svg viewBox="0 0 220 150" role="img" aria-label={`${MOVEMENTS[movement].label}: telefonun yerleşimi`} style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto' }}>
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--orange)" />
        </marker>
      </defs>
      <path d={s.prox} stroke="var(--text-2)" stroke-width="16" stroke-linecap="round" fill="none" opacity="0.5" />
      <path d={s.dist} stroke="var(--accent)" stroke-width="16" stroke-linecap="round" fill="none" opacity="0.6" />
      <g transform={`translate(${px} ${py}) rotate(${rot})`}>
        <rect x="-22" y="-8" width="44" height="16" rx="3" fill="var(--surface)" stroke="var(--text)" stroke-width="2" />
        <circle cx="17" cy="0" r="2" fill="var(--text)" />
      </g>
      <path d={s.arrow} stroke="var(--orange)" stroke-width="3" fill="none" marker-end="url(#ah)" stroke-dasharray="5 4" />
    </svg>
  );
}
