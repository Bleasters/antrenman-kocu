import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface SeriesDef {
  label: string;
  /** CSS variable name, e.g. '--series-1' */
  colorVar: string;
  kind?: 'line' | 'bar';
}

interface Props {
  /** x labels, one per point (x is the index, so points are evenly spaced). */
  labels: string[];
  series: SeriesDef[];
  values: (number | null)[][];
  yRange?: [number, number];
  height?: number;
  format?: (v: number) => string;
  ariaLabel: string;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function useColorScheme(): string {
  const [scheme, setScheme] = useState(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return scheme;
}

export function Chart({ labels, series, values, yRange, height = 220, format = (v) => String(v), ariaLabel }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const scheme = useColorScheme();
  const n = labels.length;

  useEffect(() => {
    const el = wrap.current;
    if (!el || n === 0) return;
    const text = cssVar('--text-2');
    const grid = cssVar('--border');
    const xs = labels.map((_, i) => i);
    const axis = { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: '12px system-ui' };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { size: 10 } },
      scales: {
        x: { time: false, range: [-0.5, Math.max(0.5, n - 0.5)] },
        y: yRange ? { range: yRange } : { range: (_u, _min, max) => [0, Math.max(1, Math.ceil(max * 1.15))] },
      },
      axes: [
        {
          ...axis,
          space: 48,
          incrs: [1, 2, 3, 4, 5, 7, 10, 14, 20, 30, 50, 100],
          values: (_u, splits) => splits.map((i) => (Number.isInteger(i) && labels[i] ? labels[i] : '')),
        },
        { ...axis, size: 36, values: (_u, splits) => splits.map((v) => (Number.isInteger(v) ? String(v) : '')) },
      ],
      series: [
        {},
        ...series.map((s, i) => {
          const color = cssVar(s.colorVar);
          return s.kind === 'bar'
            ? {
                label: s.label,
                stroke: color,
                fill: color,
                width: 0,
                paths: uPlot.paths.bars!({ size: [0.6, 48] }),
                points: { show: false },
              }
            : {
                label: s.label,
                stroke: color,
                width: 2.5,
                spanGaps: true,
                dash: i === 2 ? [6, 4] : undefined,
                points: { show: true, size: 7, fill: color },
              };
        }),
      ],
      hooks: {
        setCursor: [(u) => setIdx(u.cursor.idx ?? null)],
      },
    };
    const u = new uPlot(opts, [xs, ...values] as uPlot.AlignedData, el);
    plot.current = u;

    // iOS: drag a finger across the chart to scrub values (vertical page scroll still works).
    const over = u.over;
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const r = over.getBoundingClientRect();
      u.setCursor({ left: t.clientX - r.left, top: t.clientY - r.top });
    };
    over.addEventListener('touchstart', onTouch, { passive: true });
    over.addEventListener('touchmove', onTouch, { passive: true });

    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      over.removeEventListener('touchstart', onTouch);
      over.removeEventListener('touchmove', onTouch);
      u.destroy();
      plot.current = null;
    };
    // values/labels identity changes on each render; serialize to compare content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(labels), JSON.stringify(values), scheme, height]);

  if (n === 0) return <div class="empty">Bu aralıkta veri yok.</div>;

  const shown = idx ?? n - 1;
  return (
    <figure style={{ margin: 0 }} aria-label={ariaLabel}>
      <div class="chart-legend" aria-live="polite">
        <span class="muted">{labels[shown]}</span>
        {series.map((s, i) => {
          const v = values[i][shown];
          return (
            <span key={s.label}>
              <span class="sw" style={{ background: `var(${s.colorVar})` }} />
              {s.label}: <b>{v == null ? '–' : format(v)}</b>
            </span>
          );
        })}
      </div>
      <div class="chart-wrap" ref={wrap} />
    </figure>
  );
}
