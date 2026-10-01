// Podwójna progresja - jedyny mechanizm, który musi działać bez zarzutu.
// Ciężar rośnie dopiero, gdy WSZYSTKIE serie trafiły w górną granicę przedziału
// przy zadanym (lub niższym) RIR. Zero zależności od Reacta.

export type SetLog = {
  weight_kg: number;
  reps: number;
  /** null = użytkownik nie podał; nie karzemy go za to */
  rir: number | null;
};

export type ProgressionTarget = {
  rep_min: number;
  rep_max: number;
  /** '2' | '1-2' | '0-1' | '2-3'; null dla ćwiczeń bez celu RIR (brzuch) */
  target_rir: string | null;
  increment_kg: number;
};

export type Suggestion = {
  weight_kg: number;
  target_reps: number | null;
  reason_pl: string;
  is_increase: boolean;
};

/** Górna granica dopuszczalnego RIR: '1-2' → 2, '0-1' → 1, '2' → 2. */
export function maxRir(target: string | null): number | null {
  if (!target) return null;
  const parts = target.split("-").map((p) => Number(p.trim()));
  const valid = parts.filter((n) => Number.isFinite(n));
  return valid.length ? Math.max(...valid) : null;
}

/** Liczby wyświetlamy po polsku: 62,5 kg, nie 62.5 kg. */
export function formatKg(value: number): string {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

export function nextWeight(lastSession: SetLog[], tpl: ProgressionTarget): Suggestion {
  if (lastSession.length === 0) {
    return {
      weight_kg: 0,
      target_reps: tpl.rep_min,
      reason_pl: "Pierwsza sesja - ustal ciężar tak, żeby ostatnia seria była wymagająca.",
      is_increase: false,
    };
  }

  const weight = lastSession[lastSession.length - 1].weight_kg;
  const limit = maxRir(tpl.target_rir);

  const allAtTop = lastSession.every((s) => s.reps >= tpl.rep_max);
  // brak celu RIR albo brak wpisu = warunek spełniony
  const rirOk = limit === null || lastSession.every((s) => s.rir === null || s.rir <= limit);

  if (allAtTop && rirOk) {
    const next = weight + tpl.increment_kg;
    return {
      weight_kg: next,
      target_reps: tpl.rep_min,
      reason_pl: `Górna granica we wszystkich seriach. Następnym razem ${formatKg(next)} kg.`,
      is_increase: true,
    };
  }

  return {
    weight_kg: weight,
    target_reps: null,
    reason_pl: "Ten sam ciężar. Celuj w +1 powtórzenie w każdej serii.",
    is_increase: false,
  };
}
