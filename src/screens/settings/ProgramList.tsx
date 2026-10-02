import { moveExercise, setExerciseActive, sortExercises } from '../../db/repo';
import { PageHeader } from '../../components/PageHeader';
import { IconChevronDown, IconChevronUp, IconPlus } from '../../components/Icons';
import { REGIONS } from '../../db/types';
import { useExercises } from '../../hooks';
import { KIND_LABEL, REGION_LABEL, SIDE_LABEL } from '../../logic/labels';
import type { Exercise } from '../../db/types';
import { returnToSession } from '../../state';

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
      <PageHeader
        title="Program"
        back={returnToSession.value ? { href: '#/session', label: 'Seansa dön' } : { href: '#/settings', label: 'Ayarlar' }}
      />
      {REGIONS.map((r) => {
        const items = list.filter((e) => e.region === r);
        return (
          <section key={r}>
            <h2 class={`section-title row region-${r}`} style={{ gap: '0' }}>
              <span class="region-dot" aria-hidden="true" />
              {REGION_LABEL[r]}
            </h2>
            {items.length === 0 ? (
              <div class="card empty">Bu bölgede egzersiz yok.</div>
            ) : (
              <ul class="list card">
                {items.map((e, i) => (
                  <li key={e.id} style={{ opacity: e.active ? 1 : 0.55 }}>
                    <a href={`#/settings/program/${e.id}`} class="grow" style={{ color: 'inherit', textDecoration: 'none', minHeight: '48px' }}>
                      <div class="headline">{e.name}</div>
                      <div class="row wrap small muted" style={{ gap: '6px', marginTop: '2px' }}>
                        <span>{dose(e)}</span>
                        <span>· {KIND_LABEL[e.kind]}</span>
                        {e.side && <span>· {SIDE_LABEL[e.side]}</span>}
                        {e.isSample && <span class="tag sample">Örnek — düzenle</span>}
                        {!e.active && <span class="tag">Pasif</span>}
                      </div>
                    </a>
                    <label class="switch-hit">
                    <input
                      type="checkbox"
                      aria-label={`${e.name} aktif`}
                      checked={e.active}
                      class="switch"
                      onChange={(ev) => void setExerciseActive(e.id, (ev.target as HTMLInputElement).checked)}
                    />
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button class="icon-btn" style={{ background: 'transparent' }} aria-label={`${e.name} yukarı taşı`} disabled={i === 0} onClick={() => void moveExercise(e.id, -1)}>
                        <IconChevronUp aria-hidden="true" />
                      </button>
                      <button class="icon-btn" style={{ background: 'transparent' }} aria-label={`${e.name} aşağı taşı`} disabled={i === items.length - 1} onClick={() => void moveExercise(e.id, 1)}>
                        <IconChevronDown aria-hidden="true" />
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
          <IconPlus aria-hidden="true" />
          Egzersiz ekle
        </a>
      </div>
    </div>
  );
}
