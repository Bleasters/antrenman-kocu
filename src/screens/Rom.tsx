import { useEffect, useRef, useState } from 'preact/hooks';
import { PageHeader } from '../components/PageHeader';
import { PlacementDiagram } from '../components/PlacementDiagram';
import { db } from '../db/db';
import { useLive } from '../db/live';
import { deleteRom, saveRom, updateRomMeta } from '../db/repo';
import { IconColumns, IconInfo, IconNote, IconReset, IconRuler, IconTrash } from '../components/Icons';
import { healthyReference, needsHealthyMeasurement, otherSide } from '../logic/symmetry';
import { REGIONS, type Region, type RomMeasurement, type RomMovement, type RomTiming, type Side } from '../db/types';
import { useSessions, useSettings } from '../hooks';
import { formatLongTR, todayISO } from '../logic/dates';
import { REGION_LABEL, SIDE_LABEL, TIMING_LABEL, TIMING_SHORT } from '../logic/labels';
import { defaultRomTiming } from '../logic/stats';
import { angleBetweenDeg, captureStep, median, MOVEMENTS, movementsFor, roundAngle, WINDOW_MESSAGE, type Vec3 } from '../logic/rom';
import { beep, countdownBeep, finishBeep, unlockAudio } from '../platform/feedback';
import { motionSupported, requestMotionPermission, startMotionStream, type MotionPermission, type MotionStream } from '../platform/motion';

