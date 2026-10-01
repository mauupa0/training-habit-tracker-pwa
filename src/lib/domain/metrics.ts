// Metryki monitoringu (faza 4B). Wszystko czyste i policzalne offline - rekordy muszą
// pojawić się od razu po zapisanej serii, także bez zasięgu.
//
// Reguła nadrzędna tej warstwy: liczby opisują, nigdy nie oceniają. Nie ma tu żadnej
// funkcji zwracającej „wynik dnia" ani niczego, co dałoby się wystawić jako odznakę.

import type { IsoDate } from "@/types";
import { shiftIso } from "./measure.ts";

export type RecordType = "max_weight" | "max_reps_at_weight" | "est_1rm" | "max_volume_session";

export type SetLike = {
  id?: string;
  session_id?: string;
  exercise_id: string;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  logged_at: string;
};

export type DetectedRecord = {
  record_type: RecordType;
  value: number;
  previous_value: number | null;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
};

/**
 * Szacowany ciężar maksymalny, wzór Epleya z korektą o RIR: powtórzenia do upadku
 * to wykonane plus zapas, bo to one określają rzeczywistą bliskość maksimum.
 * Wynik jest ZAWSZE oszacowaniem - nigdzie nie nazywamy go rekordem siły.
 */
export function estimate1RM(weightKg: number | null, reps: number | null, rir: number | null): number | null {
  if (!weightKg || !reps || weightKg <= 0 || reps <= 0) return null;
  const repsToFailure = reps + (rir ?? 0);
  return Math.round(weightKg * (1 + repsToFailure / 30) * 10) / 10;
}

export const RECORD_LABEL: Record<RecordType, string> = {
  max_weight: "najwyższy ciężar",
  max_reps_at_weight: "najwięcej powtórzeń na tym ciężarze",
  est_1rm: "najwyższy szacowany maks",
  max_volume_session: "najwyższy tonaż sesji",
};

/**
 * Rekordy z jednej serii, względem całej wcześniejszej historii TEGO ćwiczenia.
 * Historia musi być już odfiltrowana z serii bieżącej sesji dla tonażu - sumę sesji
 * podajemy osobno, bo liczy się ona z wielu serii naraz.
 */
export function detectRecords(
  candidate: SetLike,
  history: SetLike[],
  sessionTonnage?: { current: number; best: number }
): DetectedRecord[] {
  const out: DetectedRecord[] = [];
  const weight = candidate.weight_kg;
  const reps = candidate.reps;
  if (!weight || !reps || weight <= 0 || reps <= 0) return out;

  const past = history.filter((s) => s.weight_kg && s.reps && s.weight_kg > 0);

  const bestWeight = Math.max(0, ...past.map((s) => s.weight_kg as number));
  if (weight > bestWeight) {
    out.push({
      record_type: "max_weight",
      value: weight,
      previous_value: bestWeight > 0 ? bestWeight : null,
      weight_kg: weight,
      reps,
      rir: candidate.rir,
    });
  }

  const sameWeight = past.filter((s) => s.weight_kg === weight);
  const bestReps = Math.max(0, ...sameWeight.map((s) => s.reps as number));
  if (sameWeight.length > 0 && reps > bestReps) {
    out.push({
      record_type: "max_reps_at_weight",
      value: reps,
      previous_value: bestReps > 0 ? bestReps : null,
      weight_kg: weight,
      reps,
      rir: candidate.rir,
    });
  }

  const current1rm = estimate1RM(weight, reps, candidate.rir);
  const best1rm = Math.max(0, ...past.map((s) => estimate1RM(s.weight_kg, s.reps, s.rir) ?? 0));
  if (current1rm !== null && current1rm > best1rm) {
    out.push({
      record_type: "est_1rm",
      value: current1rm,
      previous_value: best1rm > 0 ? best1rm : null,
      weight_kg: weight,
      reps,
      rir: candidate.rir,
    });
  }

  if (sessionTonnage && sessionTonnage.current > sessionTonnage.best) {
    out.push({
      record_type: "max_volume_session",
      value: Math.round(sessionTonnage.current),
      previous_value: sessionTonnage.best > 0 ? Math.round(sessionTonnage.best) : null,
      weight_kg: null,
      reps: null,
      rir: null,
    });
  }

  return out;
}

