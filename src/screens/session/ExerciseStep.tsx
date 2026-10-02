import { useState } from 'preact/hooks';
import { PainPicker } from '../../components/PainPicker';
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
      <div class="phase-label rest">Dinlenme</div>
      <div class="big-number rest" role="timer" aria-live="off">
        {formatClock(cd.remainingSec)}
      </div>
      <div class="spacer" />
      <div class="bottom-actions two">
        <button class="btn big" onClick={() => (cd.running ? cd.pause() : cd.start())}>
          {cd.running ? 'Duraklat' : 'Sürdür'}
        </button>
        <button class="btn primary big" onClick={onDone}>
          Atla ›
        </button>
      </div>
    </>
  );
}

function TimerWork({ target, resetKey, onDone }: { target: number; resetKey: string; onDone: (elapsed: number) => void }) {
  const cd = useCountdown(target, resetKey, false, () => onDone(target));
  return (
    <>
      <div class="phase-label">{cd.running ? 'Devam' : 'Hazır'}</div>
      <div class={`big-number${cd.remainingSec === 0 ? ' reached' : ''}`} role="timer" aria-live="off">
        {formatClock(cd.remainingSec)}
      </div>
      <div class="spacer" />
      <div class="bottom-actions">
        <button class="btn primary huge" onClick={() => (cd.running ? cd.pause() : cd.start())}>
          {cd.running ? 'Duraklat' : cd.remainingSec < target ? 'Sürdür' : 'Başlat'}
        </button>
        <div class="bottom-actions two">
          <button class="btn" onClick={cd.reset}>
            Sıfırla
          </button>
          <button class="btn" onClick={() => onDone(Math.max(0, cd.elapsedSec))}>
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
      <div class="phase-label">Tekrar</div>
      <div class={`big-number${reached ? ' reached' : ''}`} aria-live="polite">
        {count}
        <span class="of"> / {target}</span>
      </div>
      <div class="spacer" />
      <div class="bottom-actions">
        <div class="bottom-actions two">
          <button class="btn big" disabled={count === 0} onClick={() => onCount(count - 1)} aria-label="Bir azalt">
            −1
          </button>
          <button class={`btn big${reached ? ' primary' : ''}`} onClick={onDone}>
            Set bitti
          </button>
        </div>
        <button
          class="btn primary huge"
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

  const finishSet = (patch: Parameters<typeof markSetDone>[2]) => {
    const s = markSetDone(session, p, patch);
    onChange(s, afterSetDone(s, p, restSec));
  };

  return (
    <div class="session-body">
      <div class="small muted">
        Egzersiz {p.exIndex + 1}/{session.entries.length}
      </div>
      <h1 style={{ marginTop: 2 }}>{exercise?.name ?? entry.name ?? 'Egzersiz'}</h1>
      <div class="ex-meta">
        <span class="tag">{REGION_LABEL[exercise?.region ?? entry.region ?? 'wrist']}</span>
        {exercise?.side && <span class="tag">{SIDE_LABEL[exercise.side]}</span>}
        <span class="tag">{KIND_LABEL[kind]}</span>
        {set?.loadKg ? <span class="tag">{set.loadKg} kg</span> : null}
        {exercise?.bandLevel && <span class="tag">Bant: {exercise.bandLevel}</span>}
      </div>
      {exercise?.instructions && <p class="muted">{exercise.instructions}</p>}

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
          <div class="big-number reached" aria-hidden="true">
            ✓
          </div>
          <div class="spacer" />
          <div class="card" style={{ marginBottom: 12 }}>
            <strong>Egzersiz sırasında en yüksek ağrı (isteğe bağlı)</strong>
            <div style={{ marginTop: 8 }}>
              <PainPicker
                label="Egzersiz sırasında en yüksek ağrı"
                value={entry.painDuring}
                onChange={(v) => onChange(setPainDuring(session, p.exIndex, entry.painDuring === v ? undefined : v), p)}
              />
            </div>
          </div>
          <button class="btn primary huge block" onClick={() => onChange(session, goToExercise(session, p, p.exIndex + 1))}>
            {isLast ? 'Seans sonu ›' : 'Sonraki egzersiz ›'}
          </button>
        </>
      )}

      {p.phase === 'work' && set && (
        <div style={{ marginTop: 12 }}>
          <button class="btn ghost block" aria-expanded={showAdjust} onClick={() => setShowAdjust(!showAdjust)}>
            {showAdjust ? 'Ayarları gizle' : 'Bu seti ayarla (yük / hedef) · ağrı gir'}
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
              <p class="small muted">Değişiklik bu ve sonraki setlere uygulanır.</p>
              <strong>Egzersiz sırasında en yüksek ağrı</strong>
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
