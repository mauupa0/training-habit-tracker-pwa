// Liczby modułu pomiaru. Wszystko czyste: dane wchodzą argumentem, nic tu nie sięga do bazy.
//
// Reguła przewodnia fazy 4: pomiar informuje, nie ocenia. Stąd wygładzanie wagi (R4),
// spójność pobudki zamiast długości snu i brak jakiejkolwiek metryki, która po jednym
// gorszym dniu zmienia wymowę ekranu.

import type { IsoDate } from "@/types";

export type WeightLog = { log_date: IsoDate; weight_kg: number | null };
export type SleepLog = { wake_time: string | null };
export type TonnageSet = { logged_at: string; weight_kg: number | null; reps: number | null };
export type MuscleSet = { exercise_id: string; logged_at: string };

/** Przesuwa datę ISO o `days` dni. Doba jest lokalna, więc liczymy w południe - DST nie przesunie daty. */
export function shiftIso(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` as IsoDate;
}

// ------------------------------------------------------------------ waga (R4)

/**
 * Okno uśredniania zależy od tego, jak często użytkownik się waży: przy ważeniu
 * raz w tygodniu siedmiodniowe okno zawierałoby jeden pomiar, czyli dokładnie tę
 * surową liczbę, przed którą R4 chroni.
 */
export const WEIGHT_WINDOW = {
  daily: { windowDays: 7, minCount: 7, label: "Średnia 7-dniowa" },
  weekly: { windowDays: 28, minCount: 4, label: "Średnia z 4 tygodni" },
} as const;

export type WeighingFrequency = keyof typeof WEIGHT_WINDOW | "never";

export type WeightSummary = {
  /** Liczba główna. `null`, dopóki pomiarów jest za mało - wtedy UI nie pokazuje dziennej wagi jako głównej. */
  average: number | null;
  /** Dzisiejszy pomiar: dana wejściowa, nigdy liczba główna. */
  today: number | null;
  /** Ile pomiarów wpadło w okno. */
  inWindow: number;
  /** Ile pomiarów w ogóle - na tym opiera się komunikat „Zbieram dane”. */
  total: number;
  /** Ile jeszcze brakuje do pierwszej średniej. */
  missing: number;
};

function measured(logs: WeightLog[]): Array<{ log_date: IsoDate; weight_kg: number }> {
  return logs.filter((l): l is { log_date: IsoDate; weight_kg: number } => typeof l.weight_kg === "number");
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Zaokrąglenie do jednego miejsca - waga w kilogramach nie ma sensu z większą dokładnością. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function weightSummary(
  logs: WeightLog[],
  on: IsoDate,
  frequency: Exclude<WeighingFrequency, "never"> = "daily"
): WeightSummary {
  const { windowDays, minCount } = WEIGHT_WINDOW[frequency];
  const all = measured(logs);
  const from = shiftIso(on, -(windowDays - 1));
  const inWindow = all.filter((l) => l.log_date >= from && l.log_date <= on);
  const today = all.find((l) => l.log_date === on)?.weight_kg ?? null;

  const enough = all.length >= minCount && inWindow.length > 0;

  return {
    average: enough ? round1(mean(inWindow.map((l) => l.weight_kg))) : null,
    today,
    inWindow: inWindow.length,
    total: all.length,
    missing: Math.max(0, minCount - all.length),
  };
}

/**
 * Zmiana średniej względem tego samego okna sprzed `spanDays`. Porównujemy średnie,
 * nie pomiary dzienne - inaczej wynik mówiłby o nawodnieniu z dwóch konkretnych poranków.
 */
export function weightDelta(
  logs: WeightLog[],
  on: IsoDate,
  frequency: Exclude<WeighingFrequency, "never"> = "daily",
  spanDays = 14
): number | null {
  const now = weightSummary(logs, on, frequency).average;
  const before = weightSummary(logs, shiftIso(on, -spanDays), frequency).average;
  if (now === null || before === null) return null;
  return round1(now - before);
}

// ---------------------------------------------------------------- białko

/**
 * Morton i wsp. (2018): 1,62 g/kg to punkt przegięcia, powyżej którego dodatkowe
 * białko nie dokłada masy beztłuszczowej; 2,20 to górna granica przedziału ufności.
 * Domyślne 1,8 leży bezpiecznie nad progiem.
 */
export const PROTEIN_PER_KG = { min: 1.6, max: 2.2, default: 1.8 } as const;

export function clampProteinPerKg(value: number): number {
  if (!Number.isFinite(value)) return PROTEIN_PER_KG.default;
  return Math.min(PROTEIN_PER_KG.max, Math.max(PROTEIN_PER_KG.min, Math.round(value * 10) / 10));
}

/** Cel dzienny w gramach, zaokrąglony do dziesiątek - dokładność do grama i tak jest pozorna. */
export function proteinTarget(averageWeightKg: number | null, perKg: number = PROTEIN_PER_KG.default): number | null {
  if (averageWeightKg === null || averageWeightKg <= 0) return null;
  return Math.round((averageWeightKg * clampProteinPerKg(perKg)) / 10) * 10;
}

/**
 * Kafelki do jednego stuknięcia. Świadomie zamiast bazy produktów i skanera kodów:
 * pełna baza to zakres, który zabija projekt przed premierą, a te osiem pozycji
 * pokrywa niemal każdy dzień. Użytkownik może je zmienić w ustawieniach.
 */
export const PROTEIN_TILES_DEFAULT: ReadonlyArray<{ label: string; grams: number }> = [
  { label: "Kurczak 200 g", grams: 50 },
  { label: "Wołowina 200 g", grams: 45 },
  { label: "Łosoś 200 g", grams: 45 },
  { label: "Twaróg 200 g", grams: 36 },
  { label: "4 jajka", grams: 25 },
  { label: "Odżywka, 1 miarka", grams: 25 },
  { label: "Skyr 150 g", grams: 16 },
];

/** Ile porcji po ~40 g składa się na cel - synteza jest wysycalna, więc rozkład ma znaczenie. */
export function proteinPortions(target: number | null): number | null {
  if (!target) return null;
  return Math.max(1, Math.round(target / 40));
}

// ---------------------------------------------------------------- sen

const MINUTES_PER_DAY = 1440;

export function wakeMinutes(wakeTime: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(wakeTime);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Rozrzut godziny pobudki w minutach. Liczony kołowo (przez kąty), bo doba się zawija:
 * pobudki 23:50 i 00:30 dzieli 40 minut, a nie prawie cała doba - a przy późnym chodzeniu spać
 * takie pary trafiają się naprawdę. Metryką jest spójność rytmu, nie długość snu.
 */
export function wakeTimeSd(logs: SleepLog[]): number | null {
  const minutes = logs
    .map((l) => (l.wake_time ? wakeMinutes(l.wake_time) : null))
    .filter((v): v is number => v !== null);
  if (minutes.length < 2) return null;

  const angles = minutes.map((v) => (v / MINUTES_PER_DAY) * 2 * Math.PI);
  const c = mean(angles.map(Math.cos));
  const s = mean(angles.map(Math.sin));
  const r = Math.sqrt(c * c + s * s);
  if (r <= 0 || r >= 1) return 0;

  const sdRadians = Math.sqrt(-2 * Math.log(r));
  return Math.round((sdRadians * MINUTES_PER_DAY) / (2 * Math.PI));
}

export function formatWakeSd(sd: number | null): string {
  if (sd === null) return "Zbieram dane o pobudkach.";
  if (sd < 60) return `Odchylenie standardowe godziny pobudki: ${sd} min`;
  const h = Math.floor(sd / 60);
  const m = sd % 60;
  return `Odchylenie standardowe godziny pobudki: ${h} h ${String(m).padStart(2, "0")} min`;
}

// ---------------------------------------------------------------- progresja i objętość

/**
 * Szacowany ciężar maksymalny wzorem Epleya. Powyżej ~12 powtórzeń wzór przestaje
 * być wiarygodny, więc takich serii nie przeliczamy zamiast podawać liczbę na oko.
 */
export function e1rm(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || !reps || weightKg <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weightKg; // wzór Epleya zawyża pojedynczą powtórkę o 3%, a ona sama jest wynikiem
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export type WeeklyTonnage = { weekStart: IsoDate; kg: number };

/** Tonaż tygodniowy: suma ciężar × powtórzenia, tygodnie od poniedziałku, najstarszy pierwszy. */
export function weeklyTonnage(sets: TonnageSet[], on: IsoDate, weeks = 12): WeeklyTonnage[] {
  const monday = (iso: IsoDate): IsoDate => {
    const d = new Date(`${iso}T12:00:00`);
    const shift = (d.getDay() + 6) % 7;
    return shiftIso(iso, -shift);
  };

  const buckets: WeeklyTonnage[] = [];
  for (let i = weeks - 1; i >= 0; i--) buckets.push({ weekStart: monday(shiftIso(on, -7 * i)), kg: 0 });

  for (const s of sets) {
    if (!s.weight_kg || !s.reps) continue;
    const day = s.logged_at.slice(0, 10) as IsoDate;
    const bucket = buckets.find((b) => b.weekStart === monday(day));
    if (bucket) bucket.kg += s.weight_kg * s.reps;
  }

  return buckets.map((b) => ({ ...b, kg: Math.round(b.kg) }));
}

/**
 * Schoenfeld i wsp. (2017): zależność dawka-odpowiedź dla objętości, 12-18 serii
 * tygodniowo na partię jako zakres roboczy.
 */
export const VOLUME_TARGET = { min: 12, max: 18 } as const;

/**
 * Objętość zaplanowana dla konkretnych partii w tym programie (tabela „Objętość
 * tygodniowa"). Ogólny zakres 12-18 dotyczy partii traktowanych jako
 * główne - małe grupy dostają w planie mniej świadomie, bo pracują też w bojach
 * złożonych. Ocenianie bicepsa (7 serii z planu) wobec 12 pokazywałoby „poniżej"
 * przy dokładnie zrealizowanym planie.
 */
export const VOLUME_PLAN: Record<string, number> = {
  klatka: 11,
  plecy: 14,
  barki: 11,
  biceps: 7,
  triceps: 6,
  czworogłowe: 16,
  "dwugłowe uda": 12,
  łydki: 8,
};

export type VolumeVerdict = "poniżej" | "zgodnie z planem" | "w zakresie" | "powyżej";

/** Cel dla partii: z planu, a gdy go nie ma - dolna granica zakresu roboczego. */
export function volumeGoal(muscle: string): number | null {
  return VOLUME_PLAN[muscle] ?? null;
}

export function setsPerMuscle(
  sets: MuscleSet[],
  muscleOf: (exerciseId: string) => string | undefined,
  on: IsoDate,
  days = 7
): Record<string, number> {
  const from = shiftIso(on, -(days - 1));
  const out: Record<string, number> = {};
  for (const s of sets) {
    const day = s.logged_at.slice(0, 10);
    if (day < from || day > on) continue;
    const muscle = muscleOf(s.exercise_id);
    if (!muscle) continue;
    out[muscle] = (out[muscle] ?? 0) + 1;
  }
  return out;
}

/**
 * Opis bez oceny: mówi gdzie jesteś względem celu, nie czy jest „dobrze”.
 * Partia z własnym celem w planie porównywana jest do niego (tolerancja dwóch serii -
 * jedno ćwiczenie w tę czy tamtą stronę mieści się w zamierzeniu), reszta do zakresu 12-18.
 */
export function volumeVerdict(count: number, muscle?: string): VolumeVerdict {
  const planned = muscle ? volumeGoal(muscle) : null;

  if (planned !== null) {
    if (count < planned - 2) return "poniżej";
    if (count > planned + 2) return "powyżej";
    return "zgodnie z planem";
  }

  if (count < VOLUME_TARGET.min) return "poniżej";
  if (count > VOLUME_TARGET.max) return "powyżej";
  return "w zakresie";
}

// ---------------------------------------------------------------- obwody i zdjęcia

export const MEASUREMENT_EVERY_DAYS = 14;
export const PHOTO_EVERY_DAYS = 28;

/** Czy przypomnieć o pomiarze. Brak wpisów w ogóle też jest powodem, ale dopiero po pierwszym tygodniu programu. */
export function isDue(lastOn: IsoDate | null, on: IsoDate, everyDays: number, startedOn?: IsoDate): boolean {
  if (lastOn === null) return startedOn ? shiftIso(startedOn, 7) <= on : true;
  return shiftIso(lastOn, everyDays) <= on;
}

export type CircumferenceKey = "arm_cm" | "chest_cm" | "waist_cm" | "thigh_cm";

export const CIRCUMFERENCE_LABEL: Record<CircumferenceKey, string> = {
  arm_cm: "Ramię napięte",
  chest_cm: "Klatka",
  waist_cm: "Talia",
  thigh_cm: "Udo",
};

/** Różnica względem poprzedniego pomiaru; `null` tam, gdzie nie ma czego porównać. */
export function circumferenceDelta(
  current: Partial<Record<CircumferenceKey, number | null>>,
  previous: Partial<Record<CircumferenceKey, number | null>> | undefined
): Record<CircumferenceKey, number | null> {
  const keys: CircumferenceKey[] = ["arm_cm", "chest_cm", "waist_cm", "thigh_cm"];
  const out = {} as Record<CircumferenceKey, number | null>;
  for (const k of keys) {
    const now = current[k];
    const before = previous?.[k];
    out[k] = typeof now === "number" && typeof before === "number" ? Math.round((now - before) * 10) / 10 : null;
  }
  return out;
}
