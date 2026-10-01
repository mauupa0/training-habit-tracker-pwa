-- Faza 4B: warstwa monitoringu. Zasada nadrzędna tej fazy brzmi „nic nie znika" -
-- wartość aplikacji w osiemnastym miesiącu polega na tym, że da się wrócić do tygodnia 3
-- i zobaczyć, jak było naprawdę. Jedno nadpisanie psuje ten łańcuch.
--
-- Klucze wszystkich nowych tabel z danymi użytkownika zawierają właściciela. Migracja 0003
-- naprawiała dokładnie ten błąd (jeden wiersz na całą bazę zamiast na konto), więc tutaj
-- nie powtarzamy go ani razu: żadnego `primary key (log_date)` i żadnego `unique (week_start)`.

-- ===================== MIĘKKIE USUWANIE =====================
alter table system.sessions        add column if not exists deleted_at timestamptz;
alter table system.sets            add column if not exists deleted_at timestamptz;
alter table system.if_then_plans   add column if not exists deleted_at timestamptz;
alter table system.woop_entries    add column if not exists deleted_at timestamptz;
alter table system.measurements    add column if not exists deleted_at timestamptz;
alter table system.progress_photos add column if not exists deleted_at timestamptz;

-- ===================== WERSJE SERII =====================
-- Edycja serii zapisuje poprzednią wartość zamiast ją nadpisywać.
create table if not exists system.set_revisions (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid(),
  set_id        uuid not null references system.sets(id) on delete cascade,
  weight_kg     numeric,
  reps          int,
  rir           numeric,
  replaced_at   timestamptz not null default now()
);

create index if not exists set_revisions_set_idx on system.set_revisions (set_id, replaced_at desc);

-- ===================== REKORDY OSOBISTE =====================
create table if not exists system.personal_records (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid(),
  exercise_id    uuid not null references system.exercises(id),
  record_type    text not null check (record_type in ('max_weight', 'max_reps_at_weight', 'est_1rm', 'max_volume_session')),
  value          numeric not null,
  weight_kg      numeric,
  reps           int,
  rir            numeric,
  set_id         uuid references system.sets(id),
  session_id     uuid references system.sessions(id),
  achieved_on    date not null,
  previous_value numeric,
  created_at     timestamptz not null default now()
);

create index if not exists pr_exercise_idx on system.personal_records (owner, exercise_id, record_type, achieved_on desc);

-- ===================== HISTORIA KALIBRACJI RIR =====================
create table if not exists system.calibration_tests (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid(),
  exercise_id    uuid not null references system.exercises(id),
  set_id         uuid references system.sets(id),
  predicted_reps int not null,
  actual_reps    int not null,
  bias           int not null,
  tested_on      date not null,
  created_at     timestamptz not null default now()
);

-- ===================== LOG BÓLU =====================
-- To nie jest diagnostyka. Zapis istnieje po to, żeby dało się wychwycić wzorzec
-- i pójść z nim do fizjoterapeuty.
create table if not exists system.pain_log (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid(),
  logged_on    date not null,
  body_part    text not null,
  severity     int not null check (severity between 1 and 5),
  context      text,
  exercise_id  uuid references system.exercises(id),
  note         text,
  resolved_on  date,
  created_at   timestamptz not null default now()
);

create index if not exists pain_log_idx on system.pain_log (owner, body_part, logged_on desc);

-- ===================== MIGAWKI TYGODNIOWE =====================
-- Niemodyfikowalne: raz zamknięty tydzień zostaje taki, jaki był.
create table if not exists system.weekly_snapshots (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null default auth.uid(),
  week_start        date not null,
  program_week      int not null,
  sessions_done     int not null,
  sessions_planned  int not null,
  sessions_minimal  int not null,
  total_tonnage_kg  numeric,
  sets_by_muscle    jsonb,
  weight_avg7_kg    numeric,
  protein_avg_g     numeric,
  protein_hit_days  int,
  calories_avg_kcal numeric,
  wake_time_sd_min  numeric,
  sleep_quality_avg numeric,
  creatine_days     int,
  prs_count         int,
  note              text,
  emergency_mode    boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (owner, week_start)
);

-- ===================== DZIENNIK NAWYKÓW =====================
create table if not exists system.habit_daily (
  owner          uuid not null default auth.uid(),
  log_date       date not null,
  training_done  boolean,
  protein_hit    boolean,
  creatine_taken boolean,
  wake_on_target boolean,
  weight_logged  boolean,
  updated_at     timestamptz not null default now(),
  primary key (owner, log_date)
);

-- ===================== PROGNOZA =====================
-- Dane wspólne, nie użytkownika: punkty prognozy wpisuje się samemu (README, sekcja Prognoza).
-- Stąd brak kolumny owner i odczyt dla każdego zalogowanego.
create table if not exists system.forecast_points (
  id              uuid primary key default gen_random_uuid(),
  month_index     int not null check (month_index between 0 and 24),
  metric          text not null,
  value_realistic numeric not null,
  value_pessimist numeric,
  value_optimist  numeric,
  unique (month_index, metric)
);

-- ===================== GRANTY I RLS =====================
grant select, insert, update, delete on
  system.set_revisions, system.personal_records, system.calibration_tests,
  system.pain_log, system.weekly_snapshots, system.habit_daily
  to authenticated;

grant select on system.forecast_points to authenticated;

alter table system.set_revisions    enable row level security;
alter table system.personal_records enable row level security;
alter table system.calibration_tests enable row level security;
alter table system.pain_log         enable row level security;
alter table system.weekly_snapshots enable row level security;
alter table system.habit_daily      enable row level security;
alter table system.forecast_points  enable row level security;

drop policy if exists set_revisions_own on system.set_revisions;
drop policy if exists personal_records_own on system.personal_records;
drop policy if exists calibration_tests_own on system.calibration_tests;
drop policy if exists pain_log_own on system.pain_log;
drop policy if exists weekly_snapshots_own on system.weekly_snapshots;
drop policy if exists habit_daily_own on system.habit_daily;
drop policy if exists forecast_points_read on system.forecast_points;

create policy set_revisions_own     on system.set_revisions     for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy personal_records_own  on system.personal_records  for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy calibration_tests_own on system.calibration_tests for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy pain_log_own          on system.pain_log          for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy weekly_snapshots_own  on system.weekly_snapshots  for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy habit_daily_own       on system.habit_daily       for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy forecast_points_read  on system.forecast_points   for select to authenticated using (true);

create trigger habit_daily_updated_at before update on system.habit_daily for each row execute function system.set_updated_at();
