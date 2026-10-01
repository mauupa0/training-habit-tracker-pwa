"use client";

import { useCallback, useEffect, useRef } from 'react';
import { toPl, fromPl } from './format';

const HOLD_DELAY = 420;   // ms do rozpoczęcia przewijania
const HOLD_REPEAT = 90;   // ms między krokami

export interface StepperProps {
  id: string;
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  onChange: (value: number) => void;
  /** Etykiety czytników ekranu; domyślne są generyczne. */
  decLabel?: string;
  incLabel?: string;
}

/**
 * Ciężar / powtórzenia / RIR.
 * Long-press przewija. Tap w liczbę otwiera klawiaturę numeryczną.
 * Nie dodawaj onClick obok pointerdown - podwoiłby pierwszy krok.
 */
export function Stepper({
  id, label, value, step, min = 0, max = Number.MAX_SAFE_INTEGER,
  decimals = 2, onChange, decLabel, incLabel,
}: StepperProps) {
  const delay = useRef<number | undefined>(undefined);
  const repeat = useRef<number | undefined>(undefined);
  const latest = useRef(value);
  latest.current = value;

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, Math.round(n * 10 ** decimals) / 10 ** decimals)),
    [min, max, decimals],
  );

  const stop = useCallback(() => {
    window.clearTimeout(delay.current);
    window.clearInterval(repeat.current);
  }, []);

  useEffect(() => stop, [stop]);

  const hold = (dir: 1 | -1) => {
    const bump = () => onChange(clamp(latest.current + dir * step));
    bump();
    stop();
    delay.current = window.setTimeout(() => {
      repeat.current = window.setInterval(bump, HOLD_REPEAT);
    }, HOLD_DELAY);
  };

  return (
    <div className="dz-stepper">
      <label className="dz-stepper__label" htmlFor={id}>{label}</label>
      <div className="dz-stepper__box">
        <button
          type="button" className="dz-stepper__btn"
          aria-label={decLabel ?? `Zmniejsz: ${label}`}
          onPointerDown={() => hold(-1)}
          onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        >−</button>

        <input
          id={id} className="dz-stepper__input"
          inputMode="decimal" enterKeyHint="done"
          value={toPl(value, decimals)}
          onChange={(e) => {
            const n = fromPl(e.target.value);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
        />

        <button
          type="button" className="dz-stepper__btn"
          aria-label={incLabel ?? `Zwiększ: ${label}`}
          onPointerDown={() => hold(1)}
          onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        >+</button>
      </div>
    </div>
  );
}
