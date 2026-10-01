// Warstwa zapisu. Każda operacja: najpierw IndexedDB, potem kolejka.
// Nic tutaj nie czeka na sieć i nic nie rzuca, gdy sieci nie ma.

import { db, newId, nowIso } from "./local";
import { enqueue } from "./sync";
import { todayIso } from "@/lib/day";
import {
  PROTEIN_PER_KG,
  proteinTarget as proteinTargetOf,
  shiftIso,
  weightSummary,
} from "@/lib/domain/measure";
import { detectRecords, painSignal, recordSentence, type Snapshot } from "@/lib/domain/metrics";
import { supabase } from "@/lib/supabase/client";
import type {
  DailyLog,
  Exercise,
  ForecastPoint,
  IfThenPlan,
  IsoDate,
  LocalCalibrationTest,
  LocalDailyLog,
  LocalHabitDaily,
  LocalIfThenPlan,
  LocalMeasurement,
  LocalPainEntry,
  LocalPersonalRecord,
  LocalProgramState,
  LocalProgressPhoto,
  LocalWeeklySnapshot,
  LocalWoopEntry,
  Measurement,
  PainEntry,
  ProgressPhoto,
  WoopEntry,
  LocalSession,
  LocalSet,
  ProgramState,
  SetEntry,
  TemplateExercise,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";

const OWNER_KEY = "owner_id";

export async function setOwner(ownerId: string): Promise<void> {
  await db.meta.put({ key: OWNER_KEY, value: ownerId });
}

export async function getOwner(): Promise<string | null> {
  const row = await db.meta.get(OWNER_KEY);
  return (row?.value as string | undefined) ?? null;
}

/** Kopiuje słowniki na urządzenie. Bez nich aplikacja nie zadziała offline. */
export async function syncDictionaries(): Promise<{ exercises: number; templates: number; positions: number }> {
  const [ex, tpl, tex] = await Promise.all([
    supabase.from("exercises").select("*"),
    supabase.from("workout_templates").select("*").order("position"),
    supabase.from("template_exercises").select("*").order("position"),
  ]);

  if (ex.error || tpl.error || tex.error) {
    throw new Error(ex.error?.message ?? tpl.error?.message ?? tex.error?.message);
  }

  await db.transaction("rw", db.exercises, db.workoutTemplates, db.templateExercises, async () => {
    await db.exercises.bulkPut(ex.data as Exercise[]);
    await db.workoutTemplates.bulkPut(tpl.data as WorkoutTemplate[]);
    await db.templateExercises.bulkPut(tex.data as TemplateExercise[]);
  });

  await db.meta.put({ key: "dictionaries_synced_at", value: nowIso() });

  return { exercises: ex.data.length, templates: tpl.data.length, positions: tex.data.length };
}

/**
 * Ściąga dane użytkownika z serwera na puste urządzenie.
 *
 * Synchronizacja jest jednokierunkowa (urządzenie → serwer), bo przy jednym
 * użytkowniku to wystarcza i nie grozi nadpisaniem tego, co zapisał offline.
 * Ale po zmianie telefonu albo wyczyszczeniu danych PWA lokalna baza jest pusta,
 * a wszystko leży w Supabase - bez tego kroku aplikacja pokazałaby czyste konto
 * i kazała przejść onboarding od nowa. Dlatego pobieramy TYLKO gdy pusto.
 */
export async function pullUserData(): Promise<{ restored: number } | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  const local = await db.sessions.count();
  const plansLocal = await db.ifThenPlans.count();
  const stateLocal = await db.programState.get(1);
  if (local > 0 || plansLocal > 0 || stateLocal?.height_cm != null) return null;

  const [state, plans, woop, sessions, sets, logs, records, pains, snaps, calibrations, habits] =
    await Promise.all([
      supabase.from("program_state").select("*").maybeSingle(),
      supabase.from("if_then_plans").select("*"),
      supabase.from("woop_entries").select("*"),
      supabase.from("sessions").select("*"),
      supabase.from("sets").select("*"),
      supabase.from("daily_logs").select("*"),
      // monitoring (faza 4B) - bez tego nowy telefon zaczynałby historię od zera
      supabase.from("personal_records").select("*"),
      supabase.from("pain_log").select("*"),
      supabase.from("weekly_snapshots").select("*"),
      supabase.from("calibration_tests").select("*"),
      supabase.from("habit_daily").select("*"),
    ]);

  if (state.error && state.error.code !== "PGRST116") return null;

  let restored = 0;
  const mark = <T,>(rows: T[] | null): Array<T & { synced: 1 }> =>
    (rows ?? []).map((r) => ({ ...r, synced: 1 as const }));

  await db.transaction(
    "rw",
    [
      db.programState,
      db.ifThenPlans,
      db.woopEntries,
      db.sessions,
      db.sets,
      db.dailyLogs,
      db.personalRecords,
      db.painLog,
      db.weeklySnapshots,
      db.calibrationTests,
      db.habitDaily,
    ],
    async () => {
      if (state.data) {
        // serwer adresuje stan właścicielem, urządzenie trzyma go pod id = 1
        await db.programState.put({ ...(state.data as ProgramState), id: 1, synced: 1 });
        restored++;
      }
      for (const [table, rows] of [
        [db.ifThenPlans, plans.data],
        [db.woopEntries, woop.data],
        [db.sessions, sessions.data],
        [db.sets, sets.data],
        [db.dailyLogs, logs.data],
        [db.personalRecords, records.data],
        [db.painLog, pains.data],
        [db.weeklySnapshots, snaps.data],
        [db.calibrationTests, calibrations.data],
        [db.habitDaily, habits.data],
      ] as const) {
        const marked = mark(rows as unknown[] as Record<string, unknown>[]);
        if (marked.length) {
          // @ts-expect-error tabele mają różne typy wierszy, kształt pilnuje serwer
          await table.bulkPut(marked);
          restored += marked.length;
        }
      }
    }
  );

  return { restored };
}

