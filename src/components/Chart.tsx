import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface SeriesDef {
  label: string;
  /** CSS variable name, e.g. '--ankle' */
  colorVar: string;
  kind?: 'line' | 'bar';
  /** dashed line (reference / comparison series) */
  dashed?: boolean;
  /** soft area fill under the line */
  fill?: boolean;
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
    const text = cssVar('--chart-axis');
    const grid = cssVar('--chart-grid');
    const surface = cssVar('--surface');
    const xs = labels.map((_, i) => i);
    const font = `500 11px ${getComputedStyle(document.documentElement).getPropertyValue('--font') || 'system-ui'}`;
    const axis = { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { show: false }, border: { show: false }, font, gap: 6 };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      legend: { show: false },
      cursor: {
        drag: { x: false, y: false },
        points: { size: 11, width: 2.5, stroke: () => surface, fill: (u, i) => (u.series[i].stroke as () => string)() },
      },
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
        { ...axis, size: 30, grid: { ...axis.grid, show: true }, values: (_u, splits) => splits.map((v) => (Number.isInteger(v) ? String(v) : '')) },
      ],
      series: [
        {},
        ...series.map((s) => {
          const color = cssVar(s.colorVar);
          return s.kind === 'bar'
            ? {
                label: s.label,
                stroke: () => color,
                fill: color,
                width: 0,
                paths: uPlot.paths.bars!({ size: [0.55, 36], radius: 0.25 }),
                points: { show: false },
              }
            : {
                label: s.label,
                stroke: () => color,
                width: s.dashed ? 1.75 : 2.5,
                spanGaps: true,
                dash: s.dashed ? [5, 5] : undefined,
                fill: s.fill ? `${color}22` : undefined,
                paths: uPlot.paths.spline!(),
                points: { show: n <= 16, size: s.dashed ? 0 : 6, width: 0, fill: color, stroke: color },
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
    <figure style={{ margin: '0px' }} aria-label={ariaLabel}>
      <div class="chart-legend" aria-live="polite">
        <span class="muted">{labels[shown]}</span>
        {series.map((s, i) => {
          const v = values[i][shown];
          return (
            <span key={s.label}>
              <span class={`sw${s.dashed ? ' dashed' : ''}`} style={{ background: `var(${s.colorVar})`, color: `var(${s.colorVar})` }} />
              {s.label}: <b>{v == null ? '–' : format(v)}</b>
            </span>
          );
        })}
      </div>
      <div class="chart-wrap" ref={wrap} />
    </figure>
  );
}
