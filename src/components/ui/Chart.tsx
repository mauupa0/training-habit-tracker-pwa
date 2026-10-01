export interface Series {
  values: number[];
  variant?: 'main' | 'pess' | 'opt';
}

export interface Marker {
  index: number;
  label?: string;
  /** neutral = --ink-3, current = --stamp, dip = --mark (dołek na osi prognozy). */
  kind?: 'neutral' | 'current' | 'dip';
}

export interface ChartProps {
  series: Series[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  xFirst: string;
  xLast: string;
  /** Opisz TREND słowami, nie liczbami. Czytnik ekranu nie ogląda wykresu. */
  ariaLabel: string;
  markers?: Marker[];
  /** Pasmo niepewności: [dolne wartości, górne wartości]. */
  band?: [number[], number[]];
  /** Opis podziałki, gdy sama liczba nic nie mówi - np. minuty od północy jako godzina. */
  yFormat?: (value: number) => string;
}

const W = 340, H = 158;
const R = 330, T = 14, Bo = 130;
/** Lewy margines rośnie z długością etykiet - „06:35" nie mieści się tam, gdzie „85". */
function leftMargin(labels: string[]): number {
  const longest = labels.reduce((max, l) => Math.max(max, l.length), 1);
  return Math.min(48, 12 + longest * 5.4);
}

/**
 * Ręczny SVG. Bez Recharts, bez Chart.js, bez D3 - wykresy są proste,
 * a ręczny SVG jest lżejszy, działa offline i wygląda jak papier milimetrowy.
 * Pod każdym wykresem umieść <DataTable> z tymi samymi danymi.
 */
export function Chart({
  series, yMin, yMax, yTicks, xFirst, xLast, ariaLabel, markers = [], band, yFormat,
}: ChartProps) {
  const n = Math.max(...series.map((s) => s.values.length));
  const label = (t: number) => (yFormat ? yFormat(t) : String(t));
  const L = leftMargin(yTicks.map(label));
  const x = (i: number) => L + (i * (R - L)) / Math.max(1, n - 1);
  const y = (v: number) => Bo - ((v - yMin) / (yMax - yMin)) * (Bo - T);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const cls: Record<string, string> = {
    main: 'dz-chart__line',
    pess: 'dz-chart__line dz-chart__line--pess',
    opt: 'dz-chart__line dz-chart__line--opt',
  };
  const dot: Record<string, { r: number; fill: string }> = {
    neutral: { r: 3.5, fill: 'var(--ink-3)' },
    current: { r: 4.5, fill: 'var(--stamp)' },
    dip: { r: 4.5, fill: 'var(--mark)' },
  };

  return (
    <svg className="dz-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {band && (
        <path
          className="dz-chart__band"
          d={`${path(band[1])} ${band[0].map((v, i) => `L${x(band[0].length - 1 - i).toFixed(1)},${y(band[0][band[0].length - 1 - i]).toFixed(1)}`).join(' ')} Z`}
        />
      )}

      <line className="dz-chart__axis" x1={L} y1={Bo} x2={R} y2={Bo} />
      <line className="dz-chart__axis" x1={L} y1={T} x2={L} y2={Bo} />

      {yTicks.map((t) => (
        <g key={t}>
          <line className="dz-chart__grid" x1={L} y1={y(t)} x2={R} y2={y(t)} />
          <text className="dz-chart__label" x={L - 6} y={y(t) + 4} textAnchor="end">{label(t)}</text>
        </g>
      ))}

      <text className="dz-chart__label" x={L} y={H - 10}>{xFirst}</text>
      <text className="dz-chart__label" x={R} y={H - 10} textAnchor="end">{xLast}</text>

      {series.map((s, i) => (
        <path key={i} className={cls[s.variant ?? 'main']} d={path(s.values)} />
      ))}

      {markers.map((m, i) => {
        const d = dot[m.kind ?? 'neutral'];
        const v = series[0].values[m.index];
        return (
          <g key={i}>
            <circle cx={x(m.index)} cy={y(v)} r={d.r} fill={d.fill} />
            {m.label && (
              <text className="dz-chart__anno" x={x(m.index)} y={y(v) + 17} textAnchor="middle">{m.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