export async function dictionariesReady(): Promise<boolean> {
  return (await db.exercises.count()) > 0 && (await db.workoutTemplates.count()) > 0;
}

// ---------------------------------------------------------------- stan programu

export async function getProgramState(): Promise<LocalProgramState | undefined> {
  return db.programState.get(1);
}

/**
 * Zakłada stan programu przy pierwszym logowaniu. Nie nadpisuje istniejącego -
 * dane z urządzenia są tu źródłem prawdy.
 */
export async function ensureProgramState(
  owner: string,
  init?: Partial<Pick<ProgramState, "started_on">>
): Promise<LocalProgramState> {
  const existing = await db.programState.get(1);
  if (existing) return existing;

  const row: LocalProgramState = {
    id: 1,
    owner,
    started_on: init?.started_on ?? todayIso(),
    program_week: 1,
    unlocked_modules: ["training"],
    manual_unlocks: [],
    calorie_tracking_off: false,
    weighing_frequency: "daily",
    maintenance_kcal: null,
    calorie_goal_kcal: null,
    goal_mode: null,
    emergency_mode: false,
    emergency_started_on: null,
    rir_bias: null,
    height_cm: null,
    goal_revised_on: null,
    session_time: null,
    protein_per_kg: PROTEIN_PER_KG.default,
    protein_tiles: null,
    updated_at: nowIso(),
    synced: 0,
  };

  await db.programState.put(row);
  await enqueue("program_state", "insert", "1", stripLocal(row));
  return row;
}

export async function saveProgramState(patch: Partial<ProgramState>): Promise<LocalProgramState> {
  const current = await db.programState.get(1);
  if (!current) throw new Error("Stan programu nie istnieje - najpierw ensureProgramState().");

  const next: LocalProgramState = { ...current, ...patch, updated_at: nowIso(), synced: 0 };
  await db.programState.put(next);
  await enqueue("program_state", "update", "1", stripLocal(next));
  return next;
}

// ---------------------------------------------------------------- nawyki

