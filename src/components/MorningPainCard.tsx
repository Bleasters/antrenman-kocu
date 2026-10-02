import { setMorningPain } from '../db/repo';
import type { Region, Session } from '../db/types';
import { formatLongTR } from '../logic/dates';
import { REGION_LABEL } from '../logic/labels';
import { sessionRegions } from '../logic/painRules';
import { PainPicker } from './PainPicker';

export function MorningPainCard({ session }: { session: Session }) {
  const regions = sessionRegions(session);
  return (
    <section class="card accent">
      <h2>{regions.length > 1 ? 'Son seans sonrası bu sabah ağrıların?' : 'Son seans sonrası bu sabah ağrın?'}</h2>
      <p class="small muted">
        {formatLongTR(session.date)} seansı · seans öncesi:{' '}
        {regions.map((r) => `${REGION_LABEL[r]} ${session.painBefore[r] ?? '–'}`).join(', ')}
      </p>
      {regions.map((r: Region) => (
        <div key={r} style={{ marginTop: 10 }}>
          {regions.length > 1 && <strong style={{ display: 'block', marginBottom: 6 }}>{REGION_LABEL[r]}</strong>}
          <PainPicker
            label={`${REGION_LABEL[r]} sabah ağrısı`}
            value={session.painNextMorning?.[r]}
            onChange={(v) => void setMorningPain(session.id, { [r]: v })}
          />
        </div>
      ))}
    </section>
  );
}
