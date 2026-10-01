// Uruchomienie: pnpm test  (node --test, typy zdejmuje sam Node)
//
// Testy pilnują reguł, nie implementacji: progresja ma NIE dokładać, gdy
// warunek nie jest w pełni spełniony, a tryb minimum ma liczyć się jak pełna sesja.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { adherence28, missedInARow, missedSignal } from "../adherence.ts";
import { checkFirstSet, deloadSets } from "../autoregulation.ts";
import { biasMessage, rirBias, shouldOfferCalibration } from "../calibration.ts";
import { maxRir, nextWeight, type SetLog } from "../progression.ts";
import { catchUpTemplate, nextTrainingDay, plannedFor } from "../schedule.ts";

const UPPER = { rep_min: 5, rep_max: 8, target_rir: "2", increment_kg: 2.5 };
const set = (reps: number, rir: number | null = 2, weight_kg = 60): SetLog => ({
  weight_kg,
  reps,
  rir,
});

describe("progresja", () => {
  it("bez historii nie proponuje ciężaru, tylko dolną granicę powtórzeń", () => {
    const s = nextWeight([], UPPER);
    assert.equal(s.weight_kg, 0);
    assert.equal(s.target_reps, 5);
    assert.equal(s.is_increase, false);
  });

  it("dokłada increment, gdy wszystkie serie trafiły w górną granicę przy RIR ≤ celu", () => {
    const s = nextWeight([set(8), set(8), set(8), set(8)], UPPER);
    assert.equal(s.weight_kg, 62.5);
    assert.equal(s.is_increase, true);
    assert.equal(s.target_reps, 5);
    assert.match(s.reason_pl, /62,5 kg/); // liczba po polsku, z przecinkiem
  });

  it("NIE dokłada, gdy jedna seria ma RIR 3 przy celu 2 (test graniczny z promptu)", () => {
    const s = nextWeight([set(8), set(8), set(8), set(8, 3)], UPPER);
    assert.equal(s.weight_kg, 60);
    assert.equal(s.is_increase, false);
    assert.equal(s.target_reps, null);
  });

  it("NIE dokłada, gdy jedna seria nie dobiła do górnej granicy", () => {
    const s = nextWeight([set(8), set(8), set(8), set(7)], UPPER);
    assert.equal(s.is_increase, false);
  });

  it("brak RIR traktuje jak warunek spełniony", () => {
    const s = nextWeight([set(8, null), set(8, null), set(8, null), set(8, null)], UPPER);
    assert.equal(s.is_increase, true);
  });

  it("czyta przedziały RIR", () => {
    assert.equal(maxRir("2"), 2);
    assert.equal(maxRir("1-2"), 2);
    assert.equal(maxRir("0-1"), 1);
    assert.equal(maxRir("2-3"), 3);
    assert.equal(maxRir(null), null);
  });

  it("przy celu 2-3 seria z RIR 3 nadal pozwala dołożyć", () => {
    const s = nextWeight([set(8, 3), set(8, 3)], { ...UPPER, target_rir: "2-3" });
    assert.equal(s.is_increase, true);
  });
});

describe("autoregulacja", () => {
  it("spadek o 2 powtórzenia na tym samym ciężarze wstrzymuje progresję", () => {
    const v = checkFirstSet(set(6), set(8));
    assert.equal(v.flag, "hold");
    assert.match(v.message_pl, /Dziś nie dokładamy/);
  });

  it("spadek o 1 powtórzenie nie robi nic", () => {
    assert.equal(checkFirstSet(set(7), set(8)).flag, "none");
  });

  it("inny ciężar = brak porównania", () => {
    assert.equal(checkFirstSet(set(6, 2, 65), set(8, 2, 60)).flag, "none");
  });

  it("drugi spadek z rzędu proponuje deload", () => {
    const v = checkFirstSet(set(6), set(8), true);
    assert.equal(v.flag, "deload_suggested");
  });

  it("deload połowi serie z zaokrągleniem w górę", () => {
    assert.equal(deloadSets(4), 2);
    assert.equal(deloadSets(3), 2);
  });
});