export async function saveIfThenPlan(
  input: Pick<IfThenPlan, "type" | "trigger_pl" | "action_pl"> &
    Partial<Pick<IfThenPlan, "id" | "active">>
): Promise<LocalIfThenPlan> {
  const owner = await requireOwner();
  const existing = input.id ? await db.ifThenPlans.get(input.id) : undefined;

  const row: LocalIfThenPlan = {
    id: input.id ?? newId(),
    owner,
    type: input.type,
    trigger_pl: input.trigger_pl,
    action_pl: input.action_pl,
    active: input.active ?? existing?.active ?? true,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    synced: 0,
  };

  await db.ifThenPlans.put(row);
  await enqueue("if_then_plans", existing ? "update" : "insert", row.id, stripLocal(row));
  return row;
}

export async function saveWoop(
  input: Pick<WoopEntry, "wish" | "outcome" | "obstacle" | "plan">
): Promise<LocalWoopEntry> {
  const owner = await requireOwner();
  const created = new Date();
  const review = new Date(created.getTime() + 28 * 86_400_000);

  const row: LocalWoopEntry = {
    id: newId(),
    owner,
    ...input,
    created_at: created.toISOString(),
    review_at: todayIso(review),
    updated_at: nowIso(),
    synced: 0,
  };

  await db.woopEntries.put(row);
  await enqueue("woop_entries", "insert", row.id, stripLocal(row));
  return row;
}

// ---------------------------------------------------------------- pomiar dzienny

export async function saveDailyLog(
  logDate: IsoDate,
  patch: Partial<Omit<DailyLog, "log_date" | "owner" | "updated_at">>
): Promise<LocalDailyLog> {
  const owner = await requireOwner();
  const current = await db.dailyLogs.get(logDate);

  const next: LocalDailyLog = {
    log_date: logDate,
    owner,
    weight_kg: null,
    protein_g: null,
    calories_kcal: null,
    wake_time: null,
    sleep_quality: null,
    creatine_taken: null,
    steps: null,
    ...current,
    ...patch,
    updated_at: nowIso(),
    synced: 0,
  };

  await db.dailyLogs.put(next);
  await enqueue("daily_logs", current ? "update" : "insert", logDate, stripLocal(next));
  return next;
}

// ---------------------------------------------------------------- sesja i serie

export async function startSession(
  templateId: string,
  programWeek: number
): Promise<LocalSession> {
  const owner = await requireOwner();
  const row: LocalSession = {
    id: newId(),
    owner,
    template_id: templateId,
    started_at: nowIso(),
    finished_at: null,
    status: "in_progress",
    program_week: programWeek,
    note: null,
    updated_at: nowIso(),
    synced: 0,
  };
  await db.sessions.put(row);
  await enqueue("sessions", "insert", row.id, stripLocal(row));
  return row;
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<WorkoutSession, "id" | "owner">>
): Promise<LocalSession> {
  const current = await db.sessions.get(id);
  if (!current) throw new Error(`Nie ma sesji ${id}`);
  const next: LocalSession = { ...current, ...patch, updated_at: nowIso(), synced: 0 };
  await db.sessions.put(next);
  await enqueue("sessions", "update", id, stripLocal(next));
  return next;
}

export async function logSet(
  input: Omit<SetEntry, "id" | "owner" | "logged_at" | "updated_at"> &
    Partial<Pick<SetEntry, "id" | "logged_at">>
): Promise<LocalSet> {
  const owner = await requireOwner();
  const row: LocalSet = {
    id: input.id ?? newId(),
    owner,
    session_id: input.session_id,
    exercise_id: input.exercise_id,
    set_index: input.set_index,
    weight_kg: input.weight_kg,
    reps: input.reps,
    rir: input.rir,
    is_calibration: input.is_calibration,
    predicted_reps: input.predicted_reps,
    logged_at: input.logged_at ?? nowIso(),
    updated_at: nowIso(),
    synced: 0,
  };
  await db.sets.put(row);
  await enqueue("sets", "insert", row.id, stripLocal(row));
  return row;
}

