import { useState } from 'preact/hooks';
import { PlacementDiagram } from '../components/PlacementDiagram';
import { db } from '../db/db';
import { useLive } from '../db/live';
import { deleteRom, saveRom } from '../db/repo';
import { REGIONS, type Region, type RomMovement, type Side } from '../db/types';
import { useSettings } from '../hooks';
import { formatLongTR, todayISO } from '../logic/dates';
import { REGION_LABEL, SIDE_LABEL } from '../logic/labels';
import { analyzeWindow, angleBetweenDeg, median, MOVEMENTS, movementsFor, roundAngle, WINDOW_MESSAGE, type Vec3 } from '../logic/rom';
import { beep, countdownBeep, finishBeep, unlockAudio } from '../platform/feedback';
import { collectSamples, motionSupported, requestMotionPermission, type MotionPermission } from '../platform/motion';

const TRIALS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function SensorMeasure({ onResult }: { onResult: (angle: number, trials: number[]) => void }) {
  const [perm, setPerm] = useState<MotionPermission | 'unknown'>('unknown');
  const [handsFree, setHandsFree] = useState(false);
  const [g0, setG0] = useState<Vec3 | null>(null);
  const [trials, setTrials] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const capture = async (): Promise<Vec3 | null> => {
    if (handsFree) {
      for (const n of [2, 1]) {
        setBusy(`${n}…`);
        countdownBeep();
        await sleep(1000);
      }
    }
    setBusy('Sabit tut…');
    const samples = await collectSamples(1000);
    setBusy(null);
    const r = analyzeWindow(samples);
    if (!r.ok) {
      beep(220, 300);
      setMsg({ kind: 'error', text: WINDOW_MESSAGE[r.reason] });
      return null;
    }
    finishBeep();
    return r.vector;
  };

  if (perm !== 'granted') {
    return (
      <div class="stack">
        {perm === 'denied' && (
          <div class="card orange small">
            <strong>Hareket sensörü izni verilmedi.</strong> Uygulamayı tamamen kapatıp yeniden aç ve "Sensörü etkinleştir"e tekrar bas; iOS izni
            yeniden sorar. Eski iOS sürümlerinde: Ayarlar → Safari → <em>Hareket ve Yön Erişimi</em>'ni aç. Bu arada <strong>Manuel</strong> sekmesinden
            gonyometre değerini girebilirsin.
          </div>
        )}
        {perm === 'unsupported' && <div class="card grey small">Bu cihazda hareket sensörü yok. Manuel giriş kullan.</div>}
        <button
          class="btn primary big block"
          disabled={!motionSupported()}
          onClick={async () => {
            unlockAudio();
            setPerm(await requestMotionPermission());
          }}
        >
          Sensörü etkinleştir
        </button>
      </div>
    );
  }

  const save = (list: number[]) => {
    onResult(roundAngle(median(list)), list);
    setTrials([]);
    setG0(null);
    setMsg(null);
  };

  return (
    <div class="stack">
      <label class="switch-row">
        <span>Eller serbest (2 sn sesli geri sayımla başlar)</span>
        <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree((e.target as HTMLInputElement).checked)} />
      </label>

      <div class="row spread">
        <span>Ölçüm</span>
        <strong>
          {trials.length + 1} / {TRIALS}
        </strong>
      </div>
      {trials.length > 0 && (
        <div class="chips" aria-label="Ölçümler">
          {trials.map((t, i) => (
            <span class="tag" key={i}>
              {i + 1}. {t}°
            </span>
          ))}
        </div>
      )}

      {busy && (
        <div class="big-number" aria-live="assertive" style={{ fontSize: '2.5rem' }}>
          {busy}
        </div>
      )}
      {msg && (
        <p role="status" style={{ color: msg.kind === 'error' ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
          {msg.text}
        </p>
      )}

      <p class="small muted" style={{ margin: 0 }}>
        {g0 ? '2) Hareketin sonuna git ve tut, sonra "Ölç".' : '1) Nötr pozisyonda telefonu yerleştir ve "Sıfırla".'}
      </p>
      <div class="bottom-actions two">
        <button
          class={`btn big${g0 ? '' : ' primary'}`}
          disabled={!!busy}
          onClick={async () => {
            unlockAudio();
            setMsg(null);
            const v = await capture();
            if (v) {
              setG0(v);
              setMsg({ kind: 'ok', text: 'Sıfırlandı.' });
            }
          }}
        >
          Sıfırla
        </button>
        <button
          class={`btn big${g0 ? ' primary' : ''}`}
          disabled={!g0 || !!busy}
          onClick={async () => {
            unlockAudio();
            setMsg(null);
            const v = await capture();
            if (v && g0) {
              const a = roundAngle(angleBetweenDeg(g0, v));
              const next = [...trials, a];
              setG0(null); // re-zero before each trial: the phone may shift on the limb
              if (next.length >= TRIALS) {
                save(next); // 3rd trial: store the median right away
                return;
              }
              setTrials(next);
              const left = TRIALS - next.length;
              setMsg({ kind: 'ok', text: `${next.length}. ölçüm: ${a}°. Medyan için ${left} ölçüm daha: tekrar Sıfırla → Ölç.` });
            }
          }}
        >
          Ölç
        </button>
      </div>

      {trials.length > 0 && (
        <div class="bottom-actions two">
          <button
            class="btn"
            disabled={!!busy}
            onClick={() => {
              setTrials([]);
              setG0(null);
              setMsg(null);
            }}
          >
            Baştan al
          </button>
          <button class="btn" disabled={!!busy} onClick={() => save(trials)}>
            Şimdi kaydet ({trials.length} ölçüm)
          </button>
        </div>
      )}
    </div>
  );
}

function ManualMeasure({ onResult }: { onResult: (angle: number, date: string) => void }) {
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayISO());
  const n = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= -30 && n <= 200;
  return (
    <div class="stack">
      <p class="small muted" style={{ margin: 0 }}>
        Gonyometreyle ya da fizyoterapistinin ölçtüğü değeri gir.
      </p>
      <div class="row">
        <label class="field grow">
          <span>Açı (°)</span>
          <input type="number" inputMode="decimal" step={0.5} value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field grow">
          <span>Tarih</span>
          <input type="date" value={date} max={todayISO()} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <button class="btn primary big block" disabled={!valid} onClick={() => onResult(roundAngle(n), date)}>
        Kaydet
      </button>
    </div>
  );
}

