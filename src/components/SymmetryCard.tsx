import type { Side } from '../db/types';
import { formatLongTR } from '../logic/dates';
import { REGION_LABEL, SIDE_LABEL, TIMING_SHORT } from '../logic/labels';
import { MOVEMENTS } from '../logic/rom';
import type { MovementSymmetry, RegionSymmetry } from '../logic/symmetry';
import { IconColumns, IconTrendDown, IconTrendFlat, IconTrendUp, IconWarn } from './Icons';

const pct = (v: number) => `%${Math.round(v)}`;
const deg = (v: number) => `${Math.round(v * 10) / 10}°`;
const lower = (s: string) => s.toLocaleLowerCase('tr');

/** "Sol bilek ekstansiyon: 48° / sağ 66° → %73" */
export function movementLine(m: MovementSymmetry): string {
  const name = `${SIDE_LABEL[m.injuredSide]} ${lower(MOVEMENTS[m.movement].label)}`;
  const c = m.current;
  if (c.status === 'no_injured') return `${name}: yaralı taraf ölçümü yok`;
  if (c.status === 'no_healthy') return `${name}: ${deg(c.injured)} · sağlam taraf verisi yok`;
  if (c.mode === 'deficit') {
    return c.deficit > 0
      ? `${name}: tam ekstansiyona ${deg(c.deficit)} eksik (sağlam tarafa göre)`
      : `${name}: sağlam tarafla aynı (${deg(c.injured)} / ${lower(SIDE_LABEL[m.healthySide])} ${deg(c.healthy)})`;
  }
  return `${name}: ${deg(c.injured)} / ${lower(SIDE_LABEL[m.healthySide])} ${deg(c.healthy)} → ${pct(c.percent)}`;
}

/** "↑ +8 puan" for ratio; for deficit fewer missing degrees is better. */
export function ChangeBadge({ m }: { m: MovementSymmetry }) {
  if (m.change == null) return <span class="small faint">4 haftalık değişim için daha fazla ölçüm gerekli</span>;
  const better = m.mode === 'ratio' ? m.change > 0 : m.change < 0;
  const flat = Math.abs(m.change) < 1;
  const Icon = flat ? IconTrendFlat : m.change > 0 ? IconTrendUp : IconTrendDown;
  const cls = flat ? 'trend-flat' : better ? 'trend-down' : 'trend-up'; // trend-down = good colour (ok)
  const value = m.mode === 'ratio' ? `${m.change > 0 ? '+' : ''}${Math.round(m.change)} puan` : `${m.change > 0 ? '+' : ''}${deg(m.change)} eksik`;
  return (
    <span class={`row small ${cls}`} style={{ gap: '2px', display: 'inline-flex', fontWeight: 'var(--fw-semibold)' }}>
      <Icon aria-hidden="true" size={16} />
      {value}
      <span class="faint" style={{ fontWeight: 'var(--fw-regular)' }}>
        &nbsp;· 4 hafta
      </span>
    </span>
  );
}