// ---------------------------------------------------------------- monitoring (faza 4B)

/**
 * Rekordy z właśnie zapisanej serii. Liczone i zapisywane LOKALNIE, bo mają pojawić się
 * w podsumowaniu sesji natychmiast - także bez zasięgu.
 */
export async function recordsForSet(set: LocalSet): Promise<Array<LocalPersonalRecord & { sentence: string }>> {
  const owner = await requireOwner();
  const history = (await db.sets.where("exercise_id").equals(set.exercise_id).toArray()).filter(
    (s) => s.id !== set.id && s.logged_at <= set.logged_at
  );

  const sessionSets = (await db.sets.where("session_id").equals(set.session_id).toArray()).filter(
    (s) => s.exercise_id === set.exercise_id
  );
  const currentTonnage = sessionSets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
  const bestTonnage = await bestSessionTonnage(set.exercise_id, set.session_id);

  const detected = detectRecords(set, history, { current: currentTonnage, best: bestTonnage });
  if (detected.length === 0) return [];

  const exercise = await db.exercises.get(set.exercise_id);
  const out: Array<LocalPersonalRecord & { sentence: string }> = [];

  for (const record of detected) {
    const row: LocalPersonalRecord = {
      id: newId(),
      owner,
      exercise_id: set.exercise_id,
      record_type: record.record_type,
      value: record.value,
      weight_kg: record.weight_kg,
      reps: record.reps,
      rir: record.rir,
      set_id: set.id,
      session_id: set.session_id,
      achieved_on: set.logged_at.slice(0, 10) as IsoDate,
      previous_value: record.previous_value,
      created_at: nowIso(),
      synced: 0,
    };
    await db.personalRecords.put(row);
    await enqueue("personal_records", "insert", row.id, stripLocal(row));
    out.push({ ...row, sentence: recordSentence(exercise?.name_pl ?? "Ćwiczenie", record) });
  }

  return out;
}

/** Najlepszy dotychczasowy tonaż tego ćwiczenia w pojedynczej sesji, z pominięciem bieżącej. */
async function bestSessionTonnage(exerciseId: string, exceptSessionId: string): Promise<number> {
  const all = await db.sets.where("exercise_id").equals(exerciseId).toArray();
  const bySession = new Map<string, number>();
  for (const s of all) {
    if (s.session_id === exceptSessionId) continue;
    bySession.set(s.session_id, (bySession.get(s.session_id) ?? 0) + (s.weight_kg ?? 0) * (s.reps ?? 0));
  }
  return Math.max(0, ...bySession.values());
}

/**
 * Wpis do logu bólu. Aplikacja tylko zapisuje i - gdy widzi wzorzec - odsyła do
 * fizjoterapeuty. Nie diagnozuje, nie proponuje ćwiczeń korekcyjnych, nie zgaduje przyczyny.
 */
export async function logPain(input: {
  body_part: PainEntry["body_part"];
  severity: number;
  context?: PainEntry["context"];
  exercise_id?: string | null;
  note?: string | null;
  logged_on?: IsoDate;
}): Promise<{ entry: LocalPainEntry; signal: string | null }> {
  const owner = await requireOwner();
  const loggedOn = input.logged_on ?? todayIso();

  const row: LocalPainEntry = {
    id: newId(),
    owner,
    logged_on: loggedOn,
    body_part: input.body_part,
    severity: input.severity,
    context: input.context ?? null,
    exercise_id: input.exercise_id ?? null,
    note: input.note ?? null,
    resolved_on: null,
    created_at: nowIso(),
    synced: 0,
  };

  await db.painLog.put(row);
  await enqueue("pain_log", "insert", row.id, stripLocal(row));

  const all = await db.painLog.toArray();
  return { entry: row, signal: painSignal(all, input.body_part, loggedOn, input.severity) };
}

export async function resolvePain(id: string, on: IsoDate = todayIso()): Promise<void> {
  const row = await db.painLog.get(id);
  if (!row) return;
  const next: LocalPainEntry = { ...row, resolved_on: on, synced: 0 };
  await db.painLog.put(next);
  await enqueue("pain_log", "update", id, stripLocal(next));
}

