/** Static SVG line chart for print (crisp at any DPI, no canvas). */
export interface MiniSeries {
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

export function MiniChart({ labels, series, yMax, width = 320, height = 120, unit = '' }: { labels: string[]; series: MiniSeries[]; yMax?: number; width?: number; height?: number; unit?: string }) {
  const pad = { l: 28, r: 8, t: 8, b: 18 };
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const max = yMax ?? Math.max(1, Math.ceil(Math.max(...all, 0) * 1.1));
  const n = labels.length;
  const x = (i: number) => pad.l + (n <= 1 ? (width - pad.l - pad.r) / 2 : (i * (width - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const ticks = [0, max / 2, max];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" class="mini-chart" role="img" aria-label={series.map((s) => s.label).join(', ')}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="#ccc" stroke-width="0.5" />
          <text x={pad.l - 4} y={y(t) + 3} font-size="8" text-anchor="end" fill="#555">
            {Math.round(t)}
            {unit}
          </text>
        </g>
      ))}
      {n > 0 && (
        <>
          <text x={x(0)} y={height - 4} font-size="8" fill="#555" text-anchor={n === 1 ? 'middle' : 'start'}>
            {labels[0]}
          </text>
          {n > 1 && (
            <text x={x(n - 1)} y={height - 4} font-size="8" fill="#555" text-anchor="end">
              {labels[n - 1]}
            </text>
          )}
        </>
      )}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
        return (
          <g key={s.label}>
            {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={s.color} stroke-width="1.6" stroke-dasharray={s.dashed ? '4 3' : undefined} />}
            {s.values.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="2" fill={s.color} />))}
          </g>
        );
      })}
    </svg>
  );
}
