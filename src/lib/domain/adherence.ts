// Metryka główna aplikacji - zastępuje streak (R1).
//
// Lally 2010: pominięcie jednej okazji nie wpływa istotnie na formowanie nawyku.
// Dlatego liczymy okno 28 dni, a nie serię dni pod rząd, i dlatego sesja
// w trybie minimum liczy się dokładnie tak samo jak pełna (R2).

// Rozszerzenie w ścieżce jest celowe: warstwę domenową testuje goły `node --test`,
// a ESM w Node nie dopowiada „.ts" tak jak bundler.
import { plannedFor } from "./schedule.ts";

export type AdherenceSession = {
  started_at: string;
  status: "in_progress" | "full" | "minimal" | "abandoned";
};

export type Adherence = {
  done: number;
  target: number;
  /** zaplanowane dni, które minęły bez treningu - sygnał dopiero od dwóch */
  missedInARow: number;
};

const WINDOW_DAYS = 28;

export function adherence28(
  sessions: AdherenceSession[],
  emergencyMode: boolean,
  now: Date = new Date(),
  startedOn?: string
): Adherence {
  const since = now.getTime() - WINDOW_DAYS * 86_400_000;

  const counted = sessions.filter((s) => {
    const t = new Date(s.started_at).getTime();
    return t >= since && (s.status === "full" || s.status === "minimal");
  });

  return {
    done: counted.length,
    target: emergencyMode ? 8 : 16,
    missedInARow: missedInARow(sessions, now, startedOn),
  };
}

/**
 * Liczy wstecz od wczoraj. Dzisiejszy dzień jeszcze trwa, więc nie jest
 * pominięciem - inaczej aplikacja robiłaby wyrzut o poranku.
 *
 * Dni sprzed startu programu nie istnieją: bez tego ktoś, kto właśnie założył
 * konto, dostawał na powitanie „dwa pominięte z rzędu" za dni, w których
 * aplikacji jeszcze nie miał.
 */
export function missedInARow(
  sessions: AdherenceSession[],
  now: Date = new Date(),
  startedOn?: string
): number {
  const start = startedOn ? new Date(`${startedOn}T00:00:00`) : null;
  const doneDays = new Set(
    sessions
      .filter((s) => s.status === "full" || s.status === "minimal")
      .map((s) => dayKey(new Date(s.started_at)))
  );

  let missed = 0;
  for (let i = 1; i <= WINDOW_DAYS; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    if (start && day < start) break;
    if (!plannedFor(day)) continue; // dzień wolny nie jest pominięciem
    if (doneDays.has(dayKey(day))) break;
    missed++;
  }
  return missed;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Komunikat po dwóch pominięciach z rzędu - treść dosłownie z reguły R1.
 * Jedno pominięcie nie generuje niczego: ani tekstu, ani ikony, ani koloru.
 */
export function missedSignal(missed: number): string | null {
  return missed >= 2 ? "Dwa pominięte z rzędu. Następny odbywa się bez wyjątku." : null;
}
