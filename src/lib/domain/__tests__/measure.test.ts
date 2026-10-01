// Testy modułu pomiaru. Pilnują reguł produktowych, nie implementacji:
// R4 (liczba główna to średnia), Morton 2018 (widełki białka), spójność snu zamiast długości.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CIRCUMFERENCE_LABEL,
  PROTEIN_PER_KG,
  circumferenceDelta,
  clampProteinPerKg,
  e1rm,
  formatWakeSd,
  isDue,
  proteinPortions,
  proteinTarget,
  setsPerMuscle,
  shiftIso,
  volumeGoal,
  volumeVerdict,
  wakeTimeSd,
  weeklyTonnage,
  weightDelta,
  weightSummary,
  type WeightLog,
} from "../measure.ts";
import type { IsoDate } from "@/types";

/** Ciąg dziennych ważeń kończący się dnia `to`, od najstarszego. */
function daily(to: IsoDate, values: Array<number | null>): WeightLog[] {
  return values.map((weight_kg, i) => ({
    log_date: shiftIso(to, -(values.length - 1 - i)),
    weight_kg,
  }));
}

describe("waga (R4)", () => {
  it("nie pokazuje średniej, dopóki pomiarów jest mniej niż siedem", () => {
    const s = weightSummary(daily("2026-08-10" as IsoDate, [78, 77.8, 78.4, 78.1, 77.9, 78.2]), "2026-08-10" as IsoDate);
    assert.equal(s.average, null);
    assert.equal(s.total, 6);
    assert.equal(s.missing, 1);
  });

  it("dzisiejszy pomiar jest oddzielony od średniej - nigdy nie zastępuje liczby głównej", () => {
    const s = weightSummary(daily("2026-08-10" as IsoDate, [78, 78, 78, 78, 78, 78, 85]), "2026-08-10" as IsoDate);
    assert.equal(s.today, 85);
    assert.equal(s.average, 79); // średnia z okna, nie skok z dzisiaj
  });

  it("uśrednia tylko okno, nie całą historię", () => {
    // dziesięć dni: pierwsze trzy po 90 kg wypadają poza siedmiodniowe okno
    const s = weightSummary(daily("2026-08-10" as IsoDate, [90, 90, 90, 80, 80, 80, 80, 80, 80, 80]), "2026-08-10" as IsoDate);
    assert.equal(s.inWindow, 7);
    assert.equal(s.average, 80);
  });

  it("dni bez ważenia nie liczą się jako pomiar", () => {
    const s = weightSummary(daily("2026-08-10" as IsoDate, [78, null, 78, null, 78, null, 78]), "2026-08-10" as IsoDate);
    assert.equal(s.total, 4);
    assert.equal(s.average, null);
  });

  it("przy ważeniu tygodniowym cztery pomiary w cztery tygodnie wystarczą", () => {
    const logs: WeightLog[] = [0, 7, 14, 21].map((back) => ({
      log_date: shiftIso("2026-08-10" as IsoDate, -back),
      weight_kg: 78,
    }));
    assert.equal(weightSummary(logs, "2026-08-10" as IsoDate, "weekly").average, 78);
    // to samo w trybie dziennym nie wystarcza - okno tygodniowe miałoby jeden pomiar
    assert.equal(weightSummary(logs, "2026-08-10" as IsoDate, "daily").average, null);
  });

  it("zmiana liczona jest ze średnich, nie z dwóch poranków", () => {
    const values = Array.from({ length: 21 }, (_, i) => (i < 7 ? 79 : i < 14 ? 78.5 : 78));
    const logs = daily("2026-08-10" as IsoDate, values);
    assert.equal(weightDelta(logs, "2026-08-10" as IsoDate), -1);
  });

  it("bez kompletu danych nie zmyśla zmiany", () => {
    assert.equal(weightDelta(daily("2026-08-10" as IsoDate, [78, 78, 78]), "2026-08-10" as IsoDate), null);
  });
});

describe("białko (Morton 2018)", () => {
  it("cel to 1,8 g/kg średniej, zaokrąglone do dziesiątek", () => {
    assert.equal(proteinTarget(78), 140);
    assert.equal(proteinTarget(70), 130);
  });

  it("bez średniej nie ma celu - nie liczymy go z dziennej wagi", () => {
    assert.equal(proteinTarget(null), null);
  });

  it("trzyma się widełek z metaanalizy", () => {
    assert.equal(clampProteinPerKg(1.2), PROTEIN_PER_KG.min);
    assert.equal(clampProteinPerKg(3), PROTEIN_PER_KG.max);
    assert.equal(clampProteinPerKg(2), 2);
    assert.equal(proteinTarget(78, 9), proteinTarget(78, PROTEIN_PER_KG.max));
  });

  it("rozkłada cel na porcje po około 40 g", () => {
    assert.equal(proteinPortions(150), 4);
    assert.equal(proteinPortions(null), null);
  });
});

