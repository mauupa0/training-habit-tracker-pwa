-- Faza 4 (pomiar). Dwie rzeczy, których nie było w schemacie początkowym:
-- ustawienia białka na koncie i miejsce na zdjęcia postępu.

-- Widełki 1,6-2,2 g/kg pochodzą z metaanalizy Mortona i wsp. (2018) - próg 1,62
-- i górna granica przedziału ufności 2,20. Domyślne 1,8 leży bezpiecznie nad progiem.
alter table system.program_state
  add column if not exists protein_per_kg numeric not null default 1.8;

alter table system.program_state
  drop constraint if exists protein_per_kg_range;

alter table system.program_state
  add constraint protein_per_kg_range check (protein_per_kg between 1.6 and 2.2);

-- Kafelki białka są edytowalne, ale zestaw domyślny mieszka w kodzie: null znaczy
-- „użyj domyślnych”, więc zmiana listy startowej nie wymaga migracji danych.
alter table system.program_state
  add column if not exists protein_tiles jsonb;

comment on column system.program_state.protein_tiles is
  'Nadpisanie kafelków białka: [{"label":"Kurczak 200 g","grams":50}]. Null = zestaw domyślny z aplikacji.';

-- ===================== ZDJĘCIA POSTĘPU =====================
-- Bucket prywatny: zdjęcia sylwetki to najbardziej wrażliwa rzecz w tej bazie.
-- Dostęp wyłącznie przez podpisane adresy, plik leży w folderze nazwanym uuid właściciela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists progress_photos_own on storage.objects;

create policy progress_photos_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
