import { useEffect, useState } from 'preact/hooks';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Stepper } from '../../components/Stepper';
import { db } from '../../db/db';
import { deleteExercise, getSettings, saveExercise, type ExerciseInput } from '../../db/repo';
import { REGIONS, type ExerciseKind, type Region, type Side } from '../../db/types';
import { KIND_LABEL, REGION_LABEL } from '../../logic/labels';
import { navigate } from '../../router';
import { returnToSession, sessionPick } from '../../state';

const EMPTY: ExerciseInput = {
  name: '',
  region: 'ankle',
  kind: 'reps',
  defaultSets: 3,
  defaultReps: 10,
  holdSec: 10,
  durationSec: 60,
  restSec: 30,
  active: true,
};

export function ExerciseForm({ id }: { id: string }) {
  const isNew = id === 'new';
  const [form, setForm] = useState<ExerciseInput | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      if (isNew) {
        const s = await getSettings();
        setForm({ ...EMPTY, side: s.defaultSides.ankle });
        return;
      }
      const ex = await db.exercises.get(id);
      if (!ex) return navigate('/settings/program', true);
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = ex;
      setIsSample(!!ex.isSample);
      setForm({ holdSec: 10, durationSec: 60, defaultReps: 10, ...rest });
    })();
  }, [id]);

  if (!form) return null;
  const set = <K extends keyof ExerciseInput>(k: K, v: ExerciseInput[K]) => setForm({ ...form, [k]: v });
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v.replace(',', '.'))));

  const save = async () => {
    if (!form.name.trim()) {
      setError('İsim gerekli.');
      return;
    }
    const clean: ExerciseInput = {
      ...form,
      name: form.name.trim(),
      instructions: form.instructions?.trim() || undefined,
      bandLevel: form.bandLevel?.trim() || undefined,
      defaultReps: form.kind === 'reps' ? form.defaultReps : undefined,
      holdSec: form.kind === 'hold' ? form.holdSec : undefined,
      durationSec: form.kind === 'timed' ? form.durationSec : undefined,
      isSample: false,
    };
    const savedId = await saveExercise(clean, isNew ? undefined : id);
    if (returnToSession.value) {
      // a new exercise added from the session screen is ticked for this session if it is inactive
      if (!clean.active) sessionPick.value = { ...sessionPick.value, included: [...sessionPick.value.included, savedId] };
      navigate('/session');
    } else navigate('/settings/program');
  };

  return (
    <div class="stack">
      <PageHeader
        title={isNew ? 'Yeni egzersiz' : 'Egzersizi düzenle'}
        back={returnToSession.value ? { href: '#/session', label: 'Seansa dön' } : { href: '#/settings/program', label: 'Program' }}
      />
      {isSample && <p class="tag sample">Örnek egzersiz — kendi programına göre düzenle</p>}

      <label class="field">
        <span>İsim</span>
        <input type="text" value={form.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} placeholder="ör. Bilek fleksiyon-ekstansiyon" />
      </label>

      <div class="field">
        <span class="small muted">Bölge</span>
        <div class="segmented" role="group" aria-label="Bölge">
          {REGIONS.map((r: Region) => (
            <button
              key={r}
              aria-pressed={form.region === r}
              onClick={async () => {
                const s = await getSettings();
                setForm({ ...form, region: r, side: form.side ? s.defaultSides[r] : undefined });
              }}
            >
              {REGION_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <div class="field">
        <span class="small muted">Taraf</span>
        <div class="segmented" role="group" aria-label="Taraf">
          {([undefined, 'left', 'right'] as (Side | undefined)[]).map((sd) => (
            <button key={sd ?? 'none'} aria-pressed={form.side === sd} onClick={() => set('side', sd)}>
              {sd === 'left' ? 'Sol' : sd === 'right' ? 'Sağ' : 'Belirtme'}
            </button>
          ))}
        </div>
      </div>

      <div class="field">
        <span class="small muted">Tür</span>
        <div class="segmented" role="group" aria-label="Tür">
          {(['reps', 'hold', 'timed'] as ExerciseKind[]).map((k) => (
            <button key={k} aria-pressed={form.kind === k} onClick={() => set('kind', k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <section class="card stack">
        <Stepper label="Set" value={form.defaultSets} min={1} max={50} onChange={(v) => set('defaultSets', v)} />
        {form.kind === 'reps' && <Stepper label="Tekrar" value={form.defaultReps ?? 10} min={1} max={200} onChange={(v) => set('defaultReps', v)} />}
        {form.kind === 'hold' && <Stepper label="Tutuş" unit="sn" value={form.holdSec ?? 10} min={1} max={600} onChange={(v) => set('holdSec', v)} />}
        {form.kind === 'timed' && <Stepper label="Süre" unit="sn" step={5} value={form.durationSec ?? 60} min={5} max={3600} onChange={(v) => set('durationSec', v)} />}
        <Stepper label="Dinlenme" unit="sn" step={5} value={form.restSec} min={0} max={600} onChange={(v) => set('restSec', v)} />
      </section>

      <div class="row">
        <label class="field grow">
          <span>Yük (kg, isteğe bağlı)</span>
          <input type="number" inputMode="decimal" min={0} step={0.5} value={form.loadKg ?? ''} onInput={(e) => set('loadKg', num((e.target as HTMLInputElement).value))} />
        </label>
        <label class="field grow">
          <span>Direnç bandı</span>
          <input type="text" value={form.bandLevel ?? ''} placeholder="ör. Sarı" onInput={(e) => set('bandLevel', (e.target as HTMLInputElement).value)} />
        </label>
      </div>

      <label class="field">
        <span>Kısa açıklama</span>
        <textarea value={form.instructions ?? ''} onInput={(e) => set('instructions', (e.target as HTMLTextAreaElement).value)} />
      </label>

      <label class="switch-row card">
        <span>Aktif (seanslarda görünsün)</span>
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', (e.target as HTMLInputElement).checked)} />
      </label>

      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

      <div class="sticky-cta stack">
        <button class="btn primary big block" onClick={() => void save()}>
          Kaydet
        </button>
      </div>
      {!isNew && (
        <button class="btn danger block" onClick={() => setConfirmDel(true)}>
          Egzersizi sil
        </button>
      )}

      {confirmDel && (
        <Modal
          title="Egzersizi sil?"
          onClose={() => setConfirmDel(false)}
          actions={
            <>
              <button
                class="btn danger block big"
                onClick={async () => {
                  await deleteExercise(id);
                  navigate(returnToSession.value ? '/session' : '/settings/program');
                }}
              >
                Sil
              </button>
              <button class="btn block" onClick={() => setConfirmDel(false)}>
                Vazgeç
              </button>
            </>
          }
        >
          <p>Geçmiş seanslardaki kayıtlar korunur. Sadece programdan kaldırmak istiyorsan pasif yapmayı düşün.</p>
        </Modal>
      )}
    </div>
  );
}
