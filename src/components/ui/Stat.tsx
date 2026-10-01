export interface StatProps {
  label: string;
  value: string;
  unit?: string;
  /** hero = liczba główna ekranu, 44 px. */
  variant?: 'default' | 'hero';
}

export function Stat({ label, value, unit, variant = 'default' }: StatProps) {
  return (
    <div className={variant === 'hero' ? 'dz-stat dz-stat--hero' : 'dz-stat'}>
      <span className="dz-stat__label">{label}</span>
      <div className="dz-stat__row">
        <span className="dz-stat__value">{value}</span>
        {unit && <span className="dz-stat__unit">{unit}</span>}
      </div>
    </div>
  );
}
