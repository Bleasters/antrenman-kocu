import { IconMinus, IconPlus } from './Icons';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}

export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit }: Props) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <div class="row spread">
      <span class="callout">{label}</span>
      <div class="stepper">
        <button type="button" class="icon-btn" aria-label={`${label} azalt`} disabled={value <= min} onClick={() => set(value - step)}>
          <IconMinus aria-hidden="true" />
        </button>
        <output aria-live="polite">
          {value}
          {unit ? <span class="small muted"> {unit}</span> : ''}
        </output>
        <button type="button" class="icon-btn" aria-label={`${label} artır`} disabled={value >= max} onClick={() => set(value + step)}>
          <IconPlus aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
