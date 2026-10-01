// Odczyty z bazy lokalnej. Zapisy siedzą w repo.ts - tutaj tylko pytania,
// na które musi umieć odpowiedzieć ekran sesji, także bez sieci.

import { db } from "./local";
import { todayIso } from "@/lib/day";
import { shiftIso } from "@/lib/domain/measure";
import { weekStart } from "@/lib/domain/schedule";
import type {
  ForecastPoint,
  IsoDate,
  LocalCalibrationTest,
  LocalDailyLog,
  LocalHabitDaily,
  LocalIfThenPlan,
  LocalMeasurement,
  LocalPainEntry,
  LocalPersonalRecord,
  LocalProgressPhoto,
  LocalSession,
  LocalSet,
  LocalWeeklySnapshot,
  LocalWoopEntry,
  TemplateExercise,
  TemplateKey,
} from "@/types";
import type { Exercise, WorkoutTemplate } from "@/types";

export type PlannedExercise = {
  position: TemplateExercise;
  exercise: Exercise;
};

export async function templateByKey(key: TemplateKey): Promise<WorkoutTemplate | undefined> {
  return db.workoutTemplates.where("key").equals(key).first();
}

export async function templateById(id: string): Promise<WorkoutTemplate | undefined> {
  return db.workoutTemplates.get(id);
}

/** Ćwiczenia szablonu w kolejności z planu, razem ze słownikiem. */
export async function plannedExercises(templateId: string): Promise<PlannedExercise[]> {
  const positions = await db.templateExercises.where("template_id").equals(templateId).toArray();
  positions.sort((a, b) => a.position - b.position);

  const out: PlannedExercise[] = [];
  for (const position of positions) {
    const exercise = await db.exercises.get(position.exercise_id);
    if (exercise) out.push({ position, exercise });
  }
  return out;
}

export async function sessionById(id: string): Promise<LocalSession | undefined> {
  return db.sessions.get(id);
}

export async function setsOfSession(sessionId: string): Promise<LocalSet[]> {
  const rows = await db.sets.where("session_id").equals(sessionId).toArray();
  return rows.sort((a, b) => a.set_index - b.set_index || a.logged_at.localeCompare(b.logged_at));
}

