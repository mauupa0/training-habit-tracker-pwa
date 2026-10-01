import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activeModules,
  isUnlocked,
  lockedMessage,
  shouldAdvanceWeek,
  shouldAskAboutEmergency,
  weekAdvanceMessage,
  weekHoldMessage,
} from "../program.ts";

const full = { status: "full" } as const;
const minimal = { status: "minimal" } as const;
const abandoned = { status: "abandoned" } as const;

describe("odblokowywanie modułów (R5)", () => {
  it("w tygodniu 1 jest wyłącznie trening", () => {
    assert.deepEqual(activeModules(1, [], false), ["training"]);
    assert.equal(isUnlocked("protein", 1, []), false);
  });

  it("białko wchodzi w tygodniu 3, sen i kreatyna w 5", () => {
    assert.equal(isUnlocked("protein", 3, []), true);
    assert.equal(isUnlocked("sleep", 3, []), false);
    assert.equal(isUnlocked("sleep", 5, []), true);
    assert.equal(isUnlocked("creatine", 5, []), true);
  });

  it("ręczne odblokowanie działa przed terminem", () => {
    assert.equal(isUnlocked("protein", 1, ["protein"]), true);
  });

  it("komunikat blokady mówi kiedy, bez zachęt", () => {
    assert.equal(lockedMessage("protein"), "Odblokowuje się w tygodniu 3. Teraz skup się na treningu.");
    assert.ok(!/spróbuj|niestety|!/i.test(lockedMessage("steps")));
  });

  it("tryb awaryjny zostawia trening i białko, chowa kalorie i kroki", () => {
    const active = activeModules(11, [], true);
    assert.deepEqual(active.sort(), ["protein", "training"]);
    assert.equal(isUnlocked("calories_goal", 11, [], true), false);
    assert.equal(isUnlocked("steps", 11, [], true), false);
  });
});

describe("awans tygodnia", () => {
  it("3 z 4 sesji awansuje", () => {
    assert.equal(shouldAdvanceWeek([full, full, minimal]), true);
  });

  it("2 z 4 zostawia w tym samym tygodniu", () => {
    assert.equal(shouldAdvanceWeek([full, minimal, abandoned]), false);
  });

  it("minimum liczy się do awansu tak samo jak pełna sesja (R2)", () => {
    assert.equal(shouldAdvanceWeek([minimal, minimal, minimal]), true);
  });

  it("komunikat awansu zapowiada nowy moduł, komunikat braku awansu jest jednozdaniowy", () => {
    assert.equal(weekAdvanceMessage(3), "Tydzień 2 zamknięty. Od jutra dochodzi białko.");
    assert.equal(weekHoldMessage(3), "Zostajemy w tygodniu 3.");
    assert.ok(!/!|niestety|spróbuj|porażk/i.test(weekHoldMessage(3)));
  });

  it("tydzień bez nowego modułu nie obiecuje niczego", () => {
    assert.equal(weekAdvanceMessage(2), "Tydzień 1 zamknięty.");
  });
});

describe("tryb awaryjny", () => {
  it("pyta o powrót dopiero po 4 tygodniach", () => {
    const now = new Date("2026-09-10T10:00:00");
    assert.equal(shouldAskAboutEmergency("2026-08-20", null, now), false);
    assert.equal(shouldAskAboutEmergency("2026-08-10", null, now), true);
  });

  it("po odmowie milczy przez kolejne 4 tygodnie", () => {
    const now = new Date("2026-09-10T10:00:00");
    assert.equal(shouldAskAboutEmergency("2026-07-01", "2026-09-01", now), false);
  });
});
