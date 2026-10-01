// Typy lustrzane wobec schematu `system` w Supabase.
// Nazwy pól celowo takie same jak kolumny - payload leci do bazy bez mapowania.

import type { ModuleKey } from "@/lib/domain/program";
import type { TemplateKey } from "@/lib/domain/schedule";

export type { TemplateKey };

export type Uuid = string;
export type IsoDate = string;      // 'YYYY-MM-DD'
export type IsoDateTime = string;  // pełny timestamptz

/** 0/1 zamiast boolean: IndexedDB nie indeksuje wartości logicznych. */
export type Flag = 0 | 1;

// ============ SŁOWNIKI ============

export type Exercise = {
  id: Uuid;
  slug: string;
  name_pl: string;
  muscle_group: string;
  is_compound: boolean;
  increment_kg: number;
  is_unilateral: boolean;
  source_ref: string | null;
  notes_pl: string | null;
};

export type WorkoutTemplate = {
  id: Uuid;
  key: TemplateKey;
  name_pl: string;
  subtitle_pl: string | null;
  position: number;
};

export type TemplateExercise = {
  id: Uuid;
  template_id: Uuid;
  exercise_id: Uuid;
  /** 1 i 2 = zestaw trybu minimum (R2) */
  position: number;
  target_sets: number;
  rep_min: number;
  rep_max: number;
  /** '2' | '1-2' | '0-1' | '2-3'; null dla brzucha */
  target_rir: string | null;
  rest_seconds: number;
};

// ============ DANE UŻYTKOWNIKA ============

export type SessionStatus = "in_progress" | "full" | "minimal" | "abandoned";

export type WorkoutSession = {
  id: Uuid;
  owner: Uuid;
  template_id: Uuid;
  started_at: IsoDateTime;
  finished_at: IsoDateTime | null;
  status: SessionStatus;
  program_week: number;
  note: string | null;
  updated_at: IsoDateTime;
};

/** Wiersz tabeli `sets`. Nazwa z sufiksem, żeby nie kolidowała z Set z JS. */
export type SetEntry = {
  id: Uuid;
  owner: Uuid;
  session_id: Uuid;
  exercise_id: Uuid;
  set_index: number;
  weight_kg: number;
  reps: number;
  /** 0 = faktyczny upadek, null = nie podano */
  rir: number | null;
  is_calibration: boolean;
  predicted_reps: number | null;
  logged_at: IsoDateTime;
  updated_at: IsoDateTime;
};

export type IfThenPlan = {
  id: Uuid;
  owner: Uuid;
  type: "start" | "failure";
  trigger_pl: string;
  action_pl: string;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
};

export type WoopEntry = {
  id: Uuid;
  owner: Uuid;
  wish: string;
  outcome: string;
  obstacle: string;
  plan: string;
  created_at: IsoDateTime;
  review_at: IsoDate;
  updated_at: IsoDateTime;
};

export type DailyLog = {
  log_date: IsoDate;
  owner: Uuid;
  weight_kg: number | null;
  protein_g: number | null;
  calories_kcal: number | null;
  wake_time: string | null;
  sleep_quality: number | null;
  creatine_taken: boolean | null;
  steps: number | null;
  updated_at: IsoDateTime;
};

export type Measurement = {
  id: Uuid;
  owner: Uuid;
  taken_on: IsoDate;
  arm_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  thigh_cm: number | null;
  updated_at: IsoDateTime;
};

export type ProgressPhoto = {
  id: Uuid;
  owner: Uuid;
  taken_on: IsoDate;
  storage_path: string;
  pose: "front" | "side" | "back" | null;
  updated_at: IsoDateTime;
};

// ============ MONITORING (faza 4B) ============

export type RecordType = "max_weight" | "max_reps_at_weight" | "est_1rm" | "max_volume_session";

export type PersonalRecord = {
  id: Uuid;
  owner: Uuid;
  exercise_id: Uuid;
  record_type: RecordType;
  value: number;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  set_id: Uuid | null;
  session_id: Uuid | null;
  achieved_on: IsoDate;
  previous_value: number | null;
  created_at: IsoDateTime;
};

export type CalibrationTest = {
  id: Uuid;
  owner: Uuid;
  exercise_id: Uuid;
  set_id: Uuid | null;
  predicted_reps: number;
  actual_reps: number;
  bias: number;
  tested_on: IsoDate;
  created_at: IsoDateTime;
};

export type BodyPart = "bark" | "lokiec" | "nadgarstek" | "dol_plecow" | "biodro" | "kolano" | "inne";