/** Zapis testu kalibracji RIR - historia pokazuje, czy ocena zapasu się poprawia. */
export async function logCalibration(input: {
  exercise_id: string;
  set_id?: string | null;
  predicted_reps: number;
  actual_reps: number;
  tested_on?: IsoDate;
}): Promise<LocalCalibrationTest> {
  const owner = await requireOwner();
  const row: LocalCalibrationTest = {
    id: newId(),
    owner,
    exercise_id: input.exercise_id,
    set_id: input.set_id ?? null,
    predicted_reps: input.predicted_reps,
    actual_reps: input.actual_reps,
    bias: input.actual_reps - input.predicted_reps,
    tested_on: input.tested_on ?? todayIso(),
    created_at: nowIso(),
    synced: 0,
  };
  await db.calibrationTests.put(row);
  await enqueue("calibration_tests", "insert", row.id, stripLocal(row));
  return row;
}

/**
 * Zamknięcie tygodnia. Migawka jest niemodyfikowalna: jeśli tydzień już zapisano,
 * kolejne wywołanie niczego nie nadpisuje - nawet gdy użytkownik uzupełni potem
 * brakujący wpis, historia ma pokazywać, jak było naprawdę.
 */
export async function saveSnapshot(snapshot: Snapshot, note?: string): Promise<LocalWeeklySnapshot | null> {
  const owner = await requireOwner();
  if (await db.weeklySnapshots.get(snapshot.week_start)) return null;

  const row: LocalWeeklySnapshot = {
    id: newId(),
    owner,
    ...snapshot,
    note: note ?? null,
    created_at: nowIso(),
    synced: 0,
  };
  await db.weeklySnapshots.put(row);
  await enqueue("weekly_snapshots", "insert", row.week_start, stripLocal(row));
  return row;
}

/** Dzienny wiersz nawyków - podstawa kalendarza 90 dni i trafności w oknach. */
export async function refreshHabitDay(date: IsoDate, proteinTarget: number | null): Promise<void> {
  const owner = await requireOwner();
  const log = await db.dailyLogs.get(date);
  const sessions = await db.sessions.toArray();
  const trained = sessions.some(
    (s) => s.started_at.slice(0, 10) === date && (s.status === "full" || s.status === "minimal")
  );

  const row: LocalHabitDaily = {
    owner,
    log_date: date,
    training_done: trained,
    protein_hit: proteinTarget !== null && log?.protein_g != null ? log.protein_g >= proteinTarget * 0.9 : null,
    creatine_taken: log?.creatine_taken ?? null,
    wake_on_target: log?.wake_time != null ? true : null,
    weight_logged: log?.weight_kg != null,
    updated_at: nowIso(),
    synced: 0,
  };

  await db.habitDaily.put(row);
  await enqueue("habit_daily", "insert", date, stripLocal(row));
}

/**
 * Przelicza dziennik nawyków dla ostatnich dni. Wołane przy wejściu do aplikacji:
 * kalendarz 90 dni ma pokazywać stan faktyczny, także gdy wpis uzupełniono z opóźnieniem.
 */
export async function rebuildHabits(days: number): Promise<void> {
  const today = todayIso();

  // Cel białka liczymy tu, a nie w ekranie: „trafione białko" ma znaczyć to samo
  // niezależnie od tego, który widok akurat odświeża dziennik.
  const state = await db.programState.get(1);
  const logs = await db.dailyLogs.toArray();
  const average = weightSummary(
    logs,
    today,
    state?.weighing_frequency === "weekly" ? "weekly" : "daily"
  ).average;
  const proteinTarget = proteinTargetOf(average, state?.protein_per_kg ?? PROTEIN_PER_KG.default);

  for (let i = 0; i < days; i++) {
    const date = shiftIso(today, -i);
    const log = await db.dailyLogs.get(date);
    const trained = (await db.sessions.toArray()).some(
      (s) => s.started_at.slice(0, 10) === date && (s.status === "full" || s.status === "minimal")
    );
    if (!log && !trained) continue;
    await refreshHabitDay(date, proteinTarget);
  }
}

