export interface CorrectionProps {
  label: string;
  was: string;
  now: string;
  reason?: string;
}

/**
 * Korekty są widoczne, nie ukryte. Jedno z trzech dozwolonych użyć --mark.
 * Dotyczy zarówno zmian planu, jak i zmian ciężaru.
 */
export function Correction({ label, was, now, reason }: CorrectionProps) {
  return (
    <div className="dz-correction">
      <span className="dz-correction__label">{label}</span>
      <p className="dz-correction__body">
        <span className="dz-correction__was">{was}</span>
        {' → '}
        <span className="dz-correction__now">{now}</span>
      </p>
      {reason && <p className="dz-correction__reason">{reason}</p>}
    </div>
  );
}