/**
 * Rekord jako zdanie faktu. Bez ikony, bez wykrzyknika, bez słowa „gratulacje" -
 * ma brzmieć jak wpis w dzienniku, bo nim jest.
 */
export function recordSentence(exercise: string, record: DetectedRecord): string {
  const value = (n: number) => String(n).replace(".", ",");

  switch (record.record_type) {
    case "max_weight":
      return record.previous_value === null
        ? `${exercise}: ${value(record.value)} kg - pierwszy zapisany ciężar.`
        : `${exercise}: ${value(record.value)} kg - pierwszy raz na tym ciężarze. Poprzednio ${value(record.previous_value)} kg.`;
    case "max_reps_at_weight":
      return `${exercise}: ${record.value} powtórzeń przy ${value(record.weight_kg ?? 0)} kg. Poprzednio ${record.previous_value}.`;
    case "est_1rm":
      return `${exercise}: szacowany maks ${value(record.value)} kg${
        record.previous_value ? `, poprzednio ${value(record.previous_value)} kg` : ""
      }.`;
    case "max_volume_session":
      return `${exercise}: najwyższy tonaż sesji - ${value(record.value)} kg.`;
  }
}

export type ProgressionRecord = { record_type: RecordType; value: number; achieved_on: IsoDate };

/**
 * Ile tygodni zajęła ostatnia podwyżka ciężaru. Metryka istnieje po to, żeby uczciwie
 * pokazać wyhamowanie przyrostów początkującego - nie po to, żeby je oceniać.
 */
export function weeksPerIncrement(records: ProgressionRecord[]): number | null {
  const weights = records
    .filter((r) => r.record_type === "max_weight")
    .sort((a, b) => a.achieved_on.localeCompare(b.achieved_on));
  if (weights.length < 2) return null;

  const last = weights[weights.length - 1];
  const previous = weights[weights.length - 2];
  const days =
    (new Date(`${last.achieved_on}T12:00:00`).getTime() - new Date(`${previous.achieved_on}T12:00:00`).getTime()) /
    86_400_000;
  return Math.max(1, Math.round(days / 7));
}

export function incrementSentence(weeksNow: number | null, weeksEarly: number | null): string | null {
  if (weeksNow === null) return null;
  const base = `Ostatnia podwyżka zajęła ${weeksNow} ${weeksNow === 1 ? "tydzień" : "tygodni"}.`;
  if (weeksEarly === null || weeksEarly >= weeksNow) return base;
  return `${base} Na starcie zajmowała ${weeksEarly}. To normalne wyhamowanie, nie awaria.`;
}

// ---------------------------------------------------------------- nawyki

export type HabitDay = {
  log_date: IsoDate;
  training_done: boolean | null;
  protein_hit: boolean | null;
  creatine_taken: boolean | null;
  wake_on_target: boolean | null;
  weight_logged: boolean | null;
};

export type HabitKey = "training_done" | "protein_hit" | "creatine_taken" | "wake_on_target" | "weight_logged";

/**
 * Trafność w oknie dni. Zwracamy licznik i mianownik, nigdy procent z oceną:
 * „24 z 28 dni" jest informacją, „86%" zaczyna być stopniem.
 */
export function habitHitRate(days: HabitDay[], habit: HabitKey, window: number, on: IsoDate): { hit: number; of: number } {
  const from = shiftIso(on, -(window - 1));
  const inWindow = days.filter((d) => d.log_date >= from && d.log_date <= on);
  return { hit: inWindow.filter((d) => d[habit] === true).length, of: window };
}

// ---------------------------------------------------------------- ból

export type PainEntry = { logged_on: IsoDate; body_part: string; severity: number; resolved_on: IsoDate | null };

export const PAIN_PATTERN_WINDOW_DAYS = 21;
export const PAIN_PATTERN_COUNT = 3;

const PHYSIO =
  "Zgłaszałeś ból w tym miejscu trzy razy w ostatnich trzech tygodniach. " +
  "To moment na fizjoterapeutę, nie na zmianę ćwiczenia.";

