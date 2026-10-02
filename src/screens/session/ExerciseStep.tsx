import { useState } from 'preact/hooks';
import { IconCheck, IconChevronRight, IconGauge, IconMinus, IconPause, IconPlaySmall, IconReset, IconSkip } from '../../components/Icons';
import { PainPicker } from '../../components/PainPicker';
import { ProgressRing } from '../../components/ProgressRing';
import { Stepper } from '../../components/Stepper';
import type { SessionProgress } from '../../db/repo';
import type { Exercise, Session } from '../../db/types';
import { KIND_LABEL, REGION_LABEL, SIDE_LABEL } from '../../logic/labels';
import { vibrate } from '../../platform/feedback';
import { afterRest, afterSetDone, editUpcomingSets, goToExercise, markSetDone, setPainDuring } from './flow';
import { formatClock, useCountdown } from './useCountdown';

interface Props {
  session: Session;
  progress: SessionProgress;
  exercise?: Exercise;
  onChange: (s: Session, p: SessionProgress) => void;
}

function RestView({ restSec, resetKey, onDone }: { restSec: number; resetKey: string; onDone: () => void }) {
  const cd = useCountdown(restSec, resetKey, true, onDone);
  return (
    <>
      <ProgressRing progress={restSec > 0 ? cd.remainingSec / restSec : 0} variant="rest">
        <div class="phase-label rest">Dinlenme</div>
        <div class="big-number" role="timer" aria-live="off">
          {formatClock(cd.remainingSec)}
        </div>
        <div class="ring-label">sonraki set</div>
      </ProgressRing>
      <div class="spacer" />
      <div class="bottom-actions two">
        <button class="btn big" onClick={() => (cd.running ? cd.pause() : cd.start())}>
          {cd.running ? <IconPause aria-hidden="true" /> : <IconPlaySmall aria-hidden="true" />}
          {cd.running ? 'Duraklat' : 'Sürdür'}
        </button>
        <button class="btn primary big" onClick={onDone}>
          <IconSkip aria-hidden="true" />
          Atla
        </button>
      </div>
    </>
  );
}

function TimerWork({ target, resetKey, onDone }: { target: number; resetKey: string; onDone: (elapsed: number) => void }) {
  const cd = useCountdown(target, resetKey, false, () => onDone(target));
  const done = cd.remainingSec === 0;
  return (
    <>
      <ProgressRing progress={target > 0 ? (target - cd.remainingSec) / target : 0} variant={done ? 'reached' : 'work'}>
        <div class="phase-label">{cd.running ? 'Devam' : 'Hazır'}</div>
        <div class={`big-number${done ? ' reached' : ''}`} role="timer" aria-live="off">
          {formatClock(cd.remainingSec)}
        </div>
        <div class="ring-label">{cd.remainingSec >= 60 ? 'kalan süre' : 'saniye kaldı'}</div>
      </ProgressRing>
      <div class="spacer" />
      <div class="bottom-actions">
        <button class="btn primary huge" onClick={() => (cd.running ? cd.pause() : cd.start())}>
          {cd.running ? <IconPause aria-hidden="true" /> : <IconPlaySmall aria-hidden="true" fill="currentColor" />}
          {cd.running ? 'Duraklat' : cd.remainingSec < target ? 'Sürdür' : 'Başlat'}
        </button>
        <div class="bottom-actions two">
          <button class="btn big" onClick={cd.reset}>
            <IconReset aria-hidden="true" />
            Sıfırla
          </button>
          <button class="btn tinted big" onClick={() => onDone(Math.max(0, cd.elapsedSec))}>
            <IconCheck aria-hidden="true" />
            Set bitti
          </button>
        </div>
      </div>
    </>
  );
}

function RepsWork({
  count,
  target,
  onCount,
  onDone,
}: {
  count: number;
  target: number;
  onCount: (n: number) => void;
  onDone: () => void;
}) {
  const reached = target > 0 && count >= target;
  return (
    <>
      <ProgressRing progress={target > 0 ? count / target : 0} variant={reached ? 'reached' : 'work'} fast>
        <div class="phase-label">Tekrar</div>
        <div class={`big-number${reached ? ' reached' : ''}`} aria-live="polite">
          {count}
        </div>
        <div class="ring-label">
          <span class="of">/ {target}</span> hedef
        </div>
      </ProgressRing>
      <div class="spacer" />
      <div class="bottom-actions">
        <div class="bottom-actions two">
          <button class="btn big" disabled={count === 0} onClick={() => onCount(count - 1)} aria-label="Bir azalt">
            <IconMinus aria-hidden="true" />1
          </button>
          <button class={`btn big${reached ? ' primary' : ' tinted'}`} onClick={onDone}>
            <IconCheck aria-hidden="true" />
            Set bitti
          </button>
        </div>
        <button
          class="btn primary huge rep-button"
          onClick={() => {
            const n = count + 1;
            if (n === target) vibrate(80);
            onCount(n);
          }}
        >
          +1
        </button>
      </div>
    </>
  );
}