export function SymmetryCard({ rs, dominantHand }: { rs: RegionSymmetry; dominantHand: Side }) {
  const h = rs.headline;
  const headPct = h && h.current.status === 'ok' && h.current.mode === 'ratio' ? h.current.percent : null;
  const healthySide: Side = rs.injuredSide === 'left' ? 'right' : 'left';
  const stale = rs.movements.filter((m) => m.healthyNow?.stale || (m.current.status !== 'no_injured' && !m.healthyNow));
  return (
    <section class={`card region-${rs.region}`} aria-label={`${REGION_LABEL[rs.region]} simetri`}>
      <div class="row spread" style={{ alignItems: 'flex-start', gap: 'var(--s-3)' }}>
        <div class="grow">
          <span class="region-chip">{REGION_LABEL[rs.region]}</span>
          <div class="small muted" style={{ marginTop: 'var(--s-2)' }}>
            {h ? `${MOVEMENTS[h.movement].label} · ${SIDE_LABEL[rs.injuredSide].toLocaleLowerCase('tr')} / ${SIDE_LABEL[healthySide].toLocaleLowerCase('tr')}` : 'Yaralı / sağlam taraf'}
          </div>
        </div>
        {headPct != null ? (
          <div class="sym-value num" style={{ flex: 'none' }} aria-label={`Simetri yüzde ${Math.round(headPct)}`}>
            <span class="sym-pct">%</span>
            {Math.round(headPct)}
          </div>
        ) : (
          <span class="small faint" style={{ flex: 'none', marginTop: '4px' }}>
            veri yok
          </span>
        )}
      </div>

      {h && (
        <div style={{ margin: 'var(--s-1) 0 var(--s-3)' }}>
          <ChangeBadge m={h} />
        </div>
      )}

      {rs.progress != null && (
        <div class="sym-progress" role="img" aria-label={`Hedef %${rs.target}; hedefin %${Math.round(rs.progress * 100)}'i`}>
          <div class="sym-track">
            <span style={{ width: `${rs.progress * 100}%` }} />
          </div>
          <div class="row spread small faint" style={{ marginTop: 'var(--s-1)' }}>
            <span>%0</span>
            <span>Hedef %{rs.target}</span>
          </div>
        </div>
      )}

      {rs.movements.length === 0 ? (
        <p class="callout muted" style={{ margin: 'var(--s-3) 0 0' }}>
          Henüz ölçüm yok. Yaralı ve sağlam tarafı{' '}
          <a href="#/rom">ROM ölçümü</a> ekranından ölç.
        </p>
      ) : (
        <ul class="sym-lines">
          {rs.movements.map((m) => (
            <li key={m.movement}>
              <span class="callout">{movementLine(m)}</span>
              {m.currentTiming && <span class="tag" style={{ marginLeft: '6px' }}>{TIMING_SHORT[m.currentTiming]}</span>}
            </li>
          ))}
        </ul>
      )}

      {stale.length > 0 && (
        <div class="row small" style={{ gap: 'var(--s-2)', alignItems: 'flex-start', marginTop: 'var(--s-3)', color: 'var(--warn)' }}>
          <IconWarn aria-hidden="true" size={16} style={{ flex: 'none', marginTop: '2px' }} />
          <span>
            Sağlam tarafı yeniden ölç:{' '}
            {stale
              .map((m) => `${MOVEMENTS[m.movement].label}${m.healthyNow ? ` (son ${formatLongTR(m.healthyNow.lastDate)})` : ' (hiç ölçülmedi)'}`)
              .join(', ')}
            .
          </span>
        </div>
      )}

      {rs.region === 'wrist' && dominantHand === healthySide && (
        <p class="small faint" style={{ margin: 'var(--s-3) 0 0' }}>
          Sağlam el aynı zamanda baskın elin; baskın taraf doğal olarak biraz farklı olabilir, yorumlarken bunu hesaba kat.
        </p>
      )}
    </section>
  );
}

/** Compact per-region summary for the Today screen. */
export function SymmetrySummaryCard({ regions }: { regions: RegionSymmetry[] }) {
  return (
    <a class="card sym-summary" href="#/progress" aria-label="Simetri özeti, İlerleme ekranında ayrıntılar">
      <div class="card-title" style={{ marginBottom: 'var(--s-2)' }}>
        <IconColumns aria-hidden="true" />
        <h2 style={{ margin: '0', fontSize: 'var(--fs-headline)' }}>Simetri</h2>
      </div>
      {regions.map((r) => {
        const c = r.headline?.current;
        const p = c && c.status === 'ok' && c.mode === 'ratio' ? c.percent : null;
        return (
          <div key={r.region} class={`row spread region-${r.region}`} style={{ minHeight: '36px' }}>
            <span class="row callout" style={{ gap: '0' }}>
              <span class="region-dot" aria-hidden="true" />
              {REGION_LABEL[r.region]}
            </span>
            <span class="row" style={{ gap: 'var(--s-2)' }}>
              {p != null ? (
                <>
                  <span class="mini-track" aria-hidden="true">
                    <span style={{ width: `${(r.progress ?? 0) * 100}%` }} />
                  </span>
                  <strong class="num" style={{ fontSize: 'var(--fs-title3)', minWidth: '52px', textAlign: 'right' }}>
                    %{Math.round(p)}
                  </strong>
                </>
              ) : (
                <span class="small muted">{r.movements.length ? 'sağlam tarafı ölç' : 'ölçüm yok'}</span>
              )}
            </span>
          </div>
        );
      })}
    </a>
  );
}
