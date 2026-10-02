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
      <div class="row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <div class="headline row" style={{ gap: '0' }}>
            <span class="region-dot" aria-hidden="true" />
            {label}
          </div>
          <div class="small faint">0 ağrı yok · 10 dayanılmaz</div>
        </div>
        <span class="pain-value" aria-live="polite">
          {value ?? '–'}
          <span class="of muted">/10</span>
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
      <PainPicker value={value} onChange={onChange} label={label} />
    </div>
  );
}
