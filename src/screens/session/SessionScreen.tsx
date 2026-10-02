import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Modal } from '../../components/Modal';
import { PainInput } from '../../components/PainPicker';
import { RuleCard } from '../../components/RuleCard';
import { db } from '../../db/db';
import {
  createSession,
  discardActiveSession,
  finishSession,
  getActiveProgress,
  getSettings,
  listExercises,
  saveDraft,
  type SessionProgress,
} from '../../db/repo';
import type { Exercise, RedFlag, Region, Session } from '../../db/types';
import { RED_FLAGS, REGIONS } from '../../db/types';
import { evaluateAll } from '../../hooks';
import { RED_FLAG_LABEL, REGION_LABEL } from '../../logic/labels';
import type { SessionEvaluation } from '../../logic/painRules';
import { unlockAudio } from '../../platform/feedback';
import { allowScreenOff, keepScreenOn } from '../../platform/wakeLock';
import { navigate } from '../../router';
import { prefs, sessionActive } from '../../state';
import { ExerciseStep } from './ExerciseStep';
import { goToExercise } from './flow';

/** Sound + wake lock need a user gesture on iOS; called from the first tap of every screen. */
function gestureFeatures() {
  unlockAudio();
  void keepScreenOn();
}

function RegionSelect({ exercises, onStart }: { exercises: Exercise[]; onStart: (r: Region[]) => void }) {
  const active = exercises.filter((e) => e.active);
  const [sel, setSel] = useState<Region[]>(() =>
    (prefs.lastRegions as Region[]).filter((r) => REGIONS.includes(r) && active.some((e) => e.region === r)),
  );
  const chosen = active.filter((e) => sel.includes(e.region));
  const toggle = (r: Region) => setSel(sel.includes(r) ? sel.filter((x) => x !== r) : REGIONS.filter((x) => x === r || sel.includes(x)));
  return (
    <div class="session-body">
      <h1>Yeni seans</h1>
      <p class="muted">Bugün hangi bölgeleri çalışacaksın?</p>
      <div class="stack">
        {REGIONS.map((r) => {
          const n = active.filter((e) => e.region === r).length;
          return (
            <button key={r} class={`btn big block${sel.includes(r) ? ' selected' : ''}`} aria-pressed={sel.includes(r)} disabled={n === 0} onClick={() => toggle(r)}>
              <span class="grow" style={{ textAlign: 'left' }}>
                {REGION_LABEL[r]}
              </span>
              <span class="small">{n} egzersiz</span>
            </button>
          );
        })}
      </div>
      {chosen.length > 0 && (
        <ol class="small muted" style={{ marginTop: 16, paddingLeft: 20 }}>
          {chosen.map((e) => (
            <li key={e.id}>{e.name}</li>
          ))}
        </ol>
      )}
      {active.length === 0 && (
        <p class="card grey">
          Aktif egzersiz yok. <a href="#/settings/program">Programı düzenle</a>
        </p>
      )}
      <div class="spacer" />
      <button
        class="btn primary huge block"
        disabled={chosen.length === 0}
        onClick={() => {
          gestureFeatures();
          prefs.setLastRegions(sel);
          onStart(sel);
        }}
      >
        Seansı başlat
      </button>
    </div>
  );
}

function PainStep({
  title,
  hint,
  session,
  field,
  onChange,
  children,
  cta,
  onNext,
}: {
  title: string;
  hint: string;
  session: Session;
  field: 'painBefore' | 'painAfter';
  onChange: (s: Session) => void;
  children?: ComponentChildren;
  cta: string;
  onNext: () => void;
}) {
  const map = session[field];
  const complete = session.regions.every((r) => map[r] != null);
  return (
    <div class="session-body">
      <h1>{title}</h1>
      <p class="muted">{hint}</p>
      {session.regions.map((r) => (
        <div class="card" key={r}>
          <PainInput label={REGION_LABEL[r]} value={map[r]} onChange={(v) => onChange({ ...session, [field]: { ...map, [r]: v } })} />
        </div>
      ))}
      {children}
      <div class="spacer" />
      <button class="btn primary huge block" disabled={!complete} onClick={onNext}>
        {cta}
      </button>
      {!complete && <p class="small muted center">Her bölge için bir değer seç.</p>}
    </div>
  );
}

function RedFlagsAndNotes({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const flags = session.redFlags ?? [];
  const toggle = (f: RedFlag) => onChange({ ...session, redFlags: flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f] });
  return (
    <>
      <h2 style={{ marginTop: 16 }}>Kırmızı bayraklar</h2>
      <p class="small muted">Varsa işaretle. Herhangi biri işaretlenirse sonuç "Dur — doktoruna/fizyoterapistine danış" olur.</p>
      {RED_FLAGS.map((f) => (
        <label key={f} class={`check-row${flags.includes(f) ? ' checked' : ''}`}>
          <input type="checkbox" checked={flags.includes(f)} onChange={() => toggle(f)} />
          <span>{RED_FLAG_LABEL[f]}</span>
        </label>
      ))}
      <label class="field" style={{ marginTop: 16 }}>
        <span>Not (isteğe bağlı)</span>
        <textarea value={session.notes ?? ''} onInput={(e) => onChange({ ...session, notes: (e.target as HTMLTextAreaElement).value })} />
      </label>
    </>
  );
}

