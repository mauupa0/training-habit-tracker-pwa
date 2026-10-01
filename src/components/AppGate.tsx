"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { startSync } from "@/lib/db/sync";
import {
  dictionariesReady,
  ensureProgramState,
  pullUserData,
  getProgramState,
  rebuildHabits,
  setOwner,
  syncDictionaries,
  syncForecast,
} from "@/lib/db/repo";
import { BottomNav, type NavKey } from "./BottomNav";
import { AuthScreen } from "./screens/AuthScreen";
import { HabitsOnboarding, habitsReady } from "./screens/HabitsOnboarding";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { KnowledgeScreen } from "./screens/KnowledgeScreen";
import { PlansScreen } from "./screens/PlansScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SessionScreen } from "./screens/SessionScreen";
import { SessionSummary } from "./screens/SessionSummary";
import { TodayScreen } from "./screens/TodayScreen";
import { openSession, sessionsOfPreviousWeek, templateById } from "@/lib/db/queries";
import { saveProgramState, startSession } from "@/lib/db/repo";
import { db } from "@/lib/db/local";
import { shouldAdvanceWeek, weekAdvanceMessage, weekHoldMessage } from "@/lib/domain/program";
import { weekStart } from "@/lib/domain/schedule";
import type { LocalProgramState, LocalSession, WorkoutTemplate } from "@/types";

type Stage = "loading" | "auth" | "onboarding" | "habits" | "app";

const WEEK_CHECK_KEY = "week_checked_for";

/**
 * Awans `program_week` (R5) liczony raz na tydzień kalendarzowy, przy wejściu.
 * Warunek: min. 3 z 4 sesji w poprzednim tygodniu. Brak awansu nie jest karą,
 * więc komunikat jest jednym zdaniem bez komentarza.
 */
async function advanceWeekIfDue(
  state: LocalProgramState,
  notify: (message: string | null) => void
): Promise<LocalProgramState> {
  const thisWeek = weekStart().toISOString().slice(0, 10);
  const checked = await db.meta.get(WEEK_CHECK_KEY);
  if (checked?.value === thisWeek) return state;

  const previous = await sessionsOfPreviousWeek();
  await db.meta.put({ key: WEEK_CHECK_KEY, value: thisWeek });

  // pierwszy tydzień programu nie ma czego podsumowywać
  if (previous.length === 0 && state.program_week === 1) return state;

  if (shouldAdvanceWeek(previous)) {
    const next = await saveProgramState({ program_week: state.program_week + 1 });
    notify(weekAdvanceMessage(next.program_week));
    return next;
  }

  notify(weekHoldMessage(state.program_week));
  return state;
}

/** Sesja w toku i podsumowanie po niej - jedyne widoki poza „Dziś". */
type Live =
  | { view: "today" }
  | { view: "session"; session: LocalSession; template: WorkoutTemplate; minimal: boolean }
  | { view: "summary"; session: LocalSession; template: WorkoutTemplate };

/**
 * Brama aplikacji. Kolejność jest celowa: sesja czytana jest z pamięci urządzenia,
 * więc brak sieci nie wyrzuca z aplikacji - słowniki i dane leżą w IndexedDB.
 */
export function AppGate() {
  const [stage, setStage] = useState<Stage>("loading");
  const [state, setState] = useState<LocalProgramState | null>(null);
  const [live, setLive] = useState<Live>({ view: "today" });
  const [tab, setTab] = useState<NavKey>("today");
  const [settings, setSettings] = useState(false);
  const [weekNotice, setWeekNotice] = useState<string | null>(null);

  const boot = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) {
      setStage("auth");
      return;
    }

    await setOwner(user.id);

    // Słowniki pobieramy raz; bez sieci pracujemy na tym, co już jest.
    if (!(await dictionariesReady()) && navigator.onLine) {
      try {
        await syncDictionaries();
      } catch {
        // brak słowników nie blokuje wejścia - dociągną się przy następnym uruchomieniu
      }
    }

    // puste urządzenie (nowy telefon, wyczyszczona PWA) odzyskuje dane z serwera
    try {
      await pullUserData();
    } catch {
      // brak sieci albo odmowa - pracujemy na tym, co lokalne
    }

    // prognoza jest wspólna i niezmienna, więc wystarczy pobrać ją raz
    if (navigator.onLine) {
      try {
        await syncForecast();
      } catch {
        // wykres porównania poczeka do następnego uruchomienia z siecią
      }
    }

    const programState = await ensureProgramState(user.id);
    setState(programState);

    // dziennik nawyków przelicza się z tego, co lokalne - także dla dni uzupełnionych z opóźnieniem
    void rebuildHabits(30);

    if (programState.height_cm === null) {
      setStage("onboarding");
    } else if (!(await habitsReady())) {
      // R6: bez dwóch planów startowych i dwóch na porażkę nie wchodzimy dalej
      setStage("habits");
    } else {
      setStage("app");
      setState(await advanceWeekIfDue(programState, setWeekNotice));
    }

    // sesja porzucona bez zamknięcia (padła bateria, zamknięta karta) wraca tam,
    // gdzie była - serie i tak leżą w IndexedDB
    const open = await openSession();
    if (open) {
      const template = await templateById(open.template_id);
      if (template) {
        setLive({
          view: "session",
          session: open,
          template,
          minimal: Boolean(open.note?.includes("minimum")),
        });
      }
    }
  }, []);

  useEffect(() => {
    const stop = startSync();
    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void boot();
    });

    return () => {
      sub.subscription.unsubscribe();
      stop();
    };
  }, [boot]);

  if (stage === "loading") {
    // Bez animowanego szkieletu - zwykły, cichy stan przejściowy.
    return <main className="min-h-dvh" aria-busy="true" />;
  }

  if (stage === "auth") return <AuthScreen />;

  if (stage === "onboarding") {
    return (
      <OnboardingScreen
        onDone={async () => {
          const fresh = await getProgramState();
          if (fresh) setState(fresh);
          setStage((await habitsReady()) ? "app" : "habits");
        }}
      />
    );
  }

  if (stage === "habits") {
    return <HabitsOnboarding onDone={() => setStage("app")} />;
  }

  if (!state) return null;

  if (live.view === "session") {
    return (
      <SessionScreen
        session={live.session}
        template={live.template}
        state={state}
        startMinimal={live.minimal}
        onFinish={(session) =>
          setLive({ view: "summary", session, template: live.template })
        }
      />
    );
  }

  if (live.view === "summary") {
    return (
      <SessionSummary
        session={live.session}
        template={live.template}
        onClose={() => setLive({ view: "today" })}
      />
    );
  }

  if (settings) {
    return (
      <>
        <SettingsScreen state={state} onChanged={setState} onBack={() => setSettings(false)} />
        <BottomNav current={tab} items={["today", "progress", "plans", "knowledge"]} onGo={(k) => { setSettings(false); setTab(k); }} />
      </>
    );
  }

  return (
    <>
      {tab === "plans" ? (
        <PlansScreen />
      ) : tab === "progress" ? (
        <ProgressScreen state={state} />
      ) : tab === "knowledge" ? (
        <KnowledgeScreen />
      ) : (
        <TodayScreen
          state={state}
          weekNotice={weekNotice}
          onOpenSettings={() => setSettings(true)}
          onOpenPlans={() => setTab("plans")}
          onStateChange={setState}
          onStart={async (template, minimal) => {
            const session = await startSession(template.id, state.program_week);
            setLive({ view: "session", session, template, minimal });
          }}
        />
      )}
      <BottomNav current={tab} items={["today", "progress", "plans", "knowledge"]} onGo={setTab} />
    </>
  );
}
