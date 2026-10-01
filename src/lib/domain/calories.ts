// Kalorie. Najbardziej wrażliwy moduł w aplikacji, więc limity z R7 siedzą tutaj,
// w warstwie liczącej - nie w interfejsie. Ekran nie ma jak ich obejść, bo nie dostaje
// od tych funkcji wartości spoza dopuszczalnego zakresu.

import type { IsoDate } from "@/types";
import { shiftIso } from "./measure.ts";

export type CalorieLog = { log_date: IsoDate; calories_kcal: number | null; weight_kg: number | null };
export type GoalMode = "recomp" | "bulk";

export const CALORIE_RULES = {
  /** Rekompozycja: umiarkowany deficyt (300-400). */
  RECOMP_DEFICIT: 350,
  /** Budowa masy: nadwyżka na tyle mała, żeby nie była głównie tłuszczem. */
  BULK_SURPLUS: 250,
  /** TWARDY LIMIT deficytu. Nie ma trybu „agresywnego” i nie ma go czym włączyć. */
  MAX_DEFICIT: 500,
  MIN_DEFICIT: 200,
  /** TWARDA PODŁOGA. Poniżej aplikacja nie ustawi celu - bez opcji obejścia. */
  ABSOLUTE_FLOOR: 1500,
  /** Ile dni pomiaru przed pierwszym celem. */
  MEASURE_DAYS: 14,
  /** Jak rzadko wolno rewidować cel i o ile maksymalnie. */
  REVISION_DAYS: 14,
  REVISION_STEP: 200,
  /** Przyjęty równoważnik energetyczny kilograma tkanki. */
  KCAL_PER_KG: 7700,
} as const;

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

