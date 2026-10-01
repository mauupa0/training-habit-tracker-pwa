// Testy monitoringu (faza 4B). Poza poprawnością liczb sprawdzają też to, czego
// w tej warstwie BYĆ NIE MOŻE: ocen, gratulacji i czegokolwiek, co da się wystawić
// jako odznakę.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DIP_EXPLANATION,
  FORECAST_MIN_WEEKS,
  activePain,
  buildSnapshot,
  detectRecords,
  estimate1RM,
  forecastVerdict,
  habitHitRate,
  incrementSentence,
  monthIndexOf,
  painSignal,
  recordSentence,
  weeksOfData,
  weeksPerIncrement,
  type ForecastPoint,
  type HabitDay,
  type PainEntry,
  type SetLike,
} from "../metrics.ts";
import type { IsoDate } from "@/types";

const set = (weight: number, reps: number, rir: number | null, day: string): SetLike => ({
  exercise_id: "bench",
  weight_kg: weight,
  reps,
  rir,
  logged_at: `${day}T17:00:00.000Z`,
});

describe("szacowany ciężar maksymalny", () => {
  it("liczy powtórzenia do upadku razem z zapasem", () => {
    // 60 kg × 8 z RIR 2 to jak 10 powtórzeń do upadku
    assert.equal(estimate1RM(60, 8, 2), 80);
    assert.equal(estimate1RM(60, 10, 0), 80);
  });

  it("brak zapasu traktuje jak zero, a nie jak brak danych", () => {
    assert.equal(estimate1RM(100, 3, null), 110);
  });

  it("nie liczy z pustych serii", () => {
    assert.equal(estimate1RM(null, 5, 2), null);
    assert.equal(estimate1RM(60, null, 2), null);
    assert.equal(estimate1RM(0, 5, 2), null);
  });
});

describe("wykrywanie rekordów", () => {
  const history = [set(60, 8, 2, "2026-07-01"), set(62.5, 6, 2, "2026-07-08")];

  it("nowy najwyższy ciężar jest rekordem i pamięta poprzedni", () => {
    const found = detectRecords(set(65, 5, 2, "2026-07-15"), history);
    const weight = found.find((r) => r.record_type === "max_weight");
    assert.equal(weight?.value, 65);
    assert.equal(weight?.previous_value, 62.5);
  });

  it("więcej powtórzeń na znanym ciężarze to osobny rekord", () => {
    const found = detectRecords(set(60, 10, 2, "2026-07-15"), history);
    const reps = found.find((r) => r.record_type === "max_reps_at_weight");
    assert.equal(reps?.value, 10);
    assert.equal(reps?.previous_value, 8);
  });

  it("powtórzenia na ciężarze, którego nigdy nie było, nie są rekordem powtórzeń", () => {
    const found = detectRecords(set(70, 3, 2, "2026-07-15"), history);
    assert.equal(found.some((r) => r.record_type === "max_reps_at_weight"), false);
  });

  it("gorsza seria nie tworzy żadnego rekordu", () => {
    assert.deepEqual(detectRecords(set(55, 5, 3, "2026-07-15"), history), []);
  });

  it("pierwsza seria w historii jest rekordem bez poprzedniej wartości", () => {
    const found = detectRecords(set(40, 8, 2, "2026-07-01"), []);
    assert.equal(found.find((r) => r.record_type === "max_weight")?.previous_value, null);
  });

  it("tonaż sesji liczy się jako rekord tylko gdy przebija poprzedni", () => {
    const better = detectRecords(set(60, 8, 2, "2026-07-15"), history, { current: 2000, best: 1800 });
    assert.equal(better.some((r) => r.record_type === "max_volume_session"), true);
    const worse = detectRecords(set(60, 8, 2, "2026-07-15"), history, { current: 1500, best: 1800 });
    assert.equal(worse.some((r) => r.record_type === "max_volume_session"), false);
  });

  it("puste serie nie generują rekordów", () => {
    assert.deepEqual(detectRecords({ ...set(0, 0, null, "2026-07-15"), weight_kg: null, reps: null }, history), []);
  });
});

describe("rekord jako zdanie faktu", () => {
  it("brzmi jak wpis w dzienniku, bez odznak i wykrzykników", () => {
    const sentence = recordSentence("Ławka", {
      record_type: "max_weight",
      value: 62.5,
      previous_value: 60,
      weight_kg: 62.5,
      reps: 5,
      rir: 2,
    });
    assert.equal(sentence, "Ławka: 62,5 kg - pierwszy raz na tym ciężarze. Poprzednio 60 kg.");
    assert.ok(!/[!]|gratul|rekord życiowy|brawo|🔥/i.test(sentence));
  });

  it("żaden typ rekordu nie chwali użytkownika", () => {
    const types = ["max_weight", "max_reps_at_weight", "est_1rm", "max_volume_session"] as const;
    for (const record_type of types) {
      const s = recordSentence("Ławka", {
        record_type,
        value: 100,
        previous_value: 90,
        weight_kg: 100,
        reps: 5,
        rir: 1,
      });
      assert.ok(!/[!]|gratul|świetn|super|brawo/i.test(s), s);
    }
  });
});