export type PainEntry = {
  id: Uuid;
  owner: Uuid;
  logged_on: IsoDate;
  body_part: BodyPart;
  severity: number;
  context: "podczas_cwiczenia" | "po_treningu" | "niezaleznie" | null;
  exercise_id: Uuid | null;
  note: string | null;
  resolved_on: IsoDate | null;
  created_at: IsoDateTime;
};

export type WeeklySnapshot = {
  id: Uuid;
  owner: Uuid;
  week_start: IsoDate;
  program_week: number;
  sessions_done: number;
  sessions_planned: number;
  sessions_minimal: number;
  total_tonnage_kg: number | null;
  sets_by_muscle: Record<string, number> | null;
  weight_avg7_kg: number | null;
  protein_avg_g: number | null;
  protein_hit_days: number | null;
  calories_avg_kcal: number | null;
  wake_time_sd_min: number | null;
  sleep_quality_avg: number | null;
  creatine_days: number | null;
  prs_count: number | null;
  note: string | null;
  emergency_mode: boolean;
  created_at: IsoDateTime;
};

export type HabitDaily = {
  owner: Uuid;
  log_date: IsoDate;
  training_done: boolean | null;
  protein_hit: boolean | null;
  creatine_taken: boolean | null;
  wake_on_target: boolean | null;
  weight_logged: boolean | null;
  updated_at: IsoDateTime;
};

export type ForecastPoint = {
  id: Uuid;
  month_index: number;
  metric: string;
  value_realistic: number;
  value_pessimist: number | null;
  value_optimist: number | null;
};

export type { ModuleKey };

export type ProgramState = {
  id: 1;
  owner: Uuid;
  started_on: IsoDate;
  program_week: number;
  unlocked_modules: ModuleKey[];
  manual_unlocks: ModuleKey[];
  calorie_tracking_off: boolean;
  weighing_frequency: "daily" | "weekly" | "never";
  maintenance_kcal: number | null;
  calorie_goal_kcal: number | null;
  goal_mode: "recomp" | "bulk" | null;
  emergency_mode: boolean;
  emergency_started_on: IsoDate | null;
  rir_bias: number | null;
  /** stały, zbierany w onboardingu */
  height_cm: number | null;
  /** data ostatniej rewizji celu kalorycznego - rewizja wolno co 14 dni */
  goal_revised_on: IsoDate | null;
  /** zaplanowana pora treningu (HH:MM); null = brak stałej pory */
  session_time: string | null;
  /** g/kg masy ciała; widełki 1,6-2,2 pilnuje też baza */
  protein_per_kg: number;
  /** nadpisanie kafelków; null = zestaw domyślny z aplikacji */
  protein_tiles: ProteinTile[] | null;
  updated_at: IsoDateTime;
};

export type ProteinTile = { label: string; grams: number };

// ============ WARSTWA LOKALNA ============

/** Nazwa tabeli po stronie Supabase - używana przez kolejkę synchronizacji. */
export type SyncTable =
  | "sessions"
  | "sets"
  | "if_then_plans"
  | "woop_entries"
  | "daily_logs"
  | "measurements"
  | "progress_photos"
  | "program_state"
  | "personal_records"
  | "calibration_tests"
  | "pain_log"
  | "weekly_snapshots"
  | "habit_daily";

export type SyncOp = {
  seq?: number;
  table: SyncTable;
  op: "insert" | "update" | "delete";
  /** klucz główny wiersza: uuid, a dla daily_logs data */
  row_key: string;
  payload: Record<string, unknown>;
  created_at: IsoDateTime;
  attempts: number;
  /** epoch ms; przed tym czasem nie ponawiamy (wykładniczy backoff) */
  next_attempt_at: number;
  last_error: string | null;
};

/** Pola doklejane do rekordów trzymanych lokalnie. */
export type LocalMeta = {
  /** 0 = czeka w kolejce, 1 = potwierdzone przez serwer */
  synced: Flag;
};

export type LocalSession = WorkoutSession & LocalMeta;
export type LocalSet = SetEntry & LocalMeta;
export type LocalIfThenPlan = IfThenPlan & LocalMeta;
export type LocalWoopEntry = WoopEntry & LocalMeta;
export type LocalDailyLog = DailyLog & LocalMeta;
export type LocalMeasurement = Measurement & LocalMeta;
export type LocalProgressPhoto = ProgressPhoto & LocalMeta;
export type LocalPersonalRecord = PersonalRecord & LocalMeta;
export type LocalCalibrationTest = CalibrationTest & LocalMeta;
export type LocalPainEntry = PainEntry & LocalMeta;
export type LocalWeeklySnapshot = WeeklySnapshot & LocalMeta;
export type LocalHabitDaily = HabitDaily & LocalMeta;
export type LocalProgramState = ProgramState & LocalMeta;