export function ExerciseStep({ session, progress: p, exercise, onChange }: Props) {
  const [showAdjust, setShowAdjust] = useState(false);
  const entry = session.entries[p.exIndex];
  const kind = exercise?.kind ?? entry.kind ?? 'reps';
  const set = entry.sets[p.setIndex];
  const restSec = exercise?.restSec ?? 30;
  const isLast = p.exIndex >= session.entries.length - 1;
  const resetKey = `${p.exIndex}-${p.setIndex}-${p.phase}`;
  const target = kind === 'reps' ? set?.reps ?? 0 : kind === 'hold' ? set?.holdSec ?? 0 : set?.durationSec ?? 0;
  const region = exercise?.region ?? entry.region ?? 'wrist';

  const finishSet = (patch: Parameters<typeof markSetDone>[2]) => {
    const s = markSetDone(session, p, patch);
    onChange(s, afterSetDone(s, p, restSec));
  };

  return (
    <div class={`session-body region-${region}`}>
      <div class="progress-bar" aria-hidden="true">
        <span style={{ width: `${((p.exIndex + (p.phase === 'complete' ? 1 : 0)) / session.entries.length) * 100}%` }} />
      </div>
      <div class="ex-header">
        <div class="overline">
          Egzersiz {p.exIndex + 1}/{session.entries.length}
        </div>
        <h1>{exercise?.name ?? entry.name ?? 'Egzersiz'}</h1>
        <div class="ex-meta">
          <span class="region-chip">{REGION_LABEL[region]}</span>
          {exercise?.side && <span class="tag">{SIDE_LABEL[exercise.side]}</span>}
          <span class="tag">{KIND_LABEL[kind]}</span>
          {set?.loadKg ? <span class="tag">{set.loadKg} kg</span> : null}
          {exercise?.bandLevel && <span class="tag">Bant: {exercise.bandLevel}</span>}
        </div>
        {exercise?.instructions && <p class="ex-instructions">{exercise.instructions}</p>}
      </div>

      <div class="set-dots" aria-label={`Set ${p.setIndex + 1} / ${entry.sets.length}`}>
        {entry.sets.map((s, i) => (
          <span key={i} class={`${s.done ? 'done' : ''} ${i === p.setIndex && p.phase !== 'complete' ? 'current' : ''}`} />
        ))}
      </div>
      <div class="center small muted">
        {p.phase === 'complete' ? 'Tüm setler tamam' : `Set ${p.setIndex + 1} / ${entry.sets.length}`}
      </div>

      {p.phase === 'rest' && <RestView restSec={restSec} resetKey={resetKey} onDone={() => onChange(session, afterRest(p))} />}

      {p.phase === 'work' && set && kind === 'reps' && (
        <RepsWork
          count={p.count}
          target={target}
          onCount={(n) => onChange(session, { ...p, count: Math.max(0, n) })}
          onDone={() => finishSet({ reps: p.count })}
        />
      )}
      {p.phase === 'work' && set && kind !== 'reps' && (
        <TimerWork
          target={target}
          resetKey={resetKey}
          onDone={(elapsed) => finishSet(kind === 'hold' ? { holdSec: elapsed } : { durationSec: elapsed })}
        />
      )}

      {p.phase === 'complete' && (
        <>
          <ProgressRing progress={1} variant="reached">
            <IconCheck aria-hidden="true" size={72} strokeWidth={2.5} style={{ color: 'var(--ok)' }} />
            <div class="ring-label">Egzersiz tamam</div>
          </ProgressRing>
          <div class="spacer" />
          <div class="card" style={{ marginBottom: 'var(--s-3)' }}>
            <div class="headline">Egzersiz sırasında en yüksek ağrı</div>
            <div class="small faint" style={{ marginBottom: 'var(--s-3)' }}>
              İsteğe bağlı
            </div>
            <PainPicker
              label="Egzersiz sırasında en yüksek ağrı"
              value={entry.painDuring}
              onChange={(v) => onChange(setPainDuring(session, p.exIndex, entry.painDuring === v ? undefined : v), p)}
            />
          </div>
          <button class="btn primary huge block" onClick={() => onChange(session, goToExercise(session, p, p.exIndex + 1))}>
            {isLast ? 'Seans sonu' : 'Sonraki egzersiz'}
            <IconChevronRight aria-hidden="true" />
          </button>
        </>
      )}

      {p.phase === 'work' && set && (
        <div style={{ marginTop: 'var(--s-2)' }}>
          <button class="btn ghost block compact-text" aria-expanded={showAdjust} onClick={() => setShowAdjust(!showAdjust)}>
            <IconGauge aria-hidden="true" />
            {showAdjust ? 'Ayarları gizle' : 'Bu seti ayarla · ağrı gir'}
          </button>
          {showAdjust && (
            <div class="card stack">
              {kind === 'reps' && (
                <Stepper label="Hedef tekrar" value={set.reps ?? 0} min={1} onChange={(v) => onChange(editUpcomingSets(session, p, { reps: v }), p)} />
              )}
              {kind === 'hold' && (
                <Stepper label="Tutuş" unit="sn" value={set.holdSec ?? 0} min={1} onChange={(v) => onChange(editUpcomingSets(session, p, { holdSec: v }), p)} />
              )}
              {kind === 'timed' && (
                <Stepper label="Süre" unit="sn" step={5} value={set.durationSec ?? 0} min={5} onChange={(v) => onChange(editUpcomingSets(session, p, { durationSec: v }), p)} />
              )}
              <Stepper label="Yük" unit="kg" step={0.5} value={set.loadKg ?? 0} onChange={(v) => onChange(editUpcomingSets(session, p, { loadKg: v || undefined }), p)} />
              <p class="small faint" style={{ margin: '0' }}>
                Değişiklik bu ve sonraki setlere uygulanır.
              </p>
              <hr class="divider" />
              <div class="headline">Egzersiz sırasında en yüksek ağrı</div>
              <PainPicker
                label="Egzersiz sırasında en yüksek ağrı"
                value={entry.painDuring}
                onChange={(v) => onChange(setPainDuring(session, p.exIndex, entry.painDuring === v ? undefined : v), p)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
