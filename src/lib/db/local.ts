// Lustro tabel z Supabase + kolejka synchronizacji.
// Zapis ZAWSZE idzie tutaj najpierw; sync jest procesem w tle (patrz sync.ts).
// Na siłowni nie ma zasięgu - sieć jest opcjonalna, IndexedDB nie.

import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  ForecastPoint,
  LocalCalibrationTest,
  LocalDailyLog,
  LocalHabitDaily,
  LocalIfThenPlan,
  LocalMeasurement,
  LocalPainEntry,
  LocalPersonalRecord,
  LocalProgramState,
  LocalProgressPhoto,
  LocalSession,
  LocalSet,
  LocalWeeklySnapshot,
  LocalWoopEntry,
  SyncOp,
  SyncTable,
  TemplateExercise,
  WorkoutTemplate,
} from "@/types";

/** Drobne wartości stanu aplikacji: znacznik ostatniego pobrania słowników itp. */
export type MetaRow = { key: string; value: unknown };

class LocalDB extends Dexie {
  // słowniki - kopiowane z serwera przy pierwszym logowaniu
  exercises!: Table<Exercise, string>;
  workoutTemplates!: Table<WorkoutTemplate, string>;
  templateExercises!: Table<TemplateExercise, string>;

  // dane użytkownika
  sessions!: Table<LocalSession, string>;
  sets!: Table<LocalSet, string>;
  ifThenPlans!: Table<LocalIfThenPlan, string>;
  woopEntries!: Table<LocalWoopEntry, string>;
  dailyLogs!: Table<LocalDailyLog, string>;
  measurements!: Table<LocalMeasurement, string>;
  progressPhotos!: Table<LocalProgressPhoto, string>;
  programState!: Table<LocalProgramState, number>;

  // monitoring (faza 4B)
  personalRecords!: Table<LocalPersonalRecord, string>;
  calibrationTests!: Table<LocalCalibrationTest, string>;
  painLog!: Table<LocalPainEntry, string>;
  weeklySnapshots!: Table<LocalWeeklySnapshot, string>;
  habitDaily!: Table<LocalHabitDaily, string>;
  forecastPoints!: Table<ForecastPoint, string>;

  // infrastruktura
  syncQueue!: Table<SyncOp, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("system");

    // Uwaga: `synced` jest indeksowane jako 0/1 - IndexedDB nie indeksuje boolean.
    this.version(1).stores({
      exercises: "id, slug, muscle_group",
      workoutTemplates: "id, key, position",
      templateExercises: "id, template_id, exercise_id, [template_id+position]",

      sessions: "id, started_at, status, synced",
      sets: "id, session_id, exercise_id, logged_at, synced, [exercise_id+logged_at]",
      ifThenPlans: "id, type, active, synced",
      woopEntries: "id, review_at, synced",
      dailyLogs: "log_date, synced",
      measurements: "id, taken_on, synced",
      progressPhotos: "id, taken_on, synced",
      programState: "id, synced",

      syncQueue: "++seq, table, created_at, next_attempt_at",
      meta: "key",
    });

    // Faza 4B dokłada magazyny monitoringu. Wersja 2 nie rusza istniejących danych -
    // Dexie dopisuje same nowe tabele, więc dziennik z fazy 1 przeżywa aktualizację.
    this.version(2).stores({
      personalRecords: "id, exercise_id, record_type, achieved_on, synced, [exercise_id+record_type]",
      calibrationTests: "id, exercise_id, tested_on, synced",
      painLog: "id, body_part, logged_on, resolved_on, synced",
      weeklySnapshots: "week_start, program_week, synced",
      habitDaily: "log_date, synced",
      forecastPoints: "id, metric, month_index, [metric+month_index]",
    });
  }
}

export const db = new LocalDB();

/** Klucz główny każdej tabeli - kolejka musi wiedzieć, po czym adresować wiersz. */
export const PRIMARY_KEY: Record<SyncTable, string> = {
  sessions: "id",
  sets: "id",
  if_then_plans: "id",
  woop_entries: "id",
  daily_logs: "log_date",
  measurements: "id",
  progress_photos: "id",
  program_state: "id",
  personal_records: "id",
  calibration_tests: "id",
  pain_log: "id",
  weekly_snapshots: "week_start",
  habit_daily: "log_date",
};

/**
 * Klucz, po którym Supabase rozstrzyga konflikt przy upsercie.
 *
 * Różni się od lokalnego tam, gdzie wiersz jest jeden na użytkownika, a nie jeden
 * na urządzenie: na serwerze mieszka obok siebie wiele kont (choćby testowe), więc
 * klucz musi zawierać właściciela. Bez tego drugie konto dostaje 42501 - wiersz
 * o tym kluczu istnieje, ale RLS go nie pokazuje. Lokalna baza obsługuje jedno
 * konto, więc po swojej stronie zostaje przy kluczu prostym.
 */
export const CONFLICT_KEY: Record<SyncTable, string> = {
  sessions: "id",
  sets: "id",
  if_then_plans: "id",
  woop_entries: "id",
  daily_logs: "owner,log_date",
  measurements: "id",
  progress_photos: "id",
  program_state: "owner",
  personal_records: "id",
  calibration_tests: "id",
  pain_log: "id",
  weekly_snapshots: "owner,week_start",
  habit_daily: "owner,log_date",
};

/** Nazwa tabeli w Supabase → nazwa magazynu w Dexie. */
export const LOCAL_STORE: Record<SyncTable, string> = {
  sessions: "sessions",
  sets: "sets",
  if_then_plans: "ifThenPlans",
  woop_entries: "woopEntries",
  daily_logs: "dailyLogs",
  measurements: "measurements",
  progress_photos: "progressPhotos",
  program_state: "programState",
  personal_records: "personalRecords",
  calibration_tests: "calibrationTests",
  pain_log: "painLog",
  weekly_snapshots: "weeklySnapshots",
  habit_daily: "habitDaily",
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}