export function SessionScreen() {
  const [loaded, setLoaded] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<SessionProgress | null>(null);
  const [result, setResult] = useState<SessionEvaluation | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    void (async () => {
      const [ex, p] = await Promise.all([listExercises(), getActiveProgress()]);
      setExercises(ex);
      if (p) {
        const s = await db.sessions.get(p.sessionId);
        if (s) {
          setSession(s);
          setProgress(p);
        }
      }
      setLoaded(true);
    })();
  }, []);

  const running = !!session && !!progress && !result;
  useEffect(() => {
    sessionActive.value = running;
  }, [running]);
  useEffect(
    () => () => {
      sessionActive.value = false;
      void allowScreenOff();
    },
    [],
  );

  /** Every change is written to IndexedDB immediately (serialised) so nothing is lost on close. */
  const update = (s: Session, p: SessionProgress) => {
    setSession(s);
    setProgress(p);
    saveChain.current = saveChain.current.then(() => saveDraft(s, p)).catch((e) => console.error(e));
  };

  if (!loaded) return null;

  if (result && session) {
    return (
      <div class="session-body">
        <h1>Seans kaydedildi</h1>
        <RuleCard ev={result} />
        <div class="spacer" />
        <button class="btn primary huge block" onClick={() => navigate('/')}>
          Bugün'e dön
        </button>
      </div>
    );
  }

  if (!session || !progress) {
    return (
      <RegionSelect
        exercises={exercises}
        onStart={async (regions) => {
          const list = exercises.filter((e) => e.active && regions.includes(e.region));
          const s = await createSession(regions, list);
          setSession(s);
          setProgress({ sessionId: s.id, step: 'before', exIndex: 0, setIndex: 0, phase: 'work', count: 0 });
        }}
      />
    );
  }

  const exById = new Map(exercises.map((e) => [e.id, e]));

  const finish = async () => {
    await saveChain.current;
    const done = await finishSession(session);
    await allowScreenOff();
    const [all, settings] = await Promise.all([db.sessions.toArray(), getSettings()]);
    const ev = evaluateAll(all, settings, exercises).find((e) => e.sessionId === done.id) ?? null;
    setSession(done);
    setResult(ev);
  };

  return (
    <div onClickCapture={gestureFeatures}>
      <div class="session-top">
        <button class="btn ghost" onClick={() => setExitOpen(true)}>
          ✕ Çık
        </button>
        {progress.step === 'exercise' && (
          <div class="row">
            <button class="btn ghost" disabled={progress.exIndex === 0} onClick={() => update(session, goToExercise(session, progress, progress.exIndex - 1))}>
              ‹ Önceki
            </button>
            <button class="btn ghost" onClick={() => update(session, goToExercise(session, progress, progress.exIndex + 1))}>
              Atla ›
            </button>
          </div>
        )}
      </div>

      {progress.step === 'before' && (
        <PainStep
          title="Seans öncesi ağrı"
          hint="Şu anki ağrın, 0 (yok) – 10 (dayanılmaz)."
          session={session}
          field="painBefore"
          onChange={(s) => update(s, progress)}
          cta={session.entries.length ? 'Egzersizlere geç ›' : 'Devam ›'}
          onNext={() => update(session, goToExercise(session, progress, 0))}
        />
      )}

      {progress.step === 'exercise' && session.entries[progress.exIndex] && (
        <ExerciseStep session={session} progress={progress} exercise={exById.get(session.entries[progress.exIndex].exerciseId)} onChange={update} />
      )}

      {progress.step === 'after' && (
        <PainStep
          title="Seans sonrası"
          hint="Seans bitti. Şu anki ağrın?"
          session={session}
          field="painAfter"
          onChange={(s) => update(s, progress)}
          cta="Seansı bitir ve kaydet"
          onNext={() => void finish()}
        >
          <RedFlagsAndNotes session={session} onChange={(s) => update(s, progress)} />
        </PainStep>
      )}

      {exitOpen && (
        <Modal
          title="Seanstan çık"
          onClose={() => {
            setExitOpen(false);
            setConfirmDelete(false);
          }}
          actions={
            confirmDelete ? (
              <>
                <button
                  class="btn danger big block"
                  onClick={async () => {
                    await saveChain.current;
                    await discardActiveSession();
                    await allowScreenOff();
                    navigate('/');
                  }}
                >
                  Evet, seansı sil
                </button>
                <button class="btn block" onClick={() => setConfirmDelete(false)}>
                  Vazgeç
                </button>
              </>
            ) : (
              <>
                {progress.step === 'exercise' && (
                  <button
                    class="btn primary big block"
                    onClick={() => {
                      setExitOpen(false);
                      update(session, { ...progress, step: 'after' });
                    }}
                  >
                    Erken bitir (sonrası ağrıya geç)
                  </button>
                )}
                <button
                  class="btn big block"
                  onClick={async () => {
                    await saveChain.current;
                    await allowScreenOff();
                    navigate('/');
                  }}
                >
                  Sonra devam et
                </button>
                <button class="btn danger block" onClick={() => setConfirmDelete(true)}>
                  Seansı sil
                </button>
                <button class="btn ghost block" onClick={() => setExitOpen(false)}>
                  Seansa dön
                </button>
              </>
            )
          }
        >
          <p>{confirmDelete ? 'Bu seansın tüm kayıtları silinecek.' : 'Seans kaydedildi; istediğin zaman kaldığın yerden devam edebilirsin.'}</p>
        </Modal>
      )}
    </div>
  );
}