const PHYSIO_SEVERE =
  "To silny ból. Aplikacja go tylko zapisuje - ocena należy do fizjoterapeuty albo lekarza.";

/**
 * Czy zgłoszenia układają się we wzorzec. Aplikacja NIE diagnozuje i nie proponuje
 * ćwiczeń korekcyjnych: jedyne, co robi, to pokazanie powtarzalności i odesłanie dalej.
 */
export function painSignal(entries: PainEntry[], bodyPart: string, on: IsoDate, severity?: number): string | null {
  if (severity !== undefined && severity >= 4) return PHYSIO_SEVERE;

  const from = shiftIso(on, -(PAIN_PATTERN_WINDOW_DAYS - 1));
  const recent = entries.filter((e) => e.body_part === bodyPart && e.logged_on >= from && e.logged_on <= on);
  return recent.length >= PAIN_PATTERN_COUNT ? PHYSIO : null;
}

/**
 * Obszary zgłoszone i nierozwiązane - pokazywane w przeglądzie jako informacja.
 * Typ wejściowy przechodzi na wyjście, żeby ekran zachował swoje pola (id, notatkę).
 */
export function activePain<T extends PainEntry>(entries: T[], on: IsoDate, days = 14): T[] {
  const from = shiftIso(on, -(days - 1));
  return entries.filter((e) => e.resolved_on === null && e.logged_on >= from && e.logged_on <= on);
}

// ---------------------------------------------------------------- prognoza

export type ForecastPoint = {
  month_index: number;
  metric: string;
  value_realistic: number;
  value_pessimist: number | null;
  value_optimist: number | null;
};

export const FORECAST_MIN_WEEKS = 8;
export const DIP_MONTHS = { from: 2, to: 3 } as const;

export const DIP_EXPLANATION =
  "W tym okresie siła rośnie szybko, a sylwetka prawie się nie zmienia. To zaplanowane. " +
  "Większość ludzi rezygnuje właśnie tutaj, a wszystko widoczne dzieje się w miesiącach 4-9.";

/** Który miesiąc programu (0-based) przypada na dany dzień. */
export function monthIndexOf(startedOn: IsoDate, on: IsoDate): number {
  const start = new Date(`${startedOn}T12:00:00`);
  const now = new Date(`${on}T12:00:00`);
  const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(0, Math.min(24, Math.floor(days / 30.4)));
}

export function weeksOfData(startedOn: IsoDate, on: IsoDate): number {
  const start = new Date(`${startedOn}T12:00:00`);
  const now = new Date(`${on}T12:00:00`);
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / (7 * 86_400_000)));
}

export type ForecastVerdict =
  | { status: "too_early"; message: string }
  | { status: "no_data"; message: string }
  | { status: "above" | "in_band" | "below"; message: string; realistic: number };

/**
 * Zestawienie wyniku z prognozą. Poniżej pasma aplikacja NIE ocenia - pokazuje
 * frekwencję z tego samego okresu obok wyniku i na tym kończy. Sam fakt zestawienia
 * wystarczy, a dopisanie „niestety" zamieniłoby narzędzie w nadzorcę.
 */
export function forecastVerdict(
  actual: number | null,
  points: ForecastPoint[],
  metric: string,
  monthIndex: number,
  weeks: number,
  attendance?: { done: number; planned: number; expected: number }
): ForecastVerdict {
  if (weeks < FORECAST_MIN_WEEKS) {
    return {
      status: "too_early",
      message: `Za mało danych. Porównanie pojawi się po ${FORECAST_MIN_WEEKS} tygodniach.`,
    };
  }

  const point = points.find((p) => p.metric === metric && p.month_index === monthIndex);
  if (!point || actual === null) {
    return { status: "no_data", message: "Brak danych do porównania w tym miesiącu." };
  }

  const low = point.value_pessimist ?? point.value_realistic;
  const high = point.value_optimist ?? point.value_realistic;

  if (actual > Math.max(point.value_realistic, high)) {
    return { status: "above", message: "Jesteś powyżej scenariusza realistycznego.", realistic: point.value_realistic };
  }
  if (actual >= low) {
    return { status: "in_band", message: "Mieścisz się w przewidywanym zakresie.", realistic: point.value_realistic };
  }

  const context = attendance
    ? ` Frekwencja w tym okresie: ${attendance.done} / ${attendance.planned} sesji. Prognoza zakładała ${attendance.expected} / ${attendance.planned}.`
    : "";
  return {
    status: "below",
    message: `Jesteś poniżej scenariusza pesymistycznego.${context}`,
    realistic: point.value_realistic,
  };
}

