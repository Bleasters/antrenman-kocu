import { LEVEL_TITLE, PROVISIONAL_NOTE, reasonText, STREAK_TEXT, type SessionEvaluation } from '../logic/painRules';
import { REGION_LABEL } from '../logic/labels';
import { formatLongTR } from '../logic/dates';

export function RuleCard({ ev, compact = false }: { ev: SessionEvaluation; compact?: boolean }) {
  const cls = ev.level === 'green' && ev.provisional ? 'grey' : ev.level;
  return (
    <section class={`card ${cls}`} aria-live="polite">
      <div class="small muted">Son seans · {formatLongTR(ev.date)}</div>
      <h2 style={{ marginTop: '4px' }}>
        <span class={`level-dot ${ev.level}`} aria-hidden="true" />
        {LEVEL_TITLE[ev.level]}
      </h2>
      {ev.provisional && <p class="small">⚪ {PROVISIONAL_NOTE}</p>}
      {!compact &&
        ev.regions.map((r) => {
          const lines = [...r.reasons.map(reasonText), ...(r.streak ? [STREAK_TEXT[r.streak]] : [])];
          return (
            <div key={r.region} style={{ marginTop: '8px' }}>
              <strong>
                <span class={`level-dot ${r.provisional ? 'grey' : r.level}`} aria-hidden="true" />
                {REGION_LABEL[r.region]}
              </strong>
              {lines.length > 0 ? (
                <ul style={{ margin: '4px 0 0', paddingLeft: '20px' }}>
                  {lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : (
                <span class="muted small"> — eşikler aşılmadı</span>
              )}
            </div>
          );
        })}
      <p class="small muted" style={{ marginTop: '10px', marginBottom: '0px' }}>
        Bu bir tıbbi tavsiye değildir; eşikler fizyoterapistinle belirlediğin değerlerdir.
      </p>
    </section>
  );
}
