import { LEVEL_TITLE, PROVISIONAL_NOTE, reasonText, STREAK_TEXT, type SessionEvaluation } from '../logic/painRules';
import { REGION_LABEL } from '../logic/labels';
import { formatLongTR } from '../logic/dates';
import { IconCheck, IconPending, IconStop, IconWarn } from './Icons';

const ICON = { green: IconCheck, orange: IconWarn, red: IconStop };

export function RuleCard({ ev, compact = false }: { ev: SessionEvaluation; compact?: boolean }) {
  const tone = ev.level === 'green' && ev.provisional ? 'grey' : ev.level;
  const Icon = tone === 'grey' ? IconPending : ICON[ev.level];
  return (
    <section class="card" aria-live="polite">
      <div class="row" style={{ gap: 'var(--s-3)' }}>
        <div class={`status-icon ${tone}`}>
          <Icon aria-hidden="true" />
        </div>
        <div class="grow">
          <div class="headline">{LEVEL_TITLE[ev.level]}</div>
          <div class="small muted">Son seans · {formatLongTR(ev.date)}</div>
        </div>
      </div>
      {ev.provisional && <p class="small muted" style={{ margin: 'var(--s-3) 0 0' }}>{PROVISIONAL_NOTE}</p>}
      {!compact && ev.regions.length > 0 && (
        <>
          <hr class="divider" />
          {ev.regions.map((r) => {
            const lines = [...r.reasons.map(reasonText), ...(r.streak ? [STREAK_TEXT[r.streak]] : [])];
            return (
              <div key={r.region} class={`region-${r.region}`} style={{ marginTop: 'var(--s-2)' }}>
                <div class="row">
                  <span class="region-dot" aria-hidden="true" />
                  <strong class="grow callout">{REGION_LABEL[r.region]}</strong>
                  <span class={`level-dot ${r.provisional ? 'grey' : r.level}`} aria-hidden="true" style={{ margin: '0' }} />
                </div>
                {lines.length > 0 ? (
                  <ul class="callout muted" style={{ margin: 'var(--s-1) 0 0', paddingLeft: '34px' }}>
                    {lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <div class="small faint" style={{ paddingLeft: '16px' }}>
                    Eşikler aşılmadı
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      <p class="small faint" style={{ margin: 'var(--s-3) 0 0' }}>
        Bu bir tıbbi tavsiye değildir; eşikler fizyoterapistinle belirlediğin değerlerdir.
      </p>
    </section>
  );
}