/** Prognoza jest wspólna i niezmienna - kopiujemy ją raz, żeby wykres działał offline. */
export async function syncForecast(): Promise<number> {
  if (await db.forecastPoints.count()) return 0;
  const { data, error } = await supabase.from("forecast_points").select("*");
  if (error || !data) return 0;
  await db.forecastPoints.bulkPut(data as ForecastPoint[]);
  return data.length;
}

// ---------------------------------------------------------------- pomiar

/**
 * Obwody: jeden zestaw na dzień. Powtórzony pomiar tego samego dnia nadpisuje
 * poprzedni, bo to poprawka, a nie druga obserwacja.
 */
export async function saveMeasurement(
  takenOn: IsoDate,
  values: Partial<Pick<Measurement, "arm_cm" | "chest_cm" | "waist_cm" | "thigh_cm">>
): Promise<LocalMeasurement> {
  const owner = await requireOwner();
  const existing = await db.measurements.where("taken_on").equals(takenOn).first();

  const row: LocalMeasurement = {
    id: existing?.id ?? newId(),
    owner,
    taken_on: takenOn,
    arm_cm: null,
    chest_cm: null,
    waist_cm: null,
    thigh_cm: null,
    ...existing,
    ...values,
    updated_at: nowIso(),
    synced: 0,
  };

  await db.measurements.put(row);
  await enqueue("measurements", existing ? "update" : "insert", row.id, stripLocal(row));
  return row;
}

/**
 * Zdjęcie postępu. Jedyne miejsce w aplikacji, które **wymaga** sieci: plik idzie
 * do prywatnego bucketa, a kolejka offline przenosi wiersze, nie bajty. Wywołanie
 * bez połączenia kończy się czytelnym błędem, żeby ekran mógł to wprost powiedzieć.
 */
export async function savePhoto(
  file: Blob,
  takenOn: IsoDate,
  pose: ProgressPhoto["pose"]
): Promise<LocalProgressPhoto> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Zdjęcie wymaga połączenia. Zrób je ponownie, gdy będzie zasięg.");
  }

  const owner = await requireOwner();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${owner}/${takenOn}-${pose ?? "front"}-${newId().slice(0, 8)}.${ext}`;

  const upload = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (upload.error) throw new Error(upload.error.message);

  const row: LocalProgressPhoto = {
    id: newId(),
    owner,
    taken_on: takenOn,
    storage_path: path,
    pose,
    updated_at: nowIso(),
    synced: 0,
  };

  await db.progressPhotos.put(row);
  await enqueue("progress_photos", "insert", row.id, stripLocal(row));
  return row;
}

export const PHOTO_BUCKET = "progress-photos";

/** Podpisany adres - bucket jest prywatny, więc bez tego zdjęcia nie da się wyświetlić. */
export async function photoUrl(storagePath: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, seconds);
  return data?.signedUrl ?? null;
}

export async function deletePhoto(id: string): Promise<void> {
  const row = await db.progressPhotos.get(id);
  if (!row) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([row.storage_path]);
  await db.progressPhotos.delete(id);
  await enqueue("progress_photos", "delete", id, {});
}

// ---------------------------------------------------------------- pomocnicze

async function requireOwner(): Promise<string> {
  const owner = await getOwner();
  if (owner) return owner;
  // getSession czyta z pamięci przeglądarki i działa bez sieci; getUser odpytałby serwer.
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Brak zalogowanego użytkownika.");
  await setOwner(id);
  return id;
}

/** Zdejmuje pola lokalne - do bazy nie leci nic, czego nie ma w schemacie. */
function stripLocal<T extends { synced?: unknown }>(row: T): Record<string, unknown> {
  const copy = { ...row } as Record<string, unknown>;
  delete copy.synced;
  return copy;
}
