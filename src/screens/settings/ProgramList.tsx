import { moveExercise, setExerciseActive, sortExercises } from '../../db/repo';
import { REGIONS } from '../../db/types';
import { useExercises } from '../../hooks';
import { KIND_LABEL, REGION_LABEL, SIDE_LABEL } from '../../logic/labels';
import type { Exercise } from '../../db/types';

export function dose(e: Pick<Exercise, 'kind' | 'defaultSets' | 'defaultReps' | 'holdSec' | 'durationSec' | 'loadKg'>): string {
  const per = e.kind === 'reps' ? `${e.defaultReps ?? 0}` : e.kind === 'hold' ? `${e.holdSec ?? 0} sn` : `${e.durationSec ?? 0} sn`;
  return `${e.defaultSets}×${per}${e.loadKg ? ` · ${e.loadKg} kg` : ''}`;
}

export function ProgramList() {
  const all = useExercises();
  if (!all) return null;
  const list = sortExercises(all);
  return (
    <div class="stack">
      <a class="btn ghost" href="#/settings">
        ‹ Ayarlar
      </a>
      <h1>Program</h1>
      {REGIONS.map((r) => {
        const items = list.filter((e) => e.region === r);
        return (
          <section key={r}>
            <h2 class="section-title">{REGION_LABEL[r]}</h2>
            {items.length === 0 ? (
              <div class="card empty">Bu bölgede egzersiz yok.</div>
            ) : (
              <ul class="list card">
                {items.map((e, i) => (
                  <li key={e.id} style={{ opacity: e.active ? 1 : 0.55 }}>
                    <a href={`#/settings/program/${e.id}`} class="grow" style={{ color: 'inherit', textDecoration: 'none', minHeight: 48 }}>
                      <div>
                        <strong>{e.name}</strong>
                      </div>
                      <div class="row wrap small muted" style={{ gap: 6, marginTop: 2 }}>
                        <span>{dose(e)}</span>
                        <span>· {KIND_LABEL[e.kind]}</span>
                        {e.side && <span>· {SIDE_LABEL[e.side]}</span>}
                        {e.isSample && <span class="tag sample">Örnek — düzenle</span>}
                        {!e.active && <span class="tag">Pasif</span>}
                      </div>
                    </a>
                    <input
                      type="checkbox"
                      aria-label={`${e.name} aktif`}
                      checked={e.active}
                      style={{ width: 28, height: 28, accentColor: 'var(--accent)' }}
                      onChange={(ev) => void setExerciseActive(e.id, (ev.target as HTMLInputElement).checked)}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button class="icon-btn" aria-label={`${e.name} yukarı taşı`} disabled={i === 0} onClick={() => void moveExercise(e.id, -1)}>
                        ↑
                      </button>
                      <button class="icon-btn" aria-label={`${e.name} aşağı taşı`} disabled={i === items.length - 1} onClick={() => void moveExercise(e.id, 1)}>
                        ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <div class="sticky-cta">
        <a class="btn primary big block" href="#/settings/program/new">
          + Egzersiz ekle
        </a>
      </div>
    </div>
  );
}