// ---------------------------------------------------------------- migawka tygodnia

export type SnapshotInput = {
  weekStart: IsoDate;
  programWeek: number;
  sessions: Array<{ started_at: string; status: string }>;
  sets: Array<{ logged_at: string; weight_kg: number | null; reps: number | null; exercise_id: string }>;
  muscleOf: (exerciseId: string) => string | undefined;
  logs: Array<{
    log_date: IsoDate;
    weight_kg: number | null;
    protein_g: number | null;
    calories_kcal: number | null;
    wake_time: string | null;
    sleep_quality: number | null;
    creatine_taken: boolean | null;
  }>;
  proteinTarget: number | null;
  wakeSd: number | null;
  prsCount: number;
  emergencyMode: boolean;
  sessionsPlanned?: number;
};

export type Snapshot = {
  week_start: IsoDate;
  program_week: number;
  sessions_done: number;
  sessions_planned: number;
  sessions_minimal: number;
  total_tonnage_kg: number;
  sets_by_muscle: Record<string, number>;
  weight_avg7_kg: number | null;
  protein_avg_g: number | null;
  protein_hit_days: number;
  calories_avg_kcal: number | null;
  wake_time_sd_min: number | null;
  sleep_quality_avg: number | null;
  creatine_days: number;
  prs_count: number;
  emergency_mode: boolean;
};

const avg = (values: number[]): number | null =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

/** Zamknięty tydzień w jednym wierszu. Raz zapisany, nigdy nie zmieniany. */
export function buildSnapshot(input: SnapshotInput): Snapshot {
  const weekEnd = shiftIso(input.weekStart, 6);
  const inWeek = <T extends { log_date?: IsoDate; logged_at?: string; started_at?: string }>(row: T): boolean => {
    const day = (row.log_date ?? row.logged_at?.slice(0, 10) ?? row.started_at?.slice(0, 10)) as IsoDate | undefined;
    return day !== undefined && day >= input.weekStart && day <= weekEnd;
  };

  const sessions = input.sessions.filter(inWeek);
  const sets = input.sets.filter(inWeek);
  const logs = input.logs.filter(inWeek);

  const setsByMuscle: Record<string, number> = {};
  let tonnage = 0;
  for (const s of sets) {
    if (s.weight_kg && s.reps) tonnage += s.weight_kg * s.reps;
    const muscle = input.muscleOf(s.exercise_id);
    if (muscle) setsByMuscle[muscle] = (setsByMuscle[muscle] ?? 0) + 1;
  }

  const proteins = logs.map((l) => l.protein_g).filter((v): v is number => v !== null);
  const hitThreshold = input.proteinTarget ? input.proteinTarget * 0.9 : null;

  return {
    week_start: input.weekStart,
    program_week: input.programWeek,
    sessions_done: sessions.filter((s) => s.status === "full" || s.status === "minimal").length,
    sessions_planned: input.sessionsPlanned ?? (input.emergencyMode ? 2 : 4),
    sessions_minimal: sessions.filter((s) => s.status === "minimal").length,
    total_tonnage_kg: Math.round(tonnage),
    sets_by_muscle: setsByMuscle,
    weight_avg7_kg: avg(logs.map((l) => l.weight_kg).filter((v): v is number => v !== null)),
    protein_avg_g: avg(proteins),
    protein_hit_days: hitThreshold === null ? 0 : proteins.filter((p) => p >= hitThreshold).length,
    calories_avg_kcal: avg(logs.map((l) => l.calories_kcal).filter((v): v is number => v !== null)),
    wake_time_sd_min: input.wakeSd,
    sleep_quality_avg: avg(logs.map((l) => l.sleep_quality).filter((v): v is number => v !== null)),
    creatine_days: logs.filter((l) => l.creatine_taken === true).length,
    prs_count: input.prsCount,
    emergency_mode: input.emergencyMode,
  };
}
