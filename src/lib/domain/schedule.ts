// Rozkład tygodnia z planu treningowego: pn Upper A, wt Lower A, śr wolne,
// czw Upper B, pt Lower B, weekend wolne.
//
// Plan mówi wprost: „Jak wypadnie dzień, przesuń go, nie kasuj. Priorytet ma
// zebranie 4 sesji, nie konkretne dni." Dlatego dzień wolny nie blokuje treningu,
// a propozycja w taki dzień to pierwszy szablon, którego w tym tygodniu nie było.

/**
 * Klucz szablonu definiujemy tutaj, a nie w `@/types`, żeby cała warstwa domenowa
 * była wolna od aliasów ścieżek - testy jednostkowe uruchamia goły `node --test`,
 * który nie zna `@/`.
 */
export type TemplateKey = "upper_a" | "lower_a" | "upper_b" | "lower_b";

/** Klucz = dzień tygodnia wg Date.getDay() (0 = niedziela). */
export const WEEK_PLAN: Record<number, TemplateKey | null> = {
  0: null,
  1: "upper_a",
  2: "lower_a",
  3: null,
  4: "upper_b",
  5: "lower_b",
  6: null,
};

export const ROTATION: TemplateKey[] = ["upper_a", "lower_a", "upper_b", "lower_b"];

const DAY_NAMES = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
];

export function plannedFor(date: Date): TemplateKey | null {
  return WEEK_PLAN[date.getDay()];
}

export function dayName(date: Date): string {
  return DAY_NAMES[date.getDay()];
}

/** Najbliższy dzień z treningiem, licząc od jutra. */
export function nextTrainingDay(from: Date = new Date()): { date: Date; key: TemplateKey; inDays: number } {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const key = plannedFor(d);
    if (key) return { date: d, key, inDays: i };
  }
  // rozkład ma cztery dni treningowe, więc tu nie dojdziemy
  return { date: from, key: "upper_a", inDays: 0 };
}

/**
 * Co proponować, gdy użytkownik chce trenować w dzień wolny albo nadrobić:
 * pierwszy szablon z rotacji, którego w tym tygodniu jeszcze nie było.
 */
export function catchUpTemplate(doneThisWeek: TemplateKey[]): TemplateKey {
  return ROTATION.find((key) => !doneThisWeek.includes(key)) ?? ROTATION[0];
}

/** Poniedziałek 00:00 tygodnia, w którym leży `date`. */
export function weekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const shift = (d.getDay() + 6) % 7; // poniedziałek = 0
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return d;
}