/** Dzień policzalny to taki, który ma i kalorie, i wagę - inaczej nie da się z niego nic wnioskować. */
function complete(logs: CalorieLog[]): Array<{ log_date: IsoDate; calories_kcal: number; weight_kg: number }> {
  return logs
    .filter((l): l is { log_date: IsoDate; calories_kcal: number; weight_kg: number } =>
      typeof l.calories_kcal === "number" && typeof l.weight_kg === "number"
    )
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export type MeasureProgress = { days: number; needed: number; ready: boolean };

/** Postęp etapu pomiaru - pokazywany zamiast celu, bez oceniania wpisanych liczb. */
export function measureProgress(logs: CalorieLog[]): MeasureProgress {
  const days = complete(logs).length;
  return { days, needed: CALORIE_RULES.MEASURE_DAYS, ready: days >= CALORIE_RULES.MEASURE_DAYS };
}

/**
 * Empiryczne zapotrzebowanie z 14 dni.
 *
 * NIE używamy wzorów typu Mifflin-St Jeor ani Harris-Benedict. One zakładają, że
 * raportowane spożycie jest prawdziwe, a Lichtman i wsp. (1992) zmierzyli zaniżenie
 * o 47% u osób przekonanych, że jedzą 1028 kcal. Zamiast liczyć, ile użytkownik
 * „powinien" jeść, mierzymy, jak jego waga reaguje na to, co faktycznie zapisał -
 * błąd raportowania wchodzi wtedy w oszacowanie jako stała i się skraca.
 */
export function estimateMaintenance(logs: CalorieLog[]): number | null {
  const rows = complete(logs).slice(-CALORIE_RULES.MEASURE_DAYS);
  if (rows.length < CALORIE_RULES.MEASURE_DAYS) return null;

  const avgKcal = mean(rows.map((l) => l.calories_kcal));
  const weightStart = mean(rows.slice(0, 7).map((l) => l.weight_kg));
  const weightEnd = mean(rows.slice(-7).map((l) => l.weight_kg));
  const deltaKg = weightEnd - weightStart;

  // Środki obu okien dzieli SIEDEM dni, nie czternaście: pierwsze okno ma środek
  // w dniu 4, drugie w dniu 11. Dzielenie przez długość całego okresu zaniżałoby
  // tempo zmiany dwukrotnie, a przez to zaniżało zapotrzebowanie o ~150 kcal
  // przy pół kilograma na dwa tygodnie - więcej niż cała nadwyżka na budowę masy.
  const daysBetweenWindowCenters = CALORIE_RULES.MEASURE_DAYS / 2;

  return Math.round(avgKcal - (deltaKg / daysBetweenWindowCenters) * CALORIE_RULES.KCAL_PER_KG);
}

export type GoalResult =
  | { kcal: number; deficit: number; rejected: null }
  | { kcal: null; deficit: number; rejected: string };

const BELOW_FLOOR =
  "Ten cel jest niższy niż bezpieczny próg. Aplikacja go nie ustawi. Jeśli rozważasz taki " +
  "deficyt, to jest moment na rozmowę z dietetykiem albo lekarzem, a nie na zmianę ustawienia.";

/**
 * Cel dzienny. Deficyt jest przycinany do zakresu 200-500 zanim cokolwiek policzymy,
 * a wynik poniżej podłogi jest odrzucany bez furtki: to jedyne miejsce w aplikacji,
 * gdzie użytkownik nie ma ostatniego słowa.
 */
export function calorieGoal(
  maintenance: number | null,
  mode: GoalMode,
  deficitOverride?: number
): GoalResult | null {
  if (maintenance === null || maintenance <= 0) return null;

  if (mode === "bulk") {
    return { kcal: Math.round(maintenance + CALORIE_RULES.BULK_SURPLUS), deficit: 0, rejected: null };
  }

  const deficit = clampDeficit(deficitOverride ?? CALORIE_RULES.RECOMP_DEFICIT);
  const kcal = Math.round(maintenance - deficit);

  if (kcal < CALORIE_RULES.ABSOLUTE_FLOOR) {
    return { kcal: null, deficit, rejected: BELOW_FLOOR };
  }
  return { kcal, deficit, rejected: null };
}

export function clampDeficit(value: number): number {
  if (!Number.isFinite(value)) return CALORIE_RULES.RECOMP_DEFICIT;
  return Math.min(CALORIE_RULES.MAX_DEFICIT, Math.max(CALORIE_RULES.MIN_DEFICIT, Math.round(value)));
}

/** Czy minęło dość czasu od ostatniej zmiany celu. Codzienne korekty gonią szum, nie trend. */
export function canRevise(lastRevisedOn: IsoDate | null, on: IsoDate): boolean {
  if (!lastRevisedOn) return true;
  return shiftIso(lastRevisedOn, CALORIE_RULES.REVISION_DAYS) <= on;
}

export type Revision = { kcal: number; changed: boolean; reason: string };

/**
 * Rewizja celu po dwóch tygodniach. Krok to najwyżej 200 kcal - zasada wprost:
 * „Nie o 500. Nie codziennie". Waga stojąca w miejscu przy rekompozycji nie jest błędem,
 * więc próg braku reakcji jest wyraźny (0,2 kg na dwa tygodnie).
 */
export function reviseGoal(
  current: number,
  deltaKg2w: number,
  mode: GoalMode,
  maintenance: number | null
): Revision {
  const still = Math.abs(deltaKg2w) < 0.2;

  if (!still) {
    return { kcal: current, changed: false, reason: "Waga się rusza. Zostawiamy cel bez zmian." };
  }

  if (mode === "bulk") {
    const kcal = current + CALORIE_RULES.REVISION_STEP;
    return {
      kcal,
      changed: true,
      reason: `Dwa tygodnie bez zmiany średniej. Cel w górę o ${CALORIE_RULES.REVISION_STEP} kcal.`,
    };
  }

  // Dolna granica to obie bariery naraz: podłoga bezwzględna i maksymalny deficyt.
  // Krok jest PRZYCINANY do niej, a nie odrzucany - inaczej mechanizm byłby martwy:
  // przy starcie z deficytem 350 każde kolejne 200 przekraczałoby limit 500 i rewizja
  // nigdy by się nie odbyła.
  const floorByDeficit = maintenance !== null ? maintenance - CALORIE_RULES.MAX_DEFICIT : -Infinity;
  const lowest = Math.max(CALORIE_RULES.ABSOLUTE_FLOOR, floorByDeficit);
  const kcal = Math.min(current, Math.max(current - CALORIE_RULES.REVISION_STEP, lowest));

  if (kcal === current) {
    return {
      kcal: current,
      changed: false,
      reason:
        lowest === CALORIE_RULES.ABSOLUTE_FLOOR
          ? "Niżej nie zejdziemy. Zamiast ciąć kalorie sprawdź sen i to, czy wszystko trafia do dziennika."
          : "Głębszego deficytu nie ustawimy. Dalsze cięcie kalorii przestaje być narzędziem.",
    };
  }

  return {
    kcal,
    changed: true,
    reason: `Dwa tygodnie bez zmiany średniej. Cel w dół o ${current - kcal} kcal.`,
  };
}
