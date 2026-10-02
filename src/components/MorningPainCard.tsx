import { setMorningPain } from '../db/repo';
import type { Region, Session } from '../db/types';
import { formatLongTR } from '../logic/dates';
import { REGION_LABEL } from '../logic/labels';
import { sessionRegions } from '../logic/painRules';
import { IconSunrise } from './Icons';
import { PainPicker } from './PainPicker';

export function MorningPainCard({ session }: { session: Session }) {
  const regions = sessionRegions(session);
  return (
    <section class="card accent">
      <div class="row" style={{ gap: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
        <div class="status-icon accent">
          <IconSunrise aria-hidden="true" />
        </div>
        <div class="grow">
          <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>
            {regions.length > 1 ? 'Son seans sonrası bu sabah ağrıların?' : 'Son seans sonrası bu sabah ağrın?'}
          </h2>
          <div class="small muted">
            {formatLongTR(session.date)} · seans öncesi {regions.map((r) => `${REGION_LABEL[r]} ${session.painBefore[r] ?? '–'}`).join(', ')}
          </div>
        </div>
      </div>
      {regions.map((r: Region) => (
        <div key={r} class={`region-${r}`} style={{ marginTop: 'var(--s-3)' }}>
          {regions.length > 1 && (
            <div class="row callout" style={{ marginBottom: 'var(--s-2)', fontWeight: 'var(--fw-semibold)' }}>
              <span class="region-dot" aria-hidden="true" />
              {REGION_LABEL[r]}
            </div>
          )}
          <PainPicker label={`${REGION_LABEL[r]} sabah ağrısı`} value={session.painNextMorning?.[r]} onChange={(v) => void setMorningPain(session.id, { [r]: v })} />
        </div>
      ))}
    </section>
  );
}
