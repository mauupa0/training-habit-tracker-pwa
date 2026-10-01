-- Klucze główne bez właściciela sprawiały, że wiersz był globalny dla całej bazy,
-- a nie dla użytkownika. Przy RLS `owner = auth.uid()` to sprzeczność: drugie konto
-- widzi pustą tabelę, ale przy zapisie dostaje 42501 (USING expression), bo wiersz
-- o tym kluczu już istnieje i należy do kogoś innego. Dotyczyło dwóch tabel:
--
--   program_state  PRIMARY KEY (id) + CHECK (id = 1)  → jeden wiersz na CAŁĄ bazę
--   daily_logs     PRIMARY KEY (log_date)             → jeden wpis na dzień na CAŁĄ bazę
--
-- Aplikacja jest jednoosobowa, więc na jednym koncie działało to poprawnie - ale
-- świeżej instalacji nie da się przez to przetestować drugim kontem, a każde nowe
-- konto (inny mail, przeniesienie na własny projekt Supabase) trafia na cichy błąd
-- w kolejce synchronizacji.

alter table system.program_state drop constraint single_row;
alter table system.program_state drop constraint program_state_pkey;
alter table system.program_state add constraint program_state_pkey primary key (owner);

comment on column system.program_state.id is
  'Zaszłość po kluczu jednowierszowym. Serwer jej nie używa - klucz to owner. '
  'Urządzenie trzyma stan pod id = 1, bo lokalna baza obsługuje jedno konto.';

alter table system.daily_logs drop constraint daily_logs_pkey;
alter table system.daily_logs add constraint daily_logs_pkey primary key (owner, log_date);
