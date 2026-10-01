"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetOption } from "@/components/ui/Sheet";
import { SourceChip } from "@/components/ui/SourceChip";
import { todayIso } from "@/lib/day";
import { dailyLogsSince } from "@/lib/db/queries";
import { saveDailyLog, saveProgramState } from "@/lib/db/repo";
import {
  CALORIE_RULES,
  calorieGoal,
  canRevise,
  estimateMaintenance,
  measureProgress,
  reviseGoal,
  type GoalMode,
} from "@/lib/domain/calories";
import { shiftIso, weightSummary } from "@/lib/domain/measure";
import type { LocalDailyLog, LocalProgramState } from "@/types";

/**
 * Szybkie kwoty zamiast bazy produktów. Kafelki białka mogą podawać konkretne
 * produkty, bo tam wartość jest stała; kaloryczność posiłku zależy od wykonania,
 * więc udawanie precyzji („obiad = 800 kcal") byłoby zmyślaniem danych.
 */
const QUICK = [100, 250, 500];

/**
 * Kalorie. Dwa etapy: najpierw sam pomiar bez celu, dopiero potem cel policzony
 * z tego, jak waga zareagowała na zapisane spożycie. Aplikacja nie liczy
 * zapotrzebowania ze wzoru - patrz karta wiedzy i Lichtman 1992.
 */