/** Sesja w toku, jeśli jakaś została porzucona bez zamknięcia. */
export async function openSession(): Promise<LocalSession | undefined> {
  const rows = await db.sessions.where("status").equals("in_progress").toArray();
  return rows.sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

export async function recentSessions(days = 28): Promise<LocalSession[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await db.sessions.where("started_at").aboveOrEqual(since).toArray();
  return rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/**
 * Serie tego ćwiczenia z ostatniej sesji, w której w ogóle się pojawiło.
 * To jest jedyna „motywacja" na ekranie sesji (R3): surowe dane sprzed tygodnia.
 */
export async function lastSetsFor(
  exerciseId: string,
  excludeSessionId?: string
): Promise<{ sets: LocalSet[]; session: LocalSession | null }> {
  const rows = await db.sets.where("exercise_id").equals(exerciseId).toArray();
  const usable = rows.filter((r) => r.session_id !== excludeSessionId);
  if (usable.length === 0) return { sets: [], session: null };

  usable.sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  const sessionId = usable[0].session_id;
  const sets = usable
    .filter((r) => r.session_id === sessionId)
    .sort((a, b) => a.set_index - b.set_index);

  return { sets, session: (await db.sessions.get(sessionId)) ?? null };
}

/** Ostatnie zakończone sesje danego szablonu - do autoregulacji i deloadu. */
export async function lastSessionsOfTemplate(
  templateId: string,
  limit = 2,
  excludeSessionId?: string
): Promise<LocalSession[]> {
  const rows = await db.sessions.toArray();
  return rows
    .filter(
      (s) =>
        s.template_id === templateId &&
        s.id !== excludeSessionId &&
        (s.status === "full" || s.status === "minimal")
    )
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit);
}

/** Najcięższa seria danego ćwiczenia poza wskazaną sesją - do zdania o rekordzie. */
export async function bestWeightFor(
  exerciseId: string,
  excludeSessionId?: string
): Promise<number | null> {
  const rows = await db.sets.where("exercise_id").equals(exerciseId).toArray();
  const usable = rows.filter((r) => r.session_id !== excludeSessionId);
  if (usable.length === 0) return null;
  return usable.reduce((max, r) => Math.max(max, r.weight_kg), 0);
}

// ---------------------------------------------------------------- nawyki

export async function ifThenPlans(): Promise<LocalIfThenPlan[]> {
  const rows = await db.ifThenPlans.toArray();
  // porażka nad startem: d = 0,77 vs 0,65 (Gollwitzer i Sheeran 2006)
  return rows.sort(
    (a, b) =>
      Number(b.type === "failure") - Number(a.type === "failure") ||
      a.created_at.localeCompare(b.created_at)
  );
}

export async function activePlans(type: "start" | "failure"): Promise<LocalIfThenPlan[]> {
  return (await ifThenPlans()).filter((p) => p.type === type && p.active);
}

export async function latestWoop(): Promise<LocalWoopEntry | undefined> {
  const rows = await db.woopEntries.toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** Sesje z poprzedniego tygodnia kalendarzowego - podstawa awansu `program_week`. */
export async function sessionsOfPreviousWeek(now: Date = new Date()): Promise<LocalSession[]> {
  const start = weekStart(now);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);

  const rows = await db.sessions.toArray();
  return rows.filter((s) => {
    const t = new Date(s.started_at).getTime();
    return t >= prevStart.getTime() && t < start.getTime();
  });
}

export async function calibrationHistory(limit = 3): Promise<LocalSet[]> {
  const rows = await db.sets.filter((s) => s.is_calibration).toArray();
  return rows.sort((a, b) => b.logged_at.localeCompare(a.logged_at)).slice(0, limit);
}

// ---------------------------------------------------------------- pomiar

export async function dailyLog(date: IsoDate): Promise<LocalDailyLog | undefined> {
  return db.dailyLogs.get(date);
}

/** Dziennik od najstarszego - w tej kolejności liczą się średnie i rysują wykresy. */
export async function dailyLogsSince(days: number, on: IsoDate = todayIso()): Promise<LocalDailyLog[]> {
  const from = shiftIso(on, -(days - 1));
  const rows = await db.dailyLogs.where("log_date").between(from, on, true, true).toArray();
  return rows.sort((a, b) => a.log_date.localeCompare(b.log_date));
}

/** Serie z ostatnich `days` dni - podstawa tonażu i objętości na partię. */
export async function setsSince(days: number, on: IsoDate = todayIso()): Promise<LocalSet[]> {
  const from = `${shiftIso(on, -(days - 1))}T00:00:00.000Z`;
  const rows = await db.sets.where("logged_at").aboveOrEqual(from).toArray();
  return rows.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
}

/** Mapa ćwiczeń po id - do przypisania serii do partii mięśniowej. */
export async function exerciseMap(): Promise<Map<string, Exercise>> {
  const rows = await db.exercises.toArray();
  return new Map(rows.map((e) => [e.id, e]));
}

/** Wszystkie serie danego ćwiczenia, najstarsze pierwsze - wykres progresji. */
export async function setsOfExercise(exerciseId: string): Promise<LocalSet[]> {
  const rows = await db.sets.where("exercise_id").equals(exerciseId).toArray();
  return rows.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
}

/** Ćwiczenia, w których cokolwiek zalogowano - lista wyboru na ekranie „Postęp”. */
export async function exercisesWithHistory(): Promise<Exercise[]> {
  const sets = await db.sets.toArray();
  const ids = new Set(sets.map((s) => s.exercise_id));
  const all = await db.exercises.toArray();
  return all.filter((e) => ids.has(e.id)).sort((a, b) => a.name_pl.localeCompare(b.name_pl, "pl"));
}

/** Obwody od najnowszych. */
export async function measurements(): Promise<LocalMeasurement[]> {
  const rows = await db.measurements.toArray();
  return rows.sort((a, b) => b.taken_on.localeCompare(a.taken_on));
}

export async function lastMeasurement(): Promise<LocalMeasurement | undefined> {
  return (await measurements())[0];
}

/** Zdjęcia od najnowszych. */
export async function photos(): Promise<LocalProgressPhoto[]> {
  const rows = await db.progressPhotos.toArray();
  return rows.sort((a, b) => b.taken_on.localeCompare(a.taken_on));
}

// ---------------------------------------------------------------- monitoring (faza 4B)

/** Rekordy, od najnowszych. Bez filtra - cała historia jednego ćwiczenia. */
export async function personalRecords(exerciseId?: string): Promise<LocalPersonalRecord[]> {
  const rows = exerciseId
    ? await db.personalRecords.where("exercise_id").equals(exerciseId).toArray()
    : await db.personalRecords.toArray();
  return rows.sort((a, b) => b.achieved_on.localeCompare(a.achieved_on) || b.created_at.localeCompare(a.created_at));
}

export async function painEntries(): Promise<LocalPainEntry[]> {
  const rows = await db.painLog.toArray();
  return rows.sort((a, b) => b.logged_on.localeCompare(a.logged_on));
}

/** Migawki od najnowszej - archiwum tygodni. */
export async function snapshots(): Promise<LocalWeeklySnapshot[]> {
  const rows = await db.weeklySnapshots.toArray();
  return rows.sort((a, b) => b.week_start.localeCompare(a.week_start));
}

export async function habitDays(days = 90, on: IsoDate = todayIso()): Promise<LocalHabitDaily[]> {
  const from = shiftIso(on, -(days - 1));
  const rows = await db.habitDaily.where("log_date").between(from, on, true, true).toArray();
  return rows.sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export async function calibrationTests(): Promise<LocalCalibrationTest[]> {
  const rows = await db.calibrationTests.toArray();
  return rows.sort((a, b) => a.tested_on.localeCompare(b.tested_on));
}

/** Punkty prognozy dla jednej metryki, po miesiącach rosnąco. */
export async function forecastFor(metric: string): Promise<ForecastPoint[]> {
  const rows = await db.forecastPoints.where("metric").equals(metric).toArray();
  return rows.sort((a, b) => a.month_index - b.month_index);
}
