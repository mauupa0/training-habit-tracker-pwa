// Testy modułu kalorycznego. Połowa z nich to próby obejścia limitów R7 -
// jeśli którakolwiek przejdzie, moduł jest niebezpieczny, a nie „elastyczny”.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CALORIE_RULES,
  calorieGoal,
  canRevise,
  clampDeficit,
  estimateMaintenance,
  measureProgress,
  reviseGoal,
  type CalorieLog,
} from "../calories.ts";
import { shiftIso } from "../measure.ts";
import type { IsoDate } from "@/types";

/** Ciąg dni z kaloriami i wagą, od najstarszego. */
function days(count: number, kcal: number, weightFrom: number, weightTo: number): CalorieLog[] {
  const step = count > 1 ? (weightTo - weightFrom) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => ({
    log_date: shiftIso("2026-08-14" as IsoDate, -(count - 1 - i)),
    calories_kcal: kcal,
    weight_kg: Math.round((weightFrom + step * i) * 100) / 100,
  }));
}

describe("etap pomiaru", () => {
  it("liczy tylko dni z kompletem danych", () => {
    const logs = days(10, 2500, 78, 78);
    logs[0].calories_kcal = null;
    logs[1].weight_kg = null;
    const p = measureProgress(logs);
    assert.equal(p.days, 8);
    assert.equal(p.needed, 14);
    assert.equal(p.ready, false);
  });

  it("po czternastu pełnych dniach etap się kończy", () => {
    assert.equal(measureProgress(days(14, 2500, 78, 78)).ready, true);
  });
});

describe("zapotrzebowanie liczone z danych, nie ze wzoru", () => {
  it("waga stojąca w miejscu daje zapotrzebowanie równe spożyciu", () => {
    assert.equal(estimateMaintenance(days(14, 2600, 78, 78)), 2600);
  });

  it("przyrost wagi znaczy, że spożycie było powyżej zapotrzebowania", () => {
    // +0,5 kg w 14 dni ≈ 3850 kcal nadwyżki, czyli ~275 kcal dziennie
    const value = estimateMaintenance(days(14, 3000, 78, 78.5));
    assert.ok(value !== null && value < 3000, `zapotrzebowanie ${value} powinno być niższe od spożycia`);
    assert.ok(Math.abs((value as number) - 2725) <= 60, `spodziewane ~2725, wyszło ${value}`);
  });

  it("spadek wagi znaczy, że spożycie było poniżej zapotrzebowania", () => {
    const value = estimateMaintenance(days(14, 2200, 79, 78.5));
    assert.ok(value !== null && value > 2200);
  });

  it("bez kompletu czternastu dni nie zmyśla wyniku", () => {
    assert.equal(estimateMaintenance(days(13, 2500, 78, 78)), null);
    assert.equal(estimateMaintenance([]), null);
  });

  it("dni bez wagi nie liczą się do okna (tryb bez ważenia)", () => {
    const logs = days(14, 2500, 78, 78).map((l) => ({ ...l, weight_kg: null }));
    assert.equal(estimateMaintenance(logs), null);
  });
});

