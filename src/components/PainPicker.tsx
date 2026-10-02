const VALUES = Array.from({ length: 11 }, (_, i) => i);

interface PickerProps {
  value: number | undefined;
  onChange: (v: number) => void;
  label?: string;
}

/** 0–10 in big buttons; one tap selects. */
export function PainPicker({ value, onChange, label }: PickerProps) {
  return (
    <div role="group" aria-label={label ?? 'Ağrı 0–10'}>
      <div class="pain-grid">
        {VALUES.map((v) => (
          <button type="button" key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Big value + slider + buttons (session start/end). */
export function PainInput({ value, onChange, label }: PickerProps) {
  return (
    <div class="stack">
      <div class="row spread">
        <strong>{label}</strong>
        <span class="pain-value" aria-live="polite">
          {value ?? '–'}
          <span class="muted small">/10</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value ?? 0}
        aria-label={`${label ?? 'Ağrı'} kaydırıcı`}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
      <div class="pain-scale" aria-hidden="true">
        <span>0 ağrı yok</span>
        <span>10 dayanılmaz</span>
      </div>
      <PainPicker value={value} onChange={onChange} label={label} />
    </div>
  );
}
