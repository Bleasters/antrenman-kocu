import { useState } from 'preact/hooks';
import { Chart } from '../components/Chart';
import { evaluateAll, useExercises, useSessions, useSettings } from '../hooks';
import { formatLongTR, formatShortTR, todayISO } from '../logic/dates';
import { REGION_LABEL } from '../logic/labels';
import { LEVEL_TITLE } from '../logic/painRules';
import { filterSessions, painSeries, rangeStart, weeklyCounts, type RegionFilter, type TimeRange } from '../logic/stats';
import { REGIONS } from '../db/types';

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
  if (!sessions || !settings) return null;

  const today = todayISO();
  const from = rangeStart(range, today);
  const pain = painSeries(sessions, region, from);
  const weeks = weeklyCounts(sessions, region, today, from);
  const evals = new Map(evaluateAll(sessions, settings, exercises ?? []).map((e) => [e.sessionId, e]));
  const recent = filterSessions(sessions, region, from).reverse().slice(0, 20);

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

      <section class="card grey">
        <p class="small" style={{ margin: 0 }}>
          ROM ve yük/hacim grafikleri Faz 2'de eklenecek.
        </p>
      </section>

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