describe("sen - spójność, nie długość", () => {
  it("stała godzina pobudki to zerowy rozrzut", () => {
    assert.equal(wakeTimeSd([{ wake_time: "06:30" }, { wake_time: "06:30" }, { wake_time: "06:30" }]), 0);
  });

  it("pobudki po obu stronach północy są blisko siebie, a nie o dobę od siebie", () => {
    // po późnym powrocie: 23:50 i 00:30 dzieli 40 minut
    const sd = wakeTimeSd([{ wake_time: "23:50" }, { wake_time: "00:30" }]);
    assert.ok(sd !== null && sd <= 25, `rozrzut ${sd} min - zawijanie doby liczone naiwnie`);
  });

  it("rozrzut rośnie razem z nieregularnością", () => {
    const stable = wakeTimeSd([{ wake_time: "06:00" }, { wake_time: "06:20" }, { wake_time: "06:10" }]);
    const chaotic = wakeTimeSd([{ wake_time: "05:00" }, { wake_time: "09:00" }, { wake_time: "07:00" }]);
    assert.ok(stable !== null && chaotic !== null && chaotic > stable);
  });

  it("jeden pomiar to za mało na rozrzut", () => {
    assert.equal(wakeTimeSd([{ wake_time: "06:30" }]), null);
    assert.equal(formatWakeSd(null), "Zbieram dane o pobudkach.");
  });

  it("opis nie ocenia i podaje minuty", () => {
    assert.equal(formatWakeSd(42), "Odchylenie standardowe godziny pobudki: 42 min");
    assert.equal(formatWakeSd(95), "Odchylenie standardowe godziny pobudki: 1 h 35 min");
  });
});

describe("progresja i objętość", () => {
  it("szacowany ciężar maksymalny rośnie z powtórzeniami", () => {
    assert.equal(e1rm(100, 1), 100);
    assert.equal(e1rm(100, 10), 133.3);
  });

  it("nie przelicza serii, przy których wzór przestaje być wiarygodny", () => {
    assert.equal(e1rm(60, 15), null);
    assert.equal(e1rm(null, 5), null);
    assert.equal(e1rm(60, null), null);
  });

  it("tonaż sumuje ciężar razy powtórzenia w tygodniach od poniedziałku", () => {
    const sets = [
      { logged_at: "2026-08-10T09:00:00Z", weight_kg: 100, reps: 5 }, // poniedziałek
      { logged_at: "2026-08-12T09:00:00Z", weight_kg: 100, reps: 5 }, // środa, ten sam tydzień
      { logged_at: "2026-08-03T09:00:00Z", weight_kg: 50, reps: 10 }, // tydzień wcześniej
    ];
    const out = weeklyTonnage(sets, "2026-08-10" as IsoDate, 2);
    assert.equal(out.length, 2);
    assert.equal(out[0].kg, 500);
    assert.equal(out[1].kg, 1000);
  });

  it("serie liczone są na partię w oknie tygodnia", () => {
    const muscles: Record<string, string> = { a: "klatka", b: "plecy" };
    const sets = [
      { exercise_id: "a", logged_at: "2026-08-10T09:00:00Z" },
      { exercise_id: "a", logged_at: "2026-08-09T09:00:00Z" },
      { exercise_id: "b", logged_at: "2026-08-08T09:00:00Z" },
      { exercise_id: "a", logged_at: "2026-07-01T09:00:00Z" }, // poza oknem
    ];
    const out = setsPerMuscle(sets, (id) => muscles[id], "2026-08-10" as IsoDate);
    assert.deepEqual(out, { klatka: 2, plecy: 1 });
  });

  it("werdykt objętości opisuje położenie względem zakresu, bez oceny", () => {
    assert.equal(volumeVerdict(8), "poniżej");
    assert.equal(volumeVerdict(14), "w zakresie");
    assert.equal(volumeVerdict(22), "powyżej");
  });

  it("partia z własnym celem w planie liczy się wobec planu, nie wobec 12-18", () => {
    // biceps ma w planie 7 serii - ocena wobec 12 pokazywałaby „poniżej” przy zrealizowanym planie
    assert.equal(volumeGoal("biceps"), 7);
    assert.equal(volumeVerdict(7, "biceps"), "zgodnie z planem");
    assert.equal(volumeVerdict(6, "triceps"), "zgodnie z planem");
    assert.equal(volumeVerdict(16, "czworogłowe"), "zgodnie z planem");
  });

  it("odchylenie większe niż dwie serie widać jako poniżej albo powyżej planu", () => {
    assert.equal(volumeVerdict(3, "biceps"), "poniżej");
    assert.equal(volumeVerdict(12, "biceps"), "powyżej");
  });

  it("partia bez celu w planie wraca do zakresu roboczego", () => {
    assert.equal(volumeGoal("pośladki"), null);
    assert.equal(volumeVerdict(14, "pośladki"), "w zakresie");
  });
});

describe("obwody i zdjęcia", () => {
  it("przypomnienie wraca dopiero po pełnym odstępie", () => {
    assert.equal(isDue("2026-08-01" as IsoDate, "2026-08-14" as IsoDate, 14), false);
    assert.equal(isDue("2026-08-01" as IsoDate, "2026-08-15" as IsoDate, 14), true);
  });

  it("bez żadnego pomiaru czeka tydzień od startu programu", () => {
    assert.equal(isDue(null, "2026-08-05" as IsoDate, 14, "2026-08-01" as IsoDate), false);
    assert.equal(isDue(null, "2026-08-08" as IsoDate, 14, "2026-08-01" as IsoDate), true);
  });

  it("delta obwodów pokazuje różnicę tylko tam, gdzie jest co porównać", () => {
    const d = circumferenceDelta(
      { arm_cm: 36.5, chest_cm: 100, waist_cm: 80, thigh_cm: null },
      { arm_cm: 36, chest_cm: 100, waist_cm: null, thigh_cm: 56 }
    );
    assert.equal(d.arm_cm, 0.5);
    assert.equal(d.chest_cm, 0);
    assert.equal(d.waist_cm, null);
    assert.equal(d.thigh_cm, null);
  });

  it("etykiety obwodów są po polsku", () => {
    assert.equal(CIRCUMFERENCE_LABEL.arm_cm, "Ramię napięte");
  });
});