describe("cel i twarde limity R7", () => {
  it("rekompozycja to umiarkowany deficyt, budowa masy umiarkowana nadwyżka", () => {
    assert.equal(calorieGoal(2800, "recomp")?.kcal, 2800 - CALORIE_RULES.RECOMP_DEFICIT);
    assert.equal(calorieGoal(2800, "bulk")?.kcal, 2800 + CALORIE_RULES.BULK_SURPLUS);
  });

  it("deficytu nie da się rozpędzić powyżej 500 kcal", () => {
    assert.equal(clampDeficit(900), CALORIE_RULES.MAX_DEFICIT);
    assert.equal(clampDeficit(Infinity), CALORIE_RULES.RECOMP_DEFICIT);
    const goal = calorieGoal(3000, "recomp", 1200);
    assert.equal(goal?.deficit, CALORIE_RULES.MAX_DEFICIT);
    assert.equal(goal?.kcal, 2500);
  });

  it("deficytu nie da się też ustawić śladowego - to nie jest tryb pozorny", () => {
    assert.equal(clampDeficit(50), CALORIE_RULES.MIN_DEFICIT);
  });

  it("cel poniżej twardej podłogi jest odrzucany bez furtki", () => {
    const goal = calorieGoal(1800, "recomp", 500);
    assert.equal(goal?.kcal, null);
    assert.match(String(goal?.rejected), /dietetykiem albo lekarzem/);
  });

  it("odrzucenie nie zależy od tego, jak użytkownik poda deficyt", () => {
    for (const deficit of [500, 900, 2000, Number.MAX_SAFE_INTEGER]) {
      const goal = calorieGoal(1700, "recomp", deficit);
      assert.equal(goal?.kcal, null, `deficyt ${deficit} przepuścił cel poniżej podłogi`);
    }
  });

  it("bez zapotrzebowania nie ma celu", () => {
    assert.equal(calorieGoal(null, "recomp"), null);
    assert.equal(calorieGoal(0, "recomp"), null);
  });
});

describe("rewizja celu", () => {
  it("nie częściej niż co czternaście dni", () => {
    assert.equal(canRevise(null, "2026-08-14" as IsoDate), true);
    assert.equal(canRevise("2026-08-01" as IsoDate, "2026-08-14" as IsoDate), false);
    assert.equal(canRevise("2026-08-01" as IsoDate, "2026-08-15" as IsoDate), true);
  });

  it("krok to najwyżej 200 kcal", () => {
    const r = reviseGoal(2900, 0, "recomp", 3000);
    assert.equal(r.changed, true);
    assert.equal(r.kcal, 2700);
  });

  it("krok jest przycinany do limitu deficytu, a nie odrzucany", () => {
    // cel 2450 przy zapotrzebowaniu 2800 to deficyt 350; pełne 200 dałoby 550, czyli ponad limit
    const r = reviseGoal(2450, 0, "recomp", 2800);
    assert.equal(r.changed, true);
    assert.equal(r.kcal, 2300, "rewizja powinna zejść dokładnie do granicy deficytu 500");
  });

  it("ruszająca się waga nie jest powodem do zmiany", () => {
    const r = reviseGoal(2450, -0.6, "recomp", 2800);
    assert.equal(r.changed, false);
    assert.equal(r.kcal, 2450);
  });

  it("rewizja nie przebije maksymalnego deficytu", () => {
    const maxed = reviseGoal(2300, 0, "recomp", 2800); // deficyt już 500
    assert.equal(maxed.changed, false);
    assert.match(maxed.reason, /Głębszego deficytu/);
  });

  it("rewizja nie przebije twardej podłogi", () => {
    // zapotrzebowanie 1900 → limit deficytu pozwoliłby na 1400, ale podłoga trzyma na 1500
    const floor = reviseGoal(CALORIE_RULES.ABSOLUTE_FLOOR, 0, "recomp", 1900);
    assert.equal(floor.changed, false);
    assert.match(floor.reason, /sen/);
    assert.equal(reviseGoal(1600, 0, "recomp", 1900).kcal, CALORIE_RULES.ABSOLUTE_FLOOR);
  });

  it("przy budowie masy rewizja idzie w górę", () => {
    const r = reviseGoal(3050, 0, "bulk", 2800);
    assert.equal(r.kcal, 3250);
    assert.equal(r.changed, true);
  });

  it("komunikaty rewizji nie oceniają użytkownika", () => {
    for (const r of [
      reviseGoal(2450, 0, "recomp", 2800),
      reviseGoal(2450, -0.6, "recomp", 2800),
      reviseGoal(1600, 0, "recomp", 2800),
    ]) {
      assert.ok(!/[!]|za mało|za dużo|niestety|porażk/i.test(r.reason), r.reason);
    }
  });
});
