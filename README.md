# System - dziennik treningowy

Aplikacja treningowo-nawykowa dla jednej osoby: trening 4 razy w tygodniu, białko, sen i kilka nawyków, prowadzone przez minimum 12 miesięcy. Działa offline (na siłowni często nie ma zasięgu), instaluje się na telefonie jako PWA i synchronizuje z własną bazą Supabase.

*English: an offline-first training and habit log for a single user, built around behavioural research instead of gamification. No streaks, no XP, no motivational quotes; every dosing number links to the study behind it. Next.js 15, Supabase, Dexie (IndexedDB), PWA. UI in Polish.*

## Dlaczego to nie jest kolejna apka fitness

Plan treningowy oparty na metaanalizach to kilka procent wyniku. Reszta zależy od tego, czy za rok dalej trenujesz. Dlatego każda decyzja produktowa jest podporządkowana wytrwałości, a nie liczbie funkcji. W kodzie pilnuje tego siedem reguł, a skrypt `pnpm audit-regul` sprawdza, czy żadnej nie złamano:

1. **Bez licznika serii, który zeruje się po jednym dniu.** Główna metryka to „treningi w ostatnich 28 dniach”. Pominięcie jednego dnia nie wywołuje żadnego komunikatu (Lally i wsp. 2010).
2. **Tryb minimum to pełnoprawny trening.** Dwa ćwiczenia po dwie serie liczą się jako odbyta sesja, bez gorszego koloru.
3. **Zero treści motywacyjnych.** Przed sesją widać tylko dane z poprzedniego tygodnia (Kappes i Oettingen 2011).
4. **Waga jako średnia 7-dniowa.** Dzisiejszy pomiar jest małym drukiem, bo dzienne wahania to głównie woda.
5. **Moduły odblokowują się stopniowo:** trening, potem białko, sen i kreatyna, pomiar kalorii, cel kaloryczny z danych, kroki.
6. **Plany „jeśli-to” są danymi pierwszej klasy,** z osobnymi planami na porażkę (Gollwitzer i Sheeran 2006).
7. **Ochrona przed restrykcją:** deficyt najwyżej 500 kcal, twardy dolny próg kalorii, wyłączenie liczenia kalorii jednym kliknięciem.

Każda liczba dawkowania w interfejsie jest klikalna aż do publikacji naukowej (rejestr źródeł: `src/lib/sources/registry.ts`).

## Stack

Next.js 15 (App Router), TypeScript w trybie strict, Tailwind CSS 4, Supabase (Postgres, Auth, RLS, Storage na zdjęcia postępu), Dexie (IndexedDB) z kolejką synchronizacji, PWA. Każdy zapis trafia najpierw do IndexedDB, a do bazy idzie po powrocie sieci. Konflikty rozstrzyga `updated_at`.

## Uruchomienie

1. Załóż projekt w [Supabase](https://supabase.com). Dane siedzą w osobnym schemacie `system`.
2. W SQL Editorze uruchom po kolei pliki z `supabase/migrations/`, a potem `supabase/seed.sql` (27 ćwiczeń i 4 szablony dni treningowych).
3. W ustawieniach Data API dopisz `system` do „Exposed schemas”.
4. W Authentication dodaj użytkownika z mailem i hasłem (z potwierdzonym adresem), a potem wyłącz rejestrację nowych użytkowników. Apka ma jedno konto, ekran logowania pyta tylko o hasło.
5. Skopiuj `.env.example` do `.env.local` i wpisz adres projektu, klucz publishable oraz mail konta z punktu 4.
6. Start:

```bash
pnpm install
pnpm dev
```

Hosting: Vercel albo Cloudflare, z tymi samymi trzema zmiennymi środowiskowymi.

### Prognoza

Ekran postępu umie zestawić ciężar roboczy na ławce, w przysiadzie i w martwym ciągu z prognozą na 24 miesiące. Prognoza jest osobista, więc tabela `system.forecast_points` startuje pusta. Własną wpiszesz jednym zapytaniem z metrykami `bench_working`, `squat_working` i `deadlift_working` dla miesięcy od 0 do 24:

```sql
insert into system.forecast_points (month_index, metric, value_realistic, value_pessimist, value_optimist)
values (0, 'bench_working', 40, 40, 40),
       (12, 'bench_working', 60, 52.5, 67.5),
       (24, 'bench_working', 75, 60, 85);
```

## Testy

```bash
pnpm sprawdz    # typecheck, 120 testów jednostkowych i audyt reguł R1-R7
```

Skrypty `e2e*.cjs` przechodzą ekrany w przeglądarce. Potrzebują globalnego Playwrighta (`npm i -g playwright`) i konta testowego, które zakłada `e2e-login.cjs` przez Management API Supabase (`SUPABASE_PAT`).

## Licencja

MIT, szczegóły w [LICENSE](LICENSE).
