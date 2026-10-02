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
  matchesTiming,
  romSeries,
  weeklyCounts,
  type RomTimingFilter,
  type RegionFilter,
  type TimeRange,
} from '../logic/stats';
import { REGIONS, type RomMovement } from '../db/types';
import { db } from '../db/db';
import { useLive } from '../db/live';
import { MOVEMENT_LIST, MOVEMENTS } from '../logic/rom';
import { EmptyState } from '../components/EmptyState';
import { IconActivity, IconCalendar, IconChevronRight, IconGauge, IconReport, IconRuler } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';

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
  const [romTiming, setRomTiming] = useState<RomTimingFilter>('pre');
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
    (m) =>
      (region === 'all' || MOVEMENTS[m].region === region) &&
      rom.some((r) => r.movement === m && (!from || r.date >= from) && matchesTiming(r, romTiming)),
  );
  const movement = movementSel && romMovements.includes(movementSel) ? movementSel : romMovements[0];
  const romS = movement ? romSeries(rom, movement, from, romTiming) : null;

  const loadExercises = exercisesWithLoad(sessions, region, from);
  const exId = exerciseSel && loadExercises.some((e) => e.exerciseId === exerciseSel) ? exerciseSel : loadExercises[0]?.exerciseId;
  const load = exId ? loadSeries(sessions, exId, from) : null;

  // presentation: region colours
  const regionVar = region === 'all' ? '--accent' : `--${region}`;
  const romRegion = movement ? MOVEMENTS[movement].region : null;
  const operated = romRegion ? settings.defaultSides[romRegion] : 'right';
  const romColor = romRegion ? `--${romRegion}` : '--accent';
  const loadRegion = loadExercises.find((e) => e.exerciseId === exId)?.region;

  return (
    <div class="stack">
      <PageHeader title="İlerleme" />
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
        <div class="card-title" style={{ marginBottom: 'var(--s-1)' }}>
          <IconActivity aria-hidden="true" />
          <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>Ağrı</h2>
        </div>
        {region === 'all' && (
          <p class="small faint" style={{ margin: '0 0 var(--s-2)' }}>
            Tümü: bölgelerin ortalaması.
          </p>
        )}
        <Chart
          ariaLabel="Ağrı grafiği: seans öncesi, sonrası ve ertesi sabah"
          labels={pain.dates.map(formatShortTR)}
          series={[
            { label: 'Önce', colorVar: '--chart-muted', dashed: true },
            { label: 'Sonra', colorVar: regionVar, fill: true },
            { label: 'Ertesi sabah', colorVar: '--text-2' },
          ]}
          values={[pain.before, pain.after, pain.morning]}
          yRange={[0, 10]}
        />
        <p class="chart-hint">Değerleri görmek için grafiğe dokun ya da parmağını kaydır.</p>
      </section>

      <section class="card">
        <div class="card-title" style={{ marginBottom: 'var(--s-2)' }}>
          <IconCalendar aria-hidden="true" />
          <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>Haftalık seans sayısı</h2>
        </div>
        <Chart
          ariaLabel="Haftalık seans sayısı"
          labels={weeks.map((w) => formatShortTR(w.weekStart))}
          series={[{ label: 'Seans', colorVar: regionVar, kind: 'bar' }]}
          values={[weeks.map((w) => w.count)]}
          height={180}
        />
      </section>

      <section class="card">
        <div class="row spread">
          <div class="card-title">
            <IconRuler aria-hidden="true" />
            <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>Hareket açıklığı (ROM)</h2>
          </div>
          <a class="btn tinted compact" href="#/rom">
            Ölç
          </a>
        </div>
        <div class="segmented" role="group" aria-label="Ölçüm zamanı" style={{ marginTop: 'var(--s-3)' }}>
          {(
            [
              ['pre', 'Öncesi'],
              ['post', 'Sonrası'],
              ['all', 'Tümü'],
            ] as [RomTimingFilter, string][]
          ).map(([t, label]) => (
            <button key={t} aria-pressed={romTiming === t} onClick={() => setRomTiming(t)}>
              {label}
            </button>
          ))}
        </div>
        {romMovements.length === 0 ? (
          <EmptyState
            card={false}
            icon={IconRuler}
            title="Ölçüm yok"
            text={`Bu aralıkta ${romTiming === 'pre' ? 'antrenman öncesi ' : romTiming === 'post' ? 'antrenman sonrası ' : ''}ROM ölçümü yok.`}
          />
        ) : (
          <>
            <select aria-label="Hareket" value={movement} onChange={(e) => setMovement((e.target as HTMLSelectElement).value as RomMovement)} style={{ margin: 'var(--s-3) 0' }}>
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
                  operated === 'left' ? { label: 'Sol', colorVar: romColor, fill: true } : { label: 'Sol', colorVar: '--chart-muted', dashed: true },
                  operated === 'right' ? { label: 'Sağ', colorVar: romColor, fill: true } : { label: 'Sağ', colorVar: '--chart-muted', dashed: true },
                ]}
                values={[romS.left, romS.right]}
                format={(v) => `${v}°`}
              />
            )}
          </>
        )}
      </section>

      <section class="card">
        <div class="card-title" style={{ marginBottom: 'var(--s-3)' }}>
          <IconGauge aria-hidden="true" />
          <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>Yük</h2>
        </div>
        {!load || !exId ? (
          <EmptyState card={false} icon={IconGauge} title="Veri yok" text="Bu aralıkta tamamlanmış set yok." />
        ) : (
          <>
            <select aria-label="Egzersiz" value={exId} onChange={(e) => setExercise((e.target as HTMLSelectElement).value)} style={{ marginBottom: 'var(--s-2)' }}>
              {loadExercises.map((e) => (
                <option key={e.exerciseId} value={e.exerciseId}>
                  {e.name}
                </option>
              ))}
            </select>
            <p class="small faint" style={{ margin: '0 0 var(--s-2)' }}>
              {LOAD_METRIC_LABEL[load.metric].title}
            </p>
            <Chart
              ariaLabel="Yük grafiği"
              labels={load.dates.map(formatShortTR)}
              series={[{ label: LOAD_METRIC_LABEL[load.metric].unit, colorVar: loadRegion ? `--${loadRegion}` : '--accent', fill: true }]}
              values={[load.values]}
              format={(v) => `${v} ${LOAD_METRIC_LABEL[load.metric].unit}`}
            />
          </>
        )}
      </section>

      <a class="card list-link" href="#/report" style={{ padding: 'var(--s-3) var(--s-4)' }}>
        <span class="list-icon">
          <IconReport aria-hidden="true" />
        </span>
        <span class="grow headline">Doktor raporu oluştur</span>
        <IconChevronRight class="chev" aria-hidden="true" />
      </a>

      <h2 class="section-title">Seanslar</h2>
      {recent.length === 0 ? (
        <EmptyState icon={IconCalendar} title="Seans yok" text="Bu aralıkta tamamlanmış seans yok." />
      ) : (
        <ul class="list card">
          {recent.map((s) => {
            const ev = evals.get(s.id);
            const dot = ev ? (ev.level === 'green' && ev.provisional ? 'grey' : ev.level) : 'grey';
            return (
              <li key={s.id}>
                <span class={`level-dot ${dot}`} aria-hidden="true" style={{ margin: '0' }} />
                <div class="grow">
                  <div class="row wrap" style={{ gap: 'var(--s-2)' }}>
                    <strong class="callout">{formatLongTR(s.date)}</strong>
                    {s.regions.map((r) => (
                      <span key={r} class={`region-chip region-${r}`} style={{ fontSize: 'var(--fs-caption)', padding: '1px 8px' }}>
                        {REGION_LABEL[r]}
                      </span>
                    ))}
                  </div>
                  <div class="small muted num" style={{ marginTop: '2px' }}>
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
