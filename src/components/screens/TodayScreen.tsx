"use client";

import { useEffect, useMemo, useState } from "react";
import { CaloriesModule } from "@/components/modules/CaloriesModule";
import { CreatineModule } from "@/components/modules/CreatineModule";
import { PainLogSheet } from "@/components/modules/PainLogSheet";
import { ProteinModule } from "@/components/modules/ProteinModule";
import { SleepModule } from "@/components/modules/SleepModule";
import { WeightModule } from "@/components/modules/WeightModule";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet, SheetOption } from "@/components/ui/Sheet";
import { SourceChip } from "@/components/ui/SourceChip";
import { Stat } from "@/components/ui/Stat";
import { SyncDot } from "@/components/ui/SyncDot";
import { adherence28, missedSignal } from "@/lib/domain/adherence";
import { activeModules, lockedMessage, MODULE_LABEL, shouldAskAboutEmergency } from "@/lib/domain/program";
import { catchUpTemplate, dayName, nextTrainingDay, plannedFor, weekStart } from "@/lib/domain/schedule";
import { activePlans, latestWoop, plannedExercises, recentSessions, templateByKey } from "@/lib/db/queries";
import { saveProgramState } from "@/lib/db/repo";
import { db } from "@/lib/db/local";
import { todayIso } from "@/lib/day";
import type {
  LocalIfThenPlan,
  LocalProgramState,
  LocalSession,
  LocalWoopEntry,
  ModuleKey,
  TemplateKey,
  WorkoutTemplate,
} from "@/types";

type TemplateRow = WorkoutTemplate & { exercises: number };

/** Moduły z własnym interfejsem; reszta pokazuje się jako sam wiersz stanu. */
const WITH_UI: ModuleKey[] = ["protein", "sleep", "creatine", "calories_measure", "calories_goal"];