export function Rom() {
  const settings = useSettings();
  const [region, setRegion] = useState<Region>('ankle');
  const [movement, setMovement] = useState<RomMovement>('ankle_dorsiflexion');
  const [sideOverride, setSide] = useState<Side | null>(null);
  const [mode, setMode] = useState<'sensor' | 'manual'>('sensor');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<{ text: string; id: string } | null>(null);
  const history = useLive(() => db.rom.where('movement').equals(movement).toArray(), [movement], []);
  if (!settings) return null;
  const side = sideOverride ?? settings.defaultSides[region];
  const info = MOVEMENTS[movement];
  const recent = history.filter((h) => h.side === side).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 8);

  const store = async (angle: number, method: 'sensor' | 'manual', date: string, extra?: string) => {
    const note = [extra, notes.trim()].filter(Boolean).join(' · ') || undefined;
    const id = await saveRom({ date, region, side, movement, angleDeg: angle, method, notes: note });
    setSaved({ id, text: `${info.label} (${SIDE_LABEL[side]}): ${angle}° kaydedildi.` });
    setNotes('');
  };

  return (
    <div class="stack">
      <h1>ROM ölçümü</h1>
      <div class="segmented" role="group" aria-label="Bölge">
        {REGIONS.map((r) => (
          <button
            key={r}
            aria-pressed={region === r}
            onClick={() => {
              setRegion(r);
              setMovement(movementsFor(r)[0]);
              setSide(null);
              setSaved(null);
            }}
          >
            {REGION_LABEL[r]}
          </button>
        ))}
      </div>
      <div class="chips" role="group" aria-label="Hareket">
        {movementsFor(region).map((m) => (
          <button
            key={m}
            class={`btn${movement === m ? ' selected' : ''}`}
            aria-pressed={movement === m}
            onClick={() => {
              setMovement(m);
              setSaved(null);
            }}
          >
            {MOVEMENTS[m].label.replace(/^(Bilek|Ayak bileği|Diz) /, '')}
          </button>
        ))}
      </div>
      <div class="row spread">
        <span>Taraf</span>
        <div class="segmented" style={{ minWidth: 160 }}>
          {(['left', 'right'] as Side[]).map((s) => (
            <button key={s} aria-pressed={side === s} onClick={() => setSide(s)}>
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <section class="card stack">
        <h2>{info.label}</h2>
        <PlacementDiagram movement={movement} />
        <p style={{ margin: 0 }}>{info.placement}</p>
        <p class="small muted" style={{ margin: 0 }}>
          Doğruluk yaklaşık ±5°. Önemli olan her seferinde aynı pozisyon ve yerleşimle ölçmek.
        </p>
      </section>

      <div class="segmented" role="group" aria-label="Yöntem">
        <button aria-pressed={mode === 'sensor'} onClick={() => setMode('sensor')}>
          Sensör
        </button>
        <button aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>
          Manuel
        </button>
      </div>

      <label class="field">
        <span>Not (isteğe bağlı)</span>
        <input type="text" value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} />
      </label>

      <section class="card">
        {mode === 'sensor' ? (
          <SensorMeasure key={`${movement}-${side}`} onResult={(a, t) => void store(a, 'sensor', todayISO(), `${t.length > 1 ? `${t.length} ölçümün medyanı` : 'Tek ölçüm'}: ${t.join('°, ')}°`)} />
        ) : (
          <ManualMeasure key={`${movement}-${side}`} onResult={(a, d) => void store(a, 'manual', d)} />
        )}
        {saved && (
          <div class="row spread" style={{ marginTop: 12 }}>
            <p role="status" style={{ color: 'var(--green)', fontWeight: 600, margin: 0 }}>
              ✓ {saved.text}
            </p>
            <button
              class="btn ghost"
              style={{ whiteSpace: 'nowrap', flex: 'none' }}
              onClick={async () => {
                await deleteRom(saved.id);
                setSaved(null);
              }}
            >
              Geri al
            </button>
          </div>
        )}
      </section>

      <h2 class="section-title">
        Son ölçümler · {SIDE_LABEL[side]}
      </h2>
      {recent.length === 0 ? (
        <div class="empty">Henüz ölçüm yok.</div>
      ) : (
        <ul class="list card">
          {recent.map((m) => (
            <li key={m.id}>
              <div class="grow">
                <strong>{m.angleDeg}°</strong> <span class="muted small">· {formatLongTR(m.date)} · {m.method === 'sensor' ? 'sensör' : 'manuel'}</span>
                {m.notes && <div class="small muted">{m.notes}</div>}
              </div>
              <button class="icon-btn" aria-label="Ölçümü sil" onClick={() => confirm('Bu ölçüm silinsin mi?') && void deleteRom(m.id)}>
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
