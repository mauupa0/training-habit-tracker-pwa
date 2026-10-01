-- Godzina treningu. Plany jeśli-to z fazy 3 opierają się na wyzwalaczu w rodzaju
-- „jeśli wybije 18:00 w dzień treningowy, to zakładam buty i wychodzę" - ale sama
-- godzina nie miała się dotąd gdzie zapisać, więc aplikacja nie mogła pokazać dnia
-- treningowego z konkretną porą. Wyzwalacz przypięty do godziny działa bez udziału
-- woli; intencja bez pory nie działa wcale (Gollwitzer i Sheeran, 2006).
alter table system.program_state
  add column if not exists session_time time;

comment on column system.program_state.session_time is
  'Zaplanowana pora treningu. Null = brak stałej pory, aplikacja o nią nie zapyta drugi raz.';
