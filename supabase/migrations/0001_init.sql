-- =====================================================================
-- System - schemat początkowy
-- Jeden użytkownik. Każda tabela z danymi ma owner + updated_at
-- (updated_at rozstrzyga konflikty przy synchronizacji offline).
--
-- Wszystko żyje w osobnym schemacie `system`.
-- Aby PostgREST wystawił ten schemat: Dashboard → Settings → API →
-- Exposed schemas → dopisać `system`.
-- =====================================================================

create schema if not exists system;

grant usage on schema system to anon, authenticated, service_role;

-- ============ FUNKCJA POMOCNICZA ============
-- search_path pusty: funkcji nie da się przejąć manipulacją ścieżką wyszukiwania
create or replace function system.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ SŁOWNIK ĆWICZEŃ ============
create table system.exercises (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name_pl       text not null,
  muscle_group  text not null,
  is_compound   boolean not null default false,
  increment_kg  numeric not null,          -- 2.5 góra ciała, 5 dół
  is_unilateral boolean not null default false,
  source_ref    text,                      -- klucz do rejestru źródeł, np. 'maeo2021'
  notes_pl      text
);

-- ============ SZABLONY DNI ============
create table system.workout_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,        -- upper_a | lower_a | upper_b | lower_b
  name_pl     text not null,
  subtitle_pl text,
  position    int not null
);

create table system.template_exercises (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references system.workout_templates(id) on delete cascade,
  exercise_id  uuid not null references system.exercises(id),
  position     int not null,               -- 1 i 2 = zestaw trybu minimum
  target_sets  int not null,
  rep_min      int not null,
  rep_max      int not null,
  target_rir   text,                       -- '2' | '1-2' | '0-1' | '2-3' | null dla brzucha
  rest_seconds int not null,
  unique (template_id, position)
);

-- ============ SESJE ============
create table system.sessions (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid(),
  template_id  uuid not null references system.workout_templates(id),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'in_progress',  -- in_progress | full | minimal | abandoned
  program_week int not null,
  note         text,
  updated_at   timestamptz not null default now()
);

