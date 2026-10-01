export interface BarsProps {
  values: number[];
  /** Podpisy pod pierwszym i ostatnim słupkiem - reszta byłaby nieczytelna na 360 px. */
  xFirst: string;
  xLast: string;
  ariaLabel: string;
  format?: (value: number) => string;
}

const W = 340, H = 132;
const R = 332, T = 12, Bo = 104;

/**
 * Słupki. Ten sam ręczny SVG co wykres liniowy - wielkości okresowe (tonaż tygodnia)
 * czyta się jako sumy, a nie jako ciągły przebieg, więc linia byłaby tu myląca.
 */
export function Bars({ values, xFirst, xLast, ariaLabel, format }: BarsProps) {
  const max = Math.max(1, ...values);
  const step = (R - 24) / Math.max(1, values.length);
  const width = Math.max(4, step * 0.62);

  return (
    <svg className="dz-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <line className="dz-chart__axis" x1={24} y1={Bo} x2={R} y2={Bo} />
      <text className="dz-chart__label" x={20} y={T + 8} textAnchor="end">
        {format ? format(max) : max}
      </text>

      {values.map((v, i) => {
        const h = ((v / max) * (Bo - T)) || 0;
        return (
          <rect
            key={i}
            x={24 + i * step + (step - width) / 2}
            y={Bo - h}
            width={width}
            height={h}
            fill={i === values.length - 1 ? "var(--stamp)" : "var(--ink-3)"}
          />
        );
      })}

      <text className="dz-chart__label" x={24} y={H - 8}>{xFirst}</text>
      <text className="dz-chart__label" x={R} y={H - 8} textAnchor="end">{xLast}</text>
    </svg>
  );
}