export function CaloriesModule({
  state,
  onStateChange,
  goalUnlocked,
}: {
  state: LocalProgramState;
  onStateChange: (next: LocalProgramState) => void;
  /** czy odblokowany jest już etap celu (tydzień 9), czy dopiero pomiar (tydzień 7) */
  goalUnlocked: boolean;
}) {
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);
  const [manual, setManual] = useState("");
  const [knowledge, setKnowledge] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = todayIso();
  const load = useCallback(async () => setLogs(await dailyLogsSince(60)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const eaten = logs.find((l) => l.log_date === today)?.calories_kcal ?? 0;
  const progress = measureProgress(logs);
  const noWeighing = state.weighing_frequency === "never";

  // Zapotrzebowanie liczymy raz, gdy uzbiera się komplet dni i etap celu jest odblokowany.
  useEffect(() => {
    if (!goalUnlocked || noWeighing || state.maintenance_kcal !== null) return;
    const estimate = estimateMaintenance(logs);
    if (estimate === null) return;
    void (async () => {
      const goal = calorieGoal(estimate, state.goal_mode ?? "recomp");
      onStateChange(
        await saveProgramState({
          maintenance_kcal: estimate,
          calorie_goal_kcal: goal && goal.kcal !== null ? goal.kcal : null,
          goal_mode: state.goal_mode ?? "recomp",
          goal_revised_on: today,
        })
      );
    })();
  }, [goalUnlocked, noWeighing, logs, state.maintenance_kcal, state.goal_mode, onStateChange, today]);

  async function add(kcal: number) {
    await saveDailyLog(today, { calories_kcal: Math.max(0, eaten + kcal) });
    await load();
  }

  async function addManual() {
    const value = Number(manual.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    setManual("");
    await add(Math.round(value));
  }

  async function setMode(mode: GoalMode) {
    const goal = calorieGoal(state.maintenance_kcal, mode);
    if (goal && goal.kcal === null) {
      setNotice(goal.rejected);
      return;
    }
    setNotice(null);
    onStateChange(
      await saveProgramState({
        goal_mode: mode,
        calorie_goal_kcal: goal?.kcal ?? null,
        goal_revised_on: today,
      })
    );
  }

  async function revise() {
    if (state.calorie_goal_kcal === null) return;
    const summary = weightSummary(logs, today, state.weighing_frequency === "weekly" ? "weekly" : "daily");
    const before = weightSummary(
      logs,
      shiftIso(today, -CALORIE_RULES.REVISION_DAYS),
      state.weighing_frequency === "weekly" ? "weekly" : "daily"
    );
    if (summary.average === null || before.average === null) {
      setNotice("Do rewizji potrzebne są dwa pełne okresy ważeń.");
      return;
    }

    const result = reviseGoal(
      state.calorie_goal_kcal,
      summary.average - before.average,
      state.goal_mode ?? "recomp",
      state.maintenance_kcal
    );
    setNotice(result.reason);
    if (!result.changed) return;
    onStateChange(
      await saveProgramState({ calorie_goal_kcal: result.kcal, goal_revised_on: today })
    );
  }

  async function turnOff() {
    // R7: jedno kliknięcie, bez pytania „na pewno?", bez ankiety wyjściowej.
    setKnowledge(false);
    onStateChange(await saveProgramState({ calorie_tracking_off: true }));
  }

  const goal = state.calorie_goal_kcal;
  const revisionDue = canRevise(state.goal_revised_on, today);

  return (
    <section className="sy-mod">
      <div className="sy-mod__head">
        <span className="sy-mod__name">Kalorie</span>
        <button type="button" className="sy-mod__note" onClick={() => setKnowledge(true)}>
          jak to liczymy
        </button>
      </div>

      {noWeighing ? (
        <p className="sy-sub">
          Bez pomiarów wagi nie da się wyliczyć zapotrzebowania. Możesz dalej notować kalorie jako
          informację albo wyłączyć ten moduł.
        </p>
      ) : goal !== null && goalUnlocked ? (
        <>
          <p className="sy-sub">
            <span className="num">{eaten}</span> / <span className="num">{goal}</span> kcal ·{" "}
            {state.goal_mode === "bulk" ? "budowa masy" : "rekompozycja"}
          </p>
          <div className="sy-bar" role="img" aria-label={`Zjedzone ${eaten} z ${goal} kilokalorii`}>
            <div className="sy-bar__fill" style={{ width: `${Math.min(100, (eaten / goal) * 100)}%` }} />
          </div>
        </>
      ) : (
        <>
          <p className="sy-sub">
            Zbieram dane - dzień <span className="num">{progress.days}</span> z{" "}
            <span className="num">{progress.needed}</span>. Dziś: <span className="num">{eaten}</span> kcal.
            {goalUnlocked && progress.ready && " Liczę zapotrzebowanie…"}
          </p>
          <div
            className="sy-bar"
            role="img"
            aria-label={`Dzień ${progress.days} z ${progress.needed} etapu pomiaru`}
          >
            <div
              className="sy-bar__fill"
              style={{ width: `${Math.min(100, (progress.days / progress.needed) * 100)}%` }}
            />
          </div>
        </>
      )}

      <div className="sy-tiles">
        {QUICK.map((kcal) => (
          <button key={kcal} type="button" className="sy-tile" onClick={() => void add(kcal)}>
            <span>Dodaj</span>
            <span className="sy-tile__g num">{kcal} kcal</span>
          </button>
        ))}
      </div>

      <div className="sy-mod__row">
        <input
          className="sy-input num"
          inputMode="numeric"
          aria-label="Kalorie"
          placeholder="kcal"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button type="button" className="sy-btn" onClick={() => void addManual()}>
          Dodaj
        </button>
      </div>

      {goalUnlocked && !noWeighing && state.maintenance_kcal !== null && (
        <>
          <div className="sy-mod__row">
            <button
              type="button"
              className="sy-toggle"
              aria-pressed={state.goal_mode !== "bulk"}
              onClick={() => void setMode("recomp")}
            >
              Rekompozycja
            </button>
            <button
              type="button"
              className="sy-toggle"
              aria-pressed={state.goal_mode === "bulk"}
              onClick={() => void setMode("bulk")}
            >
              Budowa masy
            </button>
          </div>
          <p className="sy-sub">
            Twoje zapotrzebowanie: ok. <span className="num">{state.maintenance_kcal}</span> kcal. To
            oszacowanie z Twoich danych, nie ze wzoru. Będzie się uściślać.
          </p>
          {revisionDue && (
            <button type="button" className="sy-btn sy-btn--ghost" onClick={() => void revise()}>
              Sprawdź, czy zmienić cel
            </button>
          )}
        </>
      )}

      {notice && <p className="sy-alert">{notice}</p>}

      <Sheet open={knowledge} title="Kalorie" onClose={() => setKnowledge(false)}>
        <p>
          Aplikacja nie liczy zapotrzebowania ze wzoru. Osoby przekonane, że jedzą 1028 kcal dziennie,
          po pomiarze wodą podwójnie znakowaną jadły 2081 - zaniżenie o 47%, przy normalnym
          metabolizmie. Nie kłamały: po dobie pamiętały o ~20% mniej jedzenia, niż zjadły.
          <SourceChip sourceKey="lichtman1992" />
        </p>
        <p>
          Każda metoda raportowania zaniża: dzienniczki o 11-41%, wywiady dobowe o 8-30%.
          <SourceChip sourceKey="burrows2019" />
          Dlatego zapotrzebowanie bierze się tutaj z tego, jak Twoja waga zareagowała na zapisane
          spożycie przez {CALORIE_RULES.MEASURE_DAYS} dni - błąd zapisu wchodzi w oszacowanie jako
          stała i się skraca.
        </p>
        <p>
          <strong>Metoda zamiast wzoru.</strong> Tydzień 1-2: jedz normalnie, notuj wszystko, waż się
          rano po toalecie. Koniec tygodnia 2: średnia kalorii wobec zmiany średniej wagi = realne
          zapotrzebowanie. Od tygodnia 3: −300 do −400 (rekompozycja) albo +200 (masa). Korekta co
          dwa tygodnie, o 200 kcal - nie o 500, nie codziennie.
        </p>
        <p>
          <strong>Reszta talerza.</strong> Węglowodany zasilają trening, nie bój się ich. Tłuszcze
          minimum ~0,8 g/kg dla gospodarki hormonalnej. Błonnik 30 g - to on sprawia, że deficyt jest
          znośny: objętość bez kalorii. Woda 3 l.
        </p>
        <p>
          <strong>Gdzie realnie tracisz deficyt.</strong> Nie w posiłkach. W alkoholu (7 kcal/g plus
          zaburzona regeneracja), w płynnych kaloriach, w weekendzie - pięć dni idealnie i dwa bez
          kontroli potrafi wyzerować cały tygodniowy deficyt - oraz w jedzeniu w biegu: kęs tu,
          kęs tam, nigdy nie zapisane.
        </p>
        <p className="sy-alert">
          Jeśli liczenie zacznie zajmować Ci głowę bardziej, niż jest tego warte, robić się stresujące
          albo obsesyjne - przestań liczyć. Trzymaj wtedy tylko białko i regularność posiłków. To
          wciąż dowozi większość efektu, a zdrowa relacja z jedzeniem jest ważniejsza niż precyzja.
        </p>
        <SheetOption label="Wyłącz liczenie kalorii" onClick={() => void turnOff()} />
      </Sheet>
    </section>
  );
}
