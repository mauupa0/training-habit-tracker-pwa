// Autoregulacja: pierwsza seria dnia mówi, czy organizm dowiezie zaplanowaną progresję.
// Spadek siły to informacja o regeneracji, nie powód do komunikatu z naganą (R1/R3).

import type { SetLog } from "./progression.ts";

export type AutoregulationFlag = "none" | "hold" | "deload_suggested";

export type AutoregulationVerdict = {
  flag: AutoregulationFlag;
  message_pl: string;
};

const NONE: AutoregulationVerdict = { flag: "none", message_pl: "" };

/**
 * Porównuje pierwszą serię z tą samą serią sprzed tygodnia.
 *
 * @param previousHold czy poprzednia sesja tego szablonu też skończyła się `hold`
 *                     - dwa razy z rzędu to już sygnał do deloadu
 */
export function checkFirstSet(
  today: SetLog,
  lastWeekSameExercise: SetLog | null,
  previousHold = false
): AutoregulationVerdict {
  if (!lastWeekSameExercise) return NONE;

  // różny ciężar = inne zadanie, porównanie powtórzeń nic nie mówi
  if (today.weight_kg !== lastWeekSameExercise.weight_kg) return NONE;

  const drop = lastWeekSameExercise.reps - today.reps;
  if (drop < 2) return NONE;

  if (previousHold) {
    return {
      flag: "deload_suggested",
      message_pl:
        "Dwa razy z rzędu spadek. Propozycja: tydzień deloadu - połowa serii, ten sam ciężar.",
    };
  }

  return { flag: "hold", message_pl: "Dziś nie dokładamy. Zrób zaplanowaną objętość." };
}

/** Deload: połowa serii w górę, ten sam ciężar. */
export function deloadSets(targetSets: number): number {
  return Math.ceil(targetSets / 2);
}

const DELOAD_NOTE = "deload";

export function markDeload(note: string | null): string {
  return note && note.includes(DELOAD_NOTE) ? note : [note, DELOAD_NOTE].filter(Boolean).join(" ");
}

export function isDeload(note: string | null): boolean {
  return Boolean(note && note.includes(DELOAD_NOTE));
}

/** Deload obowiązuje 7 dni od przyjęcia propozycji. */
export function deloadActive(acceptedAt: Date | null, now: Date = new Date()): boolean {
  if (!acceptedAt) return false;
  return now.getTime() - acceptedAt.getTime() < 7 * 86_400_000;
}