describe("kalibracja RIR", () => {
  const iso = { is_compound: false, slug: "seated_leg_curl" };

  it("nie proponuje przy przysiadzie ani martwym ciągu", () => {
    assert.equal(shouldOfferCalibration(null, { is_compound: true, slug: "back_squat" }), false);
    assert.equal(shouldOfferCalibration(null, { is_compound: false, slug: "deadlift" }), false);
  });

  it("proponuje na izolacji, gdy testu jeszcze nie było", () => {
    assert.equal(shouldOfferCalibration(null, iso), true);
  });

  it("nie proponuje częściej niż co 14 dni", () => {
    const now = new Date("2026-08-10T10:00:00Z");
    const sixDays = new Date("2026-08-04T10:00:00Z");
    const fifteenDays = new Date("2026-07-26T10:00:00Z");
    assert.equal(shouldOfferCalibration(sixDays, iso, now), false);
    assert.equal(shouldOfferCalibration(fifteenDays, iso, now), true);
  });

  it("liczy błąd dopiero z trzech testów", () => {
    assert.equal(rirBias([{ predicted_reps: 2, reps: 5 }]), null);
    assert.equal(
      rirBias([
        { predicted_reps: 2, reps: 5 },
        { predicted_reps: 2, reps: 6 },
        { predicted_reps: 3, reps: 6 },
      ]),
      3.3
    );
  });

  it("komunikat o błędzie mówi, ile realnie zostaje w zapasie", () => {
    assert.match(biasMessage(3), /\+3 powtórzeń/);
    assert.match(biasMessage(3), /realnie masz około 5/);
  });
});

describe("statystyka 28-dniowa", () => {
  const now = new Date("2026-08-10T20:00:00");
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it("tryb minimum liczy się jak pełna sesja (R2)", () => {
    const a = adherence28(
      [
        { started_at: daysAgo(1), status: "full" },
        { started_at: daysAgo(2), status: "minimal" },
        { started_at: daysAgo(3), status: "abandoned" },
      ],
      false,
      now
    );
    assert.equal(a.done, 2);
    assert.equal(a.target, 16);
  });

  it("tryb awaryjny obniża cel do 8", () => {
    assert.equal(adherence28([], true, now).target, 8);
  });

  it("sesja starsza niż 28 dni nie liczy się", () => {
    assert.equal(adherence28([{ started_at: daysAgo(29), status: "full" }], false, now).done, 0);
  });

  it("pomija dni wolne przy liczeniu pominięć", () => {
    // 10.08.2026 to poniedziałek; wstecz: nd 9, sb 8 (wolne), pt 7 = zaplanowany
    const missed = missedInARow([], new Date("2026-08-10T20:00:00"));
    assert.ok(missed >= 1);
  });

  it("sygnał pojawia się dopiero przy dwóch pominięciach (R1)", () => {
    assert.equal(missedSignal(1), null);
    assert.match(missedSignal(2) ?? "", /bez wyjątku/);
  });

  it("nie liczy dni sprzed startu programu", () => {
    // konto założone dziś: wczoraj i przedwczoraj nie są pominięciami
    const today = new Date("2026-08-10T20:00:00");
    assert.equal(missedInARow([], today, "2026-08-10"), 0);
    assert.equal(adherence28([], false, today, "2026-08-10").missedInARow, 0);
    // konto sprzed tygodnia bez ani jednej sesji - pominięcia liczone normalnie
    assert.ok(missedInARow([], today, "2026-08-01") >= 2);
  });
});

describe("rozkład tygodnia", () => {
  it("środa jest wolna, poniedziałek to Upper A", () => {
    assert.equal(plannedFor(new Date("2026-08-10T10:00:00")), "upper_a"); // poniedziałek
    assert.equal(plannedFor(new Date("2026-08-12T10:00:00")), null); // środa
  });

  it("po środzie następny trening jest w czwartek", () => {
    const next = nextTrainingDay(new Date("2026-08-12T10:00:00"));
    assert.equal(next.key, "upper_b");
    assert.equal(next.inDays, 1);
  });

  it("nadrabianie proponuje pierwszy szablon, którego nie było w tym tygodniu", () => {
    assert.equal(catchUpTemplate(["upper_a", "lower_a"]), "upper_b");
    assert.equal(catchUpTemplate([]), "upper_a");
  });
});