-- ============ SERIE - rdzeń aplikacji ============
create table system.sets (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid(),
  session_id     uuid not null references system.sessions(id) on delete cascade,
  exercise_id    uuid not null references system.exercises(id),
  set_index      int not null,
  weight_kg      numeric not null,
  reps           int not null,
  rir            numeric,                  -- 0 = faktyczny upadek, null = nie podano
  is_calibration boolean not null default false,
  predicted_reps int,                      -- tylko dla serii kalibracyjnych
  logged_at      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index sets_exercise_logged_idx on system.sets (exercise_id, logged_at desc);
create index sets_session_idx on system.sets (session_id);
-- statystyka 28-dniowa pyta o sesje po dacie przy każdym otwarciu aplikacji
create index sessions_started_idx on system.sessions (started_at desc);

-- ============ PLANY JEŚLI-TO ============
create table system.if_then_plans (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  type       text not null,                -- start | failure
  trigger_pl text not null,
  action_pl  text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ WOOP ============
create table system.woop_entries (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  wish       text not null,
  outcome    text not null,
  obstacle   text not null,
  plan       text not null,
  created_at timestamptz not null default now(),
  review_at  date not null,                -- created_at + 28 dni
  updated_at timestamptz not null default now()
);

-- ============ POMIARY DZIENNE ============
create table system.daily_logs (
  log_date       date primary key,
  owner          uuid not null default auth.uid(),
  weight_kg      numeric,
  protein_g      int,
  calories_kcal  int,
  wake_time      time,
  sleep_quality  int check (sleep_quality between 1 and 5),
  creatine_taken boolean,
  steps          int,
  updated_at     timestamptz not null default now()
);

-- ============ OBWODY I ZDJĘCIA ============
create table system.measurements (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  taken_on   date not null,
  arm_cm numeric, chest_cm numeric, waist_cm numeric, thigh_cm numeric,
  updated_at timestamptz not null default now()
);

create table system.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid(),
  taken_on     date not null,
  storage_path text not null,
  pose         text,                       -- front | side | back
  updated_at   timestamptz not null default now()
);

-- ============ STAN PROGRAMU ============
create table system.program_state (
  id                     int primary key default 1,
  owner                  uuid not null default auth.uid(),
  started_on             date not null default current_date,
  program_week           int not null default 1,
  unlocked_modules       text[] not null default '{training}',
  manual_unlocks         text[] not null default '{}',
  calorie_tracking_off   boolean not null default false,
  weighing_frequency     text not null default 'daily',  -- daily | weekly | never
  maintenance_kcal       int,
  calorie_goal_kcal      int,
  goal_mode              text,             -- recomp | bulk
  emergency_mode         boolean not null default false,
  emergency_started_on   date,
  rir_bias               numeric,          -- średnia z kalibracji
  updated_at             timestamptz not null default now(),
  constraint single_row check (id = 1)
);

-- =====================================================================
-- TRIGGERY updated_at
-- =====================================================================
create trigger sessions_updated_at        before update on system.sessions        for each row execute function system.set_updated_at();
create trigger sets_updated_at            before update on system.sets            for each row execute function system.set_updated_at();
create trigger if_then_plans_updated_at   before update on system.if_then_plans   for each row execute function system.set_updated_at();
create trigger woop_entries_updated_at    before update on system.woop_entries    for each row execute function system.set_updated_at();
create trigger daily_logs_updated_at      before update on system.daily_logs      for each row execute function system.set_updated_at();
create trigger measurements_updated_at    before update on system.measurements    for each row execute function system.set_updated_at();
create trigger progress_photos_updated_at before update on system.progress_photos for each row execute function system.set_updated_at();
create trigger program_state_updated_at   before update on system.program_state   for each row execute function system.set_updated_at();

-- =====================================================================
-- GRANTY
-- Warstwa niższa niż RLS: bez nich PostgREST dostaje 42501 mimo polityk.
-- =====================================================================
grant select on system.exercises, system.workout_templates, system.template_exercises to anon, authenticated;

grant select, insert, update, delete on
  system.sessions, system.sets, system.if_then_plans, system.woop_entries,
  system.daily_logs, system.measurements, system.progress_photos, system.program_state
  to authenticated;

-- =====================================================================
-- RLS
-- Dane użytkownika: wyłącznie własne wiersze.
-- Słowniki: odczyt dla zalogowanego, zapis tylko kluczem serwisowym (seed).
-- =====================================================================
alter table system.exercises           enable row level security;
alter table system.workout_templates   enable row level security;
alter table system.template_exercises  enable row level security;
alter table system.sessions            enable row level security;
alter table system.sets                enable row level security;
alter table system.if_then_plans       enable row level security;
alter table system.woop_entries        enable row level security;
alter table system.daily_logs          enable row level security;
alter table system.measurements        enable row level security;
alter table system.progress_photos     enable row level security;
alter table system.program_state       enable row level security;

-- słowniki: tylko odczyt
create policy exercises_read          on system.exercises          for select to authenticated using (true);
create policy workout_templates_read  on system.workout_templates  for select to authenticated using (true);
create policy template_exercises_read on system.template_exercises for select to authenticated using (true);

-- dane użytkownika: własne wiersze, każda operacja
-- (select auth.uid()) zamiast auth.uid() - planer wywołuje raz na zapytanie, nie raz na wiersz
create policy sessions_own        on system.sessions        for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy sets_own            on system.sets            for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy if_then_plans_own   on system.if_then_plans   for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy woop_entries_own    on system.woop_entries    for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy daily_logs_own      on system.daily_logs      for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy measurements_own    on system.measurements    for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy progress_photos_own on system.progress_photos for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy program_state_own   on system.program_state   for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