const TRIALS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function SensorMeasure({ onResult }: { onResult: (angle: number, trials: number[]) => void }) {
  const [perm, setPerm] = useState<MotionPermission | 'unknown'>('unknown');
  const [handsFree, setHandsFree] = useState(false);
  const [g0, setG0] = useState<Vec3 | null>(null);
  const [trials, setTrials] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const stream = useRef<MotionStream | null>(null);
  useEffect(() => {
    if (perm !== 'granted') return;
    stream.current = startMotionStream();
    return () => {
      stream.current?.stop();
      stream.current = null;
    };
  }, [perm]);

  const capture = async (): Promise<Vec3 | null> => {
    if (handsFree) {
      for (const n of [2, 1]) {
        setBusy(`${n}…`);
        countdownBeep();
        await sleep(1000);
      }
    }
    setBusy('Sabit tut…');
    // waits out the tap jolt, then takes the first steady 1 s window (up to a few seconds)
    const start = performance.now();
    for (;;) {
      await sleep(100);
      const step = captureStep(stream.current?.samples() ?? [], start, performance.now());
      if (step.status === 'wait') continue;
      setBusy(null);
      if (step.status === 'fail') {
        beep(220, 300);
        setMsg({ kind: 'error', text: WINDOW_MESSAGE[step.reason] });
        return null;
      }
      finishBeep();
      return step.vector;
    }
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

      <div class="rom-step" aria-live="polite">
        <span class="overline">Adım {g0 ? 2 : 1} / 2</span>
        <div class="callout muted">{g0 ? 'Hareketin sonuna git, tut ve "Ölç"e bas.' : 'Nötr pozisyonda telefonu yerleştir ve "Sıfırla"ya bas.'}</div>
      </div>
      {/* One big button: "Sıfırla" until the neutral position is captured, then "Ölç". */}
      <button
        class="btn primary huge block"
        disabled={!!busy}
        onClick={async () => {
          unlockAudio();
          setMsg(null);
          if (!g0) {
            const v = await capture();
            if (v) {
              setG0(v);
              setMsg({ kind: 'ok', text: 'Sıfırlandı.' });
            }
            return;
          }
          const v = await capture();
          if (v) {
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
        {g0 ? <IconRuler aria-hidden="true" /> : <IconReset aria-hidden="true" />}
        {g0 ? 'Ölç' : 'Sıfırla'}
      </button>
      {g0 && !busy && (
        <button
          class="btn ghost block compact-text"
          onClick={() => {
            setG0(null);
            setMsg(null);
          }}
        >
          Yeniden sıfırla
        </button>
      )}

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
      <p class="small muted" style={{ margin: '0px' }}>
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

function trialsText(t?: number[]): string | null {
  if (!t?.length) return null;
  return t.length > 1 ? `${t.length} ölçümün medyanı: ${t.join('°, ')}°` : `Tek ölçüm: ${t[0]}°`;
}

function RomItem({ m }: { m: RomMeasurement }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.notes ?? '');
  const [timing, setTiming] = useState<RomTiming | undefined>(m.timing);
  const trials = trialsText(m.trials);
  return (
    <li style={{ flexWrap: 'wrap' }}>
      <div class="rom-angle num">
        {m.angleDeg}
        <span>°</span>
      </div>
      <div class="grow" style={{ minWidth: '0px' }}>
        <div class="row wrap" style={{ gap: '6px' }}>
          <span class="callout">{formatLongTR(m.date)}</span>
          {m.timing && <span class="tag">{TIMING_SHORT[m.timing]}</span>}
        </div>
        <div class="small muted">{m.method === 'sensor' ? 'Sensör' : 'Manuel'}</div>
        {trials && <div class="small muted">{trials}</div>}
        {m.notes && !editing && (
          <div class="small">
            <span class="muted">Not:</span> {m.notes}
          </div>
        )}
      </div>
      {!editing && (
        <>
          <button
            class="icon-btn"
            style={{ background: 'transparent' }}
            aria-label={m.notes ? 'Notu düzenle' : 'Not ekle'}
            title={m.notes ? 'Notu düzenle' : 'Not ekle'}
            onClick={() => {
              setText(m.notes ?? '');
              setTiming(m.timing);
              setEditing(true);
            }}
          >
            <IconNote />
          </button>
          <button class="icon-btn" style={{ background: 'transparent' }} aria-label="Ölçümü sil" title="Sil" onClick={() => confirm('Bu ölçüm silinsin mi?') && void deleteRom(m.id)}>
            <IconTrash />
          </button>
        </>
      )}
      {editing && (
        <div class="stack" style={{ flexBasis: '100%' }}>
          <div class="segmented" role="group" aria-label="Ölçüm zamanı">
            {(['pre', 'post'] as RomTiming[]).map((t) => (
              <button key={t} aria-pressed={timing === t} onClick={() => setTiming(t)}>
                {TIMING_LABEL[t]}
              </button>
            ))}
          </div>
          <input
            type="text"
            aria-label="Not"
            value={text}
            placeholder="ör. sabah, ağrı 3/10, ısınmadan önce"
            ref={(el) => el?.focus()}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
          />
          <div class="bottom-actions two">
            <button class="btn" onClick={() => setEditing(false)}>
              Vazgeç
            </button>
            <button
              class="btn primary"
              onClick={async () => {
                await updateRomMeta(m.id, { notes: text, timing });
                setEditing(false);
              }}
            >
              Kaydet
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function Rom() {
  const settings = useSettings();
  const sessions = useSessions();
  const [timingOverride, setTiming] = useState<RomTiming | null>(null);
  const [region, setRegion] = useState<Region>('ankle');
  const [movement, setMovement] = useState<RomMovement>('ankle_dorsiflexion');
  const [sideOverride, setSide] = useState<Side | null>(null);
  const [askHealthy, setAskHealthy] = useState(false);
  const [mode, setMode] = useState<'sensor' | 'manual'>('sensor');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<{ text: string; id: string } | null>(null);
  const history = useLive(() => db.rom.where('movement').equals(movement).toArray(), [movement], []);
  if (!settings || !sessions) return null;
  const injured = settings.injuredSides[region];
  const healthy = injured === 'none' ? null : otherSide(injured);
  const side = sideOverride ?? (injured !== 'none' ? injured : settings.defaultSides[region]);
  const timing = timingOverride ?? defaultRomTiming(sessions, Date.now());
  const info = MOVEMENTS[movement];
  // the healthy side is measured once and used everywhere: no pre/post split for it
  const isHealthy = healthy !== null && side === healthy;
  const healthyRef = healthy ? healthyReference(history, movement, healthy) : null;
  const sorted = history.filter((h) => h.side === side).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const recent = isHealthy ? sorted.slice(0, 8) : sorted.filter((h) => h.timing === timing).slice(0, 8);
  const legacy = isHealthy ? [] : sorted.filter((h) => !h.timing).slice(0, 8);

  const store = async (angle: number, method: 'sensor' | 'manual', date: string, trials?: number[]) => {
    const id = await saveRom({ date, region, side, movement, angleDeg: angle, method, timing: isHealthy ? undefined : timing, trials, notes: notes.trim() || undefined });
    const tag = isHealthy ? 'sağlam taraf' : TIMING_SHORT[timing].toLocaleLowerCase('tr');
    setSaved({ id, text: `${info.label} (${SIDE_LABEL[side]}, ${tag}): ${angle}° kaydedildi.` });
    // after the injured side, offer the healthy side only if it has never been measured
    setAskHealthy(injured !== 'none' && side === injured && needsHealthyMeasurement(history, movement, injured));
    setNotes('');
  };

  return (
    <div class="stack">
      <PageHeader title="ROM ölçümü" />
      {!isHealthy && (
      <div class="segmented" role="group" aria-label="Ölçüm zamanı">
        {(['pre', 'post'] as RomTiming[]).map((t) => (
          <button
            key={t}
            aria-pressed={timing === t}
            onClick={() => {
              setTiming(t);
              setSaved(null);
            }}
          >
            {TIMING_LABEL[t]}
          </button>
        ))}
      </div>
      )}
      <div class="segmented" role="group" aria-label="Bölge">
        {REGIONS.map((r) => (
          <button
            key={r}
            aria-pressed={region === r}
            onClick={() => {
              setRegion(r);
              setMovement(movementsFor(r)[0]);
              setSide(null);
              setAskHealthy(false);
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
              setAskHealthy(false);
            }}
          >
            {MOVEMENTS[m].label.replace(/^(Bilek|Ayak bileği|Diz) /, '')}
          </button>
        ))}
      </div>
      <div class="row spread">
        <span>Taraf</span>
        <div class="segmented" style={{ minWidth: '160px' }}>
          {(['left', 'right'] as Side[]).map((s) => (
            <button
              key={s}
              aria-pressed={side === s}
              onClick={() => {
                setSide(s);
                setAskHealthy(false);
              }}
            >
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {healthy && (
        <div class={`row region-${region}`} style={{ gap: 'var(--s-2)', alignItems: 'flex-start', marginTop: 'var(--s-2)' }}>
          <IconInfo aria-hidden="true" size={18} style={{ color: 'var(--text-3)', flex: 'none', marginTop: '2px' }} />
          <p class="small muted" style={{ margin: '0' }}>
            {side === injured ? 'Yaralı taraf' : 'Sağlam taraf'} ölçülüyor (yaralı: {SIDE_LABEL[injured as Side].toLocaleLowerCase('tr')}, sağlam:{' '}
            {SIDE_LABEL[healthy].toLocaleLowerCase('tr')}). İki tarafı da aynı pozisyon ve telefon yerleşimiyle ölç.
            {isHealthy && (
              <>
                {' '}
                Sağlam taraf bir kez ölçülür; antrenman öncesi/sonrası ayrımı yoktur ve değeri tüm ölçümlerde kullanılır.
                {healthyRef ? ` Kayıtlı değer: ${healthyRef.value}° (${formatLongTR(healthyRef.lastDate)}); yeniden ölçersen yenisi kullanılır.` : ''}
              </>
            )}
          </p>
        </div>
      )}

      <section class={`card stack region-${region}`}>
        <h2 class="row" style={{ gap: '0', fontSize: 'var(--fs-headline)' }}>
          <span class="region-dot" aria-hidden="true" />
          {info.label}
        </h2>
        <PlacementDiagram movement={movement} />
        <p style={{ margin: '0px' }}>{info.placement}</p>
        <p class="small muted" style={{ margin: '0px' }}>
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
          <SensorMeasure key={`${movement}-${side}`} onResult={(a, t) => void store(a, 'sensor', todayISO(), t)} />
        ) : (
          <ManualMeasure key={`${movement}-${side}`} onResult={(a, d) => void store(a, 'manual', d)} />
        )}
        {saved && (
          <div class="row spread" style={{ marginTop: '12px' }}>
            <p role="status" style={{ color: 'var(--green)', fontWeight: 600, margin: '0px' }}>
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
        {askHealthy && healthy && (
          <div class="card accent stack" style={{ marginTop: 'var(--s-3)' }} role="status">
            <div class="row" style={{ gap: 'var(--s-3)' }}>
              <div class="status-icon accent">
                <IconColumns aria-hidden="true" />
              </div>
              <div class="grow">
                <div class="headline">Sağlam tarafı da ölçmek ister misin?</div>
                <div class="small muted">
                  Bu hareket için sağlam taraf verisi yok. Bir kez ölçmen yeterli; tüm ölçümlerde kullanılır.
                </div>
              </div>
            </div>
            <div class="bottom-actions two">
              <button class="btn compact-text" onClick={() => setAskHealthy(false)}>
                Şimdi değil
              </button>
              <button
                class="btn primary compact-text"
                onClick={() => {
                  setSide(healthy);
                  setAskHealthy(false);
                  setSaved(null);
                }}
              >
                Sağlam tarafı ölç
              </button>
            </div>
          </div>
        )}
      </section>

      <h2 class="section-title">
        Son ölçümler · {SIDE_LABEL[side]} · {isHealthy ? 'sağlam taraf' : TIMING_SHORT[timing]}
      </h2>
      {recent.length === 0 ? (
        <div class="empty">{isHealthy ? 'Sağlam taraf henüz ölçülmedi.' : `Henüz ${TIMING_LABEL[timing].toLocaleLowerCase('tr')} ölçümü yok.`}</div>
      ) : (
        <ul class="list card">
          {recent.map((m) => (
            <RomItem key={m.id} m={m} />
          ))}
        </ul>
      )}
      {legacy.length > 0 && (
        <>
          <h2 class="section-title">Zamanı belirtilmemiş</h2>
          <p class="small muted" style={{ marginTop: '0px' }}>
            Bu ölçümler öncesi/sonrası seçeneği gelmeden önce kaydedildi. Kalemle düzenleyip zamanını seçebilirsin.
          </p>
          <ul class="list card">
            {legacy.map((m) => (
              <RomItem key={m.id} m={m} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
