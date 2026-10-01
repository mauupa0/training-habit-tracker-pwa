"use client";

import { useEffect, useState } from 'react';
import { clock } from './format';

export interface RestTimerProps {
  /** Znacznik czasu końca przerwy w ms. 0 = brak przerwy. */
  endsAt: number;
  /** Pełna długość przerwy w sekundach - do wyliczenia wypełnienia. */
  total: number;
  onDone?: () => void;
}

/**
 * Pasek u góry ekranu sesji. NIE blokuje interfejsu - można logować wcześniej.
 *
 * Licznik jest pochodną Date.now(), nie dekrementacją: interwał w tle
 * jest dławiony i timer liczony tykaniem rozjeżdża się o dziesiątki sekund.
 */
export function RestTimer({ endsAt, total, onDone }: RestTimerProps) {
  const left = (): number => (endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(left);

  useEffect(() => {
    if (!endsAt) { setSeconds(0); return; }
    setSeconds(left());
    let prev = left();
    const id = window.setInterval(() => {
      const next = left();
      // efekt uboczny poza updaterem: React woła updater dwukrotnie w trybie ścisłym
      if (prev > 0 && next === 0) onDone?.();
      prev = next;
      setSeconds(next);
    }, 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  const pct = endsAt && total ? ((total - seconds) / total) * 100 : 0;

  return (
    <div className="dz-rest">
      <div className="dz-rest__track">
        <div className="dz-rest__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="dz-rest__value" aria-live="polite">{clock(seconds)}</span>
    </div>
  );
}