/** „Poniedziałek, 10 sierpnia" - wielka litera, bo to nagłówek dnia. */
function longDate(d: Date): string {
  const text = d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function TodayScreen({
  state,
  weekNotice,
  onStart,
  onOpenSettings,
  onOpenPlans,
  onStateChange,
}: {
  state: LocalProgramState;
  /** komunikat o awansie albo powtórzeniu tygodnia, wyliczany przy wejściu */
  weekNotice?: string | null;
  onStart: (template: WorkoutTemplate, minimal: boolean) => void;
  onOpenSettings: () => void;
  onOpenPlans: () => void;
  onStateChange: (next: LocalProgramState) => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [failurePlan, setFailurePlan] = useState<LocalIfThenPlan | null>(null);
  const [lockedSheet, setLockedSheet] = useState<ModuleKey | null>(null);
  const [woop, setWoop] = useState<LocalWoopEntry | undefined>();
  const [emergencyAsked, setEmergencyAsked] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const now = useMemo(() => new Date(), []);
  const plannedKey = plannedFor(now);

  useEffect(() => {
    void (async () => {
      const tpls = await db.workoutTemplates.orderBy("position").toArray();
      setTemplates(
        await Promise.all(
          tpls.map(async (t) => ({ ...t, exercises: (await plannedExercises(t.id)).length }))
        )
      );
      setSessions(await recentSessions(28));
      const plans = await activePlans("failure");
      setFailurePlan(plans[0] ?? null);
      setWoop(await latestWoop());
      setLoaded(true);
    })();
  }, []);

  const stats = adherence28(sessions, state.emergency_mode, now, state.started_on);
  const signal = missedSignal(stats.missedInARow);

  const doneThisWeek = useMemo(() => {
    const start = weekStart(now).getTime();
    const keys: TemplateKey[] = [];
    for (const s of sessions) {
      if (new Date(s.started_at).getTime() < start) continue;
      if (s.status !== "full" && s.status !== "minimal") continue;
      const tpl = templates.find((t) => t.id === s.template_id);
      if (tpl) keys.push(tpl.key);
    }
    return keys;
  }, [sessions, templates, now]);

  const todayKey: TemplateKey = plannedKey ?? catchUpTemplate(doneThisWeek);
  const todayTemplate = templates.find((t) => t.key === todayKey);
  const doneToday = sessions.some(
    (s) =>
      new Date(s.started_at).toDateString() === now.toDateString() &&
      (s.status === "full" || s.status === "minimal")
  );

  const next = nextTrainingDay(now);
  const nextName = templates.find((t) => t.key === next.key)?.name_pl ?? "";

  async function start(minimal: boolean) {
    const tpl = todayTemplate ?? (await templateByKey(todayKey));
    if (tpl) onStart(tpl, minimal);
  }

  // trening jest zawsze i nie jest „modułem" na liście
  const active: ModuleKey[] = activeModules(
    state.program_week,
    state.manual_unlocks,
    state.emergency_mode
  );
  const modules = active.filter((m) => m !== "training");
  const locked: ModuleKey[] = state.emergency_mode
    ? []
    : (["protein", "sleep", "creatine", "calories_measure", "steps"] as ModuleKey[]).filter(
        (m) => !active.includes(m)
      );

  const weightVisible = state.weighing_frequency !== "never";

  async function unlockAnyway(module: ModuleKey) {
    onStateChange(
      await saveProgramState({ manual_unlocks: [...state.manual_unlocks, module] })
    );
    setLockedSheet(null);
  }

  return (
    <main className="sy-screen sy-with-nav">
      <header className="sy-head">
        <h1 className="sy-title">{longDate(now)}</h1>
        <span className="flex items-center gap-3">
          <SyncDot />
          <button
            type="button"
            className="sy-list__meta"
            style={{ background: "none", border: 0, cursor: "pointer", minHeight: 44 }}
            onClick={onOpenSettings}
          >
            ustawienia
          </button>
        </span>
      </header>

      {/* R6: plan na porażkę pokazuje się sam w momencie wpadki, nie w ustawieniach */}
      {stats.missedInARow === 1 && failurePlan && (
        <div className="sy-card">
          <span className="sy-card__head">
            Wczoraj wypadł trening. Twój plan na taką sytuację:
          </span>
          <p className="sy-card__plan">
            „{failurePlan.trigger_pl}, to {failurePlan.action_pl}"
          </p>
        </div>
      )}

      {stats.missedInARow >= 2 && (
        <div className="sy-card sy-card--firm">
          <span className="sy-card__head">{signal}</span>
          {failurePlan && (
            <p className="sy-card__plan">
              „{failurePlan.trigger_pl}, to {failurePlan.action_pl}"
            </p>
          )}
          <button type="button" className="sy-btn" onClick={() => void start(true)}>
            Zrób minimum teraz
          </button>
        </div>
      )}

      {weekNotice && <p className="sy-hint">{weekNotice}</p>}

      {/* przegląd WOOP jako zadanie na ekranie, nigdy jako powiadomienie push */}
      {woop && woop.review_at <= todayIso(now) && (
        <button type="button" className="sy-module" onClick={onOpenPlans}>
          <span>Przegląd WOOP - 5 minut</span>
          <span className="sy-module__note">termin</span>
        </button>
      )}

      {/* tryb awaryjny: pytamy raz na 4 tygodnie, neutralnie, i nie wracamy do tematu */}
      {state.emergency_mode &&
        !emergencyAsked &&
        shouldAskAboutEmergency(state.emergency_started_on, null, now) && (
          <div className="sy-card">
            <span className="sy-card__head">
              Minęły 4 tygodnie w trybie minimum. Wrócić do pełnego planu?
            </span>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="sy-btn sy-btn--ghost"
                onClick={async () => {
                  onStateChange(
                    await saveProgramState({
                      emergency_mode: false,
                      emergency_started_on: null,
                    })
                  );
                }}
              >
                Wracam
              </button>
              <button
                type="button"
                className="sy-btn sy-btn--ghost"
                onClick={async () => {
                  setEmergencyAsked(true);
                  onStateChange(await saveProgramState({ emergency_started_on: todayIso(now) }));
                }}
              >
                Jeszcze nie
              </button>
            </div>
          </div>
        )}

      {!loaded ? null : templates.length === 0 ? (
        <EmptyState>Brak planu na urządzeniu. Pojawi się po pierwszej synchronizacji.</EmptyState>
      ) : plannedKey ? (
        <section>
          <p className="sy-label">Dziś</p>
          <p className="sy-title" style={{ marginBottom: 14 }}>
            {todayTemplate?.name_pl}
            {todayTemplate?.subtitle_pl && (
              <span className="sy-list__note"> · {todayTemplate.subtitle_pl}</span>
            )}
          </p>
          {doneToday && <p className="sy-lead">Dzisiejszy trening jest już zapisany.</p>}
          {/* Pora treningu jako wyzwalacz, nie jako termin do dotrzymania: po jej minięciu
              aplikacja niczego nie wypomina - sesja bez pory liczy się tak samo. */}
          {!doneToday && state.session_time && (
            <p className="sy-sub">
              Zaplanowana pora: <span className="num">{state.session_time.slice(0, 5)}</span>
            </p>
          )}
          <button type="button" className="sy-save" onClick={() => void start(false)}>
            {doneToday ? "Jeszcze jeden trening" : "Zacznij trening"}
          </button>
          <button type="button" className="sy-btn sy-btn--ghost" onClick={() => void start(true)}>
            Tryb minimum
          </button>
        </section>
      ) : (
        <section>
          <p className="sy-lead" style={{ marginBottom: 14 }}>
            Dziś wolne. Następny trening: {next.inDays === 1 ? "jutro" : dayName(next.date)}, {nextName}.
          </p>
          <button type="button" className="sy-btn sy-btn--ghost" onClick={() => void start(false)}>
            Trenuj mimo to
          </button>
        </section>
      )}

      <section className="sy-panel" style={{ marginTop: 26 }}>
        <Stat
          label="Treningi w ostatnich 28 dniach"
          value={String(stats.done)}
          unit={`/ ${stats.target}`}
          variant="hero"
        />
        <p className="mt-3 text-[14px]" style={{ color: "var(--ink-2)" }}>
          Tydzień programu: <span className="num">{state.program_week}</span>. Start:{" "}
          <span className="num">{state.started_on}</span>.
        </p>
      </section>

      <section className="sy-section">
        <h2 className="sy-section__title">Plan tygodnia</h2>
        <ul className="sy-list">
          {templates.map((t) => (
            <li key={t.id} className="sy-list__row">
              <span>
                <span className="sy-list__name">{t.name_pl}</span>
                {t.subtitle_pl && <span className="sy-list__note"> · {t.subtitle_pl}</span>}
              </span>
              <span className="sy-list__meta">
                {doneThisWeek.includes(t.key) ? "✓ " : ""}
                {t.exercises} ćw.
              </span>
            </li>
          ))}
        </ul>
      </section>

      {(modules.length > 0 || locked.length > 0 || weightVisible) && (
        <section className="sy-section">
          <h2 className="sy-section__title">Moduły</h2>

          {/* R7: po wyłączeniu ważenia moduł znika i aplikacja nigdy sama go nie proponuje */}
          {weightVisible && <WeightModule state={state} />}
          {modules.includes("protein") && <ProteinModule state={state} />}
          {modules.includes("sleep") && <SleepModule state={state} />}
          {modules.includes("creatine") && <CreatineModule />}
          {/* R7: wyłączone liczenie kalorii znika bez śladu i aplikacja nigdy go nie proponuje */}
          {modules.includes("calories_measure") && !state.calorie_tracking_off && (
            <CaloriesModule
              state={state}
              onStateChange={onStateChange}
              goalUnlocked={modules.includes("calories_goal")}
            />
          )}

          {/* moduły bez własnego interfejsu (dochodzą w fazie 5) zostają wierszem stanu */}
          {modules
            .filter((m) => !WITH_UI.includes(m))
            .map((m) => (
              <div key={m} className="sy-module">
                <span>{MODULE_LABEL[m]}</span>
                <span className="sy-module__note">czynny</span>
              </div>
            ))}
          {/* R5: zablokowany moduł mówi kiedy wejdzie, bez zachęt i bez czerwieni */}
          {locked.map((m) => (
            <button
              key={m}
              type="button"
              className="sy-module sy-module--locked"
              onClick={() => setLockedSheet(m)}
            >
              <span>
                {MODULE_LABEL[m]} · {lockedMessage(m)}
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Log bólu ma być pod ręką w dniu, w którym coś strzeli - nie schowany w ustawieniach */}
      <button type="button" className="sy-module" onClick={() => setPainOpen(true)}>
        <span>Coś boli</span>
        <span className="sy-module__note">zapisz</span>
      </button>
      <PainLogSheet open={painOpen} onClose={() => setPainOpen(false)} />

      <Sheet
        open={lockedSheet !== null}
        title={lockedSheet ? MODULE_LABEL[lockedSheet] : ""}
        onClose={() => setLockedSheet(null)}
      >
        <p>
          Wprowadzanie kilku nawyków naraz obniża szansę utrzymania każdego z nich. Harmonogram
          rozkłada je tak, żeby kolejny startował, gdy poprzedni już nie kosztuje uwagi.
        </p>
        <p>
          Możesz odblokować wcześniej. Decyzja zostanie zapamiętana i nie będziemy o tym więcej
          przypominać.
        </p>
        <SheetOption
          label="Odblokuj mimo to"
          onClick={() => lockedSheet && void unlockAnyway(lockedSheet)}
        />
      </Sheet>

      <p className="sy-note">
        Objętość docelowa: <span className="num">12-18 serii</span> tygodniowo na
        <span className="sy-nowrap">
          {" partię"}
          <SourceChip sourceKey="schoenfeld2017" />
        </span>
        <br />
        Przerwy w bojach głównych:
        <span className="sy-nowrap">
          {" "}
          <span className="num">3 minuty</span>
          <SourceChip sourceKey="schoenfeld2016rest" />
        </span>
      </p>
    </main>
  );
}