describe("tempo progresji", () => {
  const prs = [
    { record_type: "max_weight" as const, value: 60, achieved_on: "2026-06-01" as IsoDate },
    { record_type: "max_weight" as const, value: 62.5, achieved_on: "2026-07-13" as IsoDate },
  ];

  it("liczy tygodnie między dwiema ostatnimi podwyżkami", () => {
    assert.equal(weeksPerIncrement(prs), 6);
  });

  it("bez dwóch podwyżek nie zmyśla tempa", () => {
    assert.equal(weeksPerIncrement(prs.slice(0, 1)), null);
  });

  it("wyhamowanie opisuje jako normalne, nie jako awarię", () => {
    const text = incrementSentence(6, 3);
    assert.match(String(text), /normalne wyhamowanie, nie awaria/);
    assert.ok(!/[!]|słabo|gorzej/i.test(String(text)));
  });
});

describe("trafność nawyków", () => {
  const days: HabitDay[] = Array.from({ length: 28 }, (_, i) => ({
    log_date: `2026-07-${String(i + 1).padStart(2, "0")}` as IsoDate,
    training_done: i % 2 === 0,
    protein_hit: i < 24,
    creatine_taken: true,
    wake_on_target: null,
    weight_logged: true,
  }));

  it("podaje licznik i mianownik, nie procent", () => {
    const r = habitHitRate(days, "protein_hit", 28, "2026-07-28" as IsoDate);
    assert.equal(r.hit, 24);
    assert.equal(r.of, 28);
  });

  it("okno przycina historię", () => {
    const r = habitHitRate(days, "creatine_taken", 7, "2026-07-28" as IsoDate);
    assert.equal(r.of, 7);
    assert.ok(r.hit <= 7);
  });

  it("brak wpisu nie liczy się jako trafienie", () => {
    const r = habitHitRate(days, "wake_on_target", 28, "2026-07-28" as IsoDate);
    assert.equal(r.hit, 0);
  });
});

describe("log bólu", () => {
  const entries: PainEntry[] = [
    { logged_on: "2026-07-20" as IsoDate, body_part: "bark", severity: 2, resolved_on: null },
    { logged_on: "2026-07-27" as IsoDate, body_part: "bark", severity: 3, resolved_on: null },
    { logged_on: "2026-08-05" as IsoDate, body_part: "kolano", severity: 2, resolved_on: null },
  ];

  it("trzecie zgłoszenie tego samego miejsca w trzy tygodnie odsyła do fizjoterapeuty", () => {
    const withThird = [...entries, { logged_on: "2026-08-05" as IsoDate, body_part: "bark", severity: 2, resolved_on: null }];
    const signal = painSignal(withThird, "bark", "2026-08-05" as IsoDate);
    assert.match(String(signal), /fizjoterapeutę, nie na zmianę ćwiczenia/);
  });

  it("dwa zgłoszenia to jeszcze nie wzorzec", () => {
    assert.equal(painSignal(entries, "bark", "2026-08-05" as IsoDate), null);
  });

  it("silny ból daje sygnał od razu, przy pierwszym zgłoszeniu", () => {
    const signal = painSignal([], "kolano", "2026-08-05" as IsoDate, 5);
    assert.match(String(signal), /fizjoterapeuty albo lekarza/);
  });

  it("aplikacja nie diagnozuje i nie proponuje ćwiczeń korekcyjnych", () => {
    const all = [
      painSignal([...entries, entries[0], entries[1]], "bark", "2026-08-05" as IsoDate),
      painSignal([], "bark", "2026-08-05" as IsoDate, 4),
    ];
    for (const s of all) {
      assert.ok(!/rozciąg|wzmocnij|prawdopodobnie|to zapewne|zamiast tego rób/i.test(String(s)), String(s));
    }
  });

  it("nierozwiązane zgłoszenia z ostatnich dwóch tygodni są widoczne, starsze wypadają", () => {
    const active = activePain(entries, "2026-08-05" as IsoDate);
    assert.deepEqual(
      active.map((e) => e.logged_on),
      ["2026-07-27", "2026-08-05"],
      "zgłoszenie z 20.07 jest poza czternastodniowym oknem"
    );
  });

  it("rozwiązane zgłoszenia znikają z aktywnych, ale zostają w historii", () => {
    const closed = entries.map((e) => ({ ...e, resolved_on: "2026-08-06" as IsoDate }));
    assert.equal(activePain(closed, "2026-08-05" as IsoDate).length, 0);
    assert.equal(closed.length, 3);
  });
});

