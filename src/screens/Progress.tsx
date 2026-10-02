import { useState } from 'preact/hooks';
import { Chart } from '../components/Chart';
import { evaluateAll, useExercises, useSessions, useSettings } from '../hooks';
import { formatLongTR, formatShortTR, todayISO } from '../logic/dates';
import { REGION_LABEL } from '../logic/labels';
import { LEVEL_TITLE } from '../logic/painRules';
import {
  exercisesWithLoad,
  filterSessions,
  LOAD_METRIC_LABEL,
  loadSeries,
  painSeries,
  rangeStart,
  romSeries,
  weeklyCounts,
  type RegionFilter,
  type TimeRange,
} from '../logic/stats';
import { REGIONS, type RomMovement } from '../db/types';
import { db } from '../db/db';
import { useLive } from '../db/live';
import { MOVEMENT_LIST, MOVEMENTS } from '../logic/rom';

const RANGES: { v: TimeRange; label: string }[] = [
  { v: '4w', label: '4 hafta' },
  { v: '3m', label: '3 ay' },
  { v: 'all', label: 'Tümü' },
];

export function Progress() {
  const sessions = useSessions();
  const settings = useSettings();
  const exercises = useExercises();
  const [region, setRegion] = useState<RegionFilter>('all');
  const [range, setRange] = useState<TimeRange>('4w');
  const [movementSel, setMovement] = useState<RomMovement | null>(null);
  const [exerciseSel, setExercise] = useState<string | null>(null);
  const rom = useLive(() => db.rom.toArray(), [], []);
  if (!sessions || !settings) return null;

  const today = todayISO();
  const from = rangeStart(range, today);
  const pain = painSeries(sessions, region, from);
  const weeks = weeklyCounts(sessions, region, today, from);
  const evals = new Map(evaluateAll(sessions, settings, exercises ?? []).map((e) => [e.sessionId, e]));
  const recent = filterSessions(sessions, region, from).reverse().slice(0, 20);

  const romMovements = MOVEMENT_LIST.filter(
    (m) => (region === 'all' || MOVEMENTS[m].region === region) && rom.some((r) => r.movement === m && (!from || r.date >= from)),
  );
  const movement = movementSel && romMovements.includes(movementSel) ? movementSel : romMovements[0];
  const romS = movement ? romSeries(rom, movement, from) : null;

  const loadExercises = exercisesWithLoad(sessions, region, from);
  const exId = exerciseSel && loadExercises.some((e) => e.exerciseId === exerciseSel) ? exerciseSel : loadExercises[0]?.exerciseId;
  const load = exId ? loadSeries(sessions, exId, from) : null;

  return (
    <div class="stack">
      <h1>İlerleme</h1>
      <div class="segmented" role="group" aria-label="Bölge">
        {(['all', ...REGIONS] as RegionFilter[]).map((r) => (
          <button key={r} aria-pressed={region === r} onClick={() => setRegion(r)}>
            {r === 'all' ? 'Tümü' : r === 'ankle' ? 'A. bileği' : REGION_LABEL[r]}
          </button>
        ))}
      </div>
      <div class="segmented" role="group" aria-label="Zaman aralığı">
        {RANGES.map((r) => (
          <button key={r.v} aria-pressed={range === r.v} onClick={() => setRange(r.v)}>
            {r.label}
          </button>
        ))}
      </div>

      <section class="card">
        <h2>Ağrı</h2>
        {region === 'all' && <p class="small muted">Tümü: bölgelerin ortalaması.</p>}
        <Chart
          ariaLabel="Ağrı grafiği: seans öncesi, sonrası ve ertesi sabah"
          labels={pain.dates.map(formatShortTR)}
          series={[
            { label: 'Önce', colorVar: '--series-1' },
            { label: 'Sonra', colorVar: '--series-2' },
            { label: 'Ertesi sabah', colorVar: '--series-3' },
          ]}
          values={[pain.before, pain.after, pain.morning]}
          yRange={[0, 10]}
        />
        <p class="small muted" style={{ marginBottom: 0 }}>
          Değerleri görmek için grafiğe dokun ya da parmağını kaydır.
        </p>
      </section>

      <section class="card">
        <h2>Haftalık seans sayısı</h2>
        <Chart
          ariaLabel="Haftalık seans sayısı"
          labels={weeks.map((w) => formatShortTR(w.weekStart))}
          series={[{ label: 'Seans', colorVar: '--accent', kind: 'bar' }]}
          values={[weeks.map((w) => w.count)]}
          height={180}
        />
      </section>

      <section class="card">
        <div class="row spread">
          <h2 style={{ margin: 0 }}>Hareket açıklığı (ROM)</h2>
          <a class="btn" href="#/rom">
            Ölç
          </a>
        </div>
        {romMovements.length === 0 ? (
          <div class="empty">Bu aralıkta ROM ölçümü yok.</div>
        ) : (
          <>
            <select aria-label="Hareket" value={movement} onChange={(e) => setMovement((e.target as HTMLSelectElement).value as RomMovement)} style={{ margin: '10px 0' }}>
              {romMovements.map((m) => (
                <option key={m} value={m}>
                  {MOVEMENTS[m].label}
                </option>
              ))}
            </select>
            {romS && (
              <Chart
                ariaLabel="ROM açı trendi"
                labels={romS.dates.map(formatShortTR)}
                series={[
                  { label: 'Sol', colorVar: '--series-1' },
                  { label: 'Sağ', colorVar: '--series-2' },
                ]}
                values={[romS.left, romS.right]}
                format={(v) => `${v}°`}
              />
            )}
          </>
        )}
      </section>

      <section class="card">
        <h2>Yük</h2>
        {!load || !exId ? (
          <div class="empty">Bu aralıkta tamamlanmış set yok.</div>
        ) : (
          <>
            <select aria-label="Egzersiz" value={exId} onChange={(e) => setExercise((e.target as HTMLSelectElement).value)} style={{ marginBottom: 6 }}>
              {loadExercises.map((e) => (
                <option key={e.exerciseId} value={e.exerciseId}>
                  {e.name}
                </option>
              ))}
            </select>
            <p class="small muted" style={{ margin: '0 0 6px' }}>
              {LOAD_METRIC_LABEL[load.metric].title}
            </p>
            <Chart
              ariaLabel="Yük grafiği"
              labels={load.dates.map(formatShortTR)}
              series={[{ label: LOAD_METRIC_LABEL[load.metric].unit, colorVar: '--series-3' }]}
              values={[load.values]}
              format={(v) => `${v} ${LOAD_METRIC_LABEL[load.metric].unit}`}
            />
          </>
        )}
      </section>

      <a class="btn block big" href="#/report">
        Doktor raporu oluştur ›
      </a>

      <h2 class="section-title">Seanslar</h2>
      {recent.length === 0 ? (
        <div class="empty">Bu aralıkta seans yok.</div>
      ) : (
        <ul class="list card">
          {recent.map((s) => {
            const ev = evals.get(s.id);
            const dot = ev ? (ev.level === 'green' && ev.provisional ? 'grey' : ev.level) : 'grey';
            return (
              <li key={s.id}>
                <span class={`level-dot ${dot}`} aria-hidden="true" />
                <div class="grow">
                  <div>
                    <strong>{formatLongTR(s.date)}</strong> · {s.regions.map((r) => REGION_LABEL[r]).join(', ')}
                  </div>
                  <div class="small muted">
                    {ev ? LEVEL_TITLE[ev.level] : ''}
                    {ev?.provisional ? ' (geçici)' : ''} ·{' '}
                    {s.regions.map((r) => `${s.painBefore[r] ?? '–'}→${s.painAfter[r] ?? '–'}→${s.painNextMorning?.[r] ?? '–'}`).join(' · ')}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
