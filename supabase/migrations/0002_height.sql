-- Onboarding zbiera wzrost, a schemat początkowy
-- nie miał na niego miejsca. Wzrost jest stały, więc należy do stanu programu,
-- a nie do pomiarów dziennych.
alter table system.program_state add column if not exists height_cm numeric;