describe("porównanie z prognozą", () => {
  const points: ForecastPoint[] = [
    { month_index: 3, metric: "bench_working", value_realistic: 50, value_pessimist: 44, value_optimist: 56 },
  ];

  it("przed ośmioma tygodniami danych porównanie jest niedostępne", () => {
    const v = forecastVerdict(50, points, "bench_working", 3, FORECAST_MIN_WEEKS - 1);
    assert.equal(v.status, "too_early");
    assert.match(v.message, /Za mało danych/);
  });

  it("powyżej pasma mówi to bez gratulacji", () => {
    const v = forecastVerdict(60, points, "bench_working", 3, 12);
    assert.equal(v.status, "above");
    assert.equal(v.message, "Jesteś powyżej scenariusza realistycznego.");
  });

  it("w paśmie stwierdza fakt", () => {
    assert.equal(forecastVerdict(45, points, "bench_working", 3, 12).status, "in_band");
  });

  it("poniżej pasma pokazuje frekwencję zamiast oceny", () => {
    const v = forecastVerdict(38, points, "bench_working", 3, 12, { done: 9, planned: 16, expected: 14 });
    assert.equal(v.status, "below");
    assert.match(v.message, /Frekwencja w tym okresie: 9 \/ 16 sesji/);
    assert.match(v.message, /Prognoza zakładała 14 \/ 16/);
    assert.ok(!/niestety|słabo|musisz|powinieneś/i.test(v.message), v.message);
  });

  it("dołek jest wyjaśniony, a nie ukryty", () => {
    assert.match(DIP_EXPLANATION, /Większość ludzi rezygnuje właśnie tutaj/);
  });

  it("miesiąc programu liczony jest od daty startu", () => {
    assert.equal(monthIndexOf("2026-01-01" as IsoDate, "2026-01-15" as IsoDate), 0);
    assert.equal(monthIndexOf("2026-01-01" as IsoDate, "2026-04-15" as IsoDate), 3);
    assert.equal(weeksOfData("2026-01-01" as IsoDate, "2026-03-01" as IsoDate), 8);
  });
});

describe("migawka tygodnia", () => {
  const base = {
    weekStart: "2026-08-03" as IsoDate,
    programWeek: 5,
    muscleOf: (id: string) => (id === "bench" ? "klatka" : "plecy"),
    proteinTarget: 150,
    wakeSd: 24,
    prsCount: 2,
    emergencyMode: false,
  };

  it("zbiera tydzień w jeden wiersz", () => {
    const snap = buildSnapshot({
      ...base,
      sessions: [
        { started_at: "2026-08-03T17:00:00Z", status: "full" },
        { started_at: "2026-08-05T17:00:00Z", status: "minimal" },
        { started_at: "2026-07-30T17:00:00Z", status: "full" }, // poprzedni tydzień
      ],
      sets: [
        { logged_at: "2026-08-03T17:10:00Z", weight_kg: 60, reps: 8, exercise_id: "bench" },
        { logged_at: "2026-08-03T17:20:00Z", weight_kg: 60, reps: 8, exercise_id: "bench" },
        { logged_at: "2026-08-05T17:10:00Z", weight_kg: 50, reps: 10, exercise_id: "row" },
      ],
      logs: [
        { log_date: "2026-08-03" as IsoDate, weight_kg: 78, protein_g: 150, calories_kcal: 2600, wake_time: "06:30", sleep_quality: 4, creatine_taken: true },
        { log_date: "2026-08-04" as IsoDate, weight_kg: 77.8, protein_g: 120, calories_kcal: 2500, wake_time: "06:40", sleep_quality: 3, creatine_taken: true },
      ],
    });

    assert.equal(snap.sessions_done, 2);
    assert.equal(snap.sessions_minimal, 1);
    assert.equal(snap.total_tonnage_kg, 60 * 8 * 2 + 50 * 10);
    assert.deepEqual(snap.sets_by_muscle, { klatka: 2, plecy: 1 });
    assert.equal(snap.protein_hit_days, 1); // 150 tak, 120 poniżej 90% celu
    assert.equal(snap.creatine_days, 2);
    assert.equal(snap.weight_avg7_kg, 77.9);
    assert.equal(snap.wake_time_sd_min, 24);
  });

  it("tryb awaryjny zmienia liczbę zaplanowanych sesji, nie ocenia wykonania", () => {
    const snap = buildSnapshot({ ...base, emergencyMode: true, sessions: [], sets: [], logs: [] });
    assert.equal(snap.sessions_planned, 2);
    assert.equal(snap.sessions_done, 0);
  });

  it("migawka nie zawiera żadnej liczby zbiorczej ani oceny", () => {
    const snap = buildSnapshot({ ...base, sessions: [], sets: [], logs: [] });
    const keys = Object.keys(snap);
    assert.ok(!keys.some((k) => /score|wynik|ocena|streak|points/i.test(k)), keys.join(", "));
  });
});
