"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircumferencesSection } from "@/components/modules/CircumferencesSection";
import { ForecastPanel } from "@/components/modules/ForecastPanel";
import { HabitsCalendar } from "@/components/modules/HabitsCalendar";
import { PainLogSheet } from "@/components/modules/PainLogSheet";
import { PhotosSection } from "@/components/modules/PhotosSection";
import { RealisticExpectations } from "@/components/modules/RealisticExpectations";
import { WeekHistory } from "@/components/modules/WeekHistory";
import { buildChart } from "@/components/modules/WeightModule";
import { Bars } from "@/components/ui/Bars";
import { Chart } from "@/components/ui/Chart";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SourceChip } from "@/components/ui/SourceChip";
import { Stat } from "@/components/ui/Stat";
import { todayIso } from "@/lib/day";
import {
  calibrationTests,
  dailyLogsSince,
  exerciseMap,
  exercisesWithHistory,
  painEntries,
  personalRecords,
  recentSessions,
  setsOfExercise,
  setsSince,
} from "@/lib/db/queries";
import { resolvePain } from "@/lib/db/repo";
import { adherence28 } from "@/lib/domain/adherence";
import {
  VOLUME_TARGET,
  WEIGHT_WINDOW,
  setsPerMuscle,
  volumeGoal,
  volumeVerdict,
  weeklyTonnage,
  weightDelta,
  weightSummary,
} from "@/lib/domain/measure";
import {
  activePain,
  estimate1RM,
  incrementSentence,
  recordSentence,
  weeksPerIncrement,
} from "@/lib/domain/metrics";
import type {
  Exercise,
  LocalCalibrationTest,
  LocalDailyLog,
  LocalPainEntry,
  LocalPersonalRecord,
  LocalProgramState,
  LocalSession,
  LocalSet,
} from "@/types";

const TONNAGE_WEEKS = 12;

type Tab = "overview" | "strength" | "volume" | "body" | "habits" | "calibration" | "history";

const TABS: Array<[Tab, string]> = [
  ["overview", "Przegląd"],
  ["strength", "Siła"],
  ["volume", "Objętość"],
  ["body", "Ciało"],
  ["habits", "Nawyki"],
  ["calibration", "Kalibracja"],
  ["history", "Historia"],
];

/** Prognoza ma osobne serie dla ławki, przysiadu i martwego - reszta ćwiczeń jej nie ma. */
const FORECAST_METRIC: Record<string, string> = {
  bench_press: "bench_working",
  back_squat: "squat_working",
  deadlift: "deadlift_working",
};

/**
 * Postęp. Siedem sekcji, każda z osobna do przejrzenia - bez ekranu osiągnięć,
 * bez rankingu ćwiczeń, bez BMI i bez łączonego „wyniku dnia" (faza 4B, sekcja 8).
 */
export function ProgressScreen({ state }: { state: LocalProgramState }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [muscles, setMuscles] = useState<Map<string, Exercise>>(new Map());
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [pickedSets, setPickedSets] = useState<LocalSet[]>([]);
  const [records, setRecords] = useState<LocalPersonalRecord[]>([]);
  const [pain, setPain] = useState<LocalPainEntry[]>([]);
  const [calibrations, setCalibrations] = useState<LocalCalibrationTest[]>([]);
  const [painOpen, setPainOpen] = useState(false);

  const today = todayIso();
  const frequency = state.weighing_frequency === "weekly" ? "weekly" : "daily";

  const load = useCallback(async () => {
    setLogs(await dailyLogsSince(90));
    setSets(await setsSince(TONNAGE_WEEKS * 7));
    setSessions(await recentSessions(28));
    setMuscles(await exerciseMap());
    setRecords(await personalRecords());
    setPain(await painEntries());
    setCalibrations(await calibrationTests());
    const withHistory = await exercisesWithHistory();
    setExercises(withHistory);
    setPicked((prev) => prev || withHistory[0]?.id || "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!picked) return;
    void (async () => setPickedSets(await setsOfExercise(picked)))();
  }, [picked]);

  const summary = weightSummary(logs, today, frequency);
  const delta = weightDelta(logs, today, frequency);
  const weightChart = buildChart(logs, today, frequency);
  const stats = adherence28(sessions, state.emergency_mode, new Date(), state.started_on);
  const tonnage = useMemo(() => weeklyTonnage(sets, today, TONNAGE_WEEKS), [sets, today]);
  const activeAches = activePain(pain, today);

  const volume = useMemo(() => {
    const counted = setsPerMuscle(sets, (id) => muscles.get(id)?.muscle_group, today, 7);
    return Object.entries(counted).sort((a, b) => b[1] - a[1]);
  }, [sets, muscles, today]);

  const progression = useMemo(() => buildProgression(pickedSets), [pickedSets]);
  const pickedExercise = exercises.find((e) => e.id === picked);
  const pickedRecords = records.filter((r) => r.exercise_id === picked);
  const tempo = weeksPerIncrement(pickedRecords.map((r) => ({ ...r })));

  const workingWeight = useMemo(() => {
    const recent = pickedSets.slice(-8).filter((s) => s.weight_kg);
    return recent.length ? Math.max(...recent.map((s) => s.weight_kg as number)) : null;
  }, [pickedSets]);

  return (
    <main className="sy-screen sy-with-nav">
      <header className="sy-head">
        <h1 className="sy-title">Postęp</h1>
      </header>

      <nav className="sy-tabs" aria-label="Sekcje postępu">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="sy-tabs__item"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <section className="sy-section">
            <h2 className="sy-section__title">Frekwencja</h2>
            <Stat label="Treningi w ostatnich 28 dniach" value={`${stats.done}`} unit={`/ ${stats.target}`} variant="hero" />
            <p className="sy-sub">
              Tydzień programu: <span className="num">{state.program_week}</span>. Start:{" "}
              <span className="num">{state.started_on}</span>.
            </p>
            <RealisticExpectations />
            <Bars
              values={tonnage.map((t) => t.kg)}
              xFirst={tonnage[0]?.weekStart.slice(5).replace("-", ".") ?? ""}
              xLast="teraz"
              ariaLabel="Tonaż w dwunastu ostatnich tygodniach."
              format={(v) => `${Math.round(v / 1000)} t`}
            />
          </section>

          <section className="sy-section">
            <h2 className="sy-section__title">Ostatnie rekordy</h2>
            {records.length === 0 ? (
              <EmptyState>Rekordy zapiszą się same przy kolejnych seriach.</EmptyState>
            ) : (
              records.slice(0, 3).map((r) => (
                <p className="sy-sub" key={r.id}>
                  {recordSentence(muscles.get(r.exercise_id)?.name_pl ?? "Ćwiczenie", {
                    record_type: r.record_type,
                    value: r.value,
                    previous_value: r.previous_value,
                    weight_kg: r.weight_kg,
                    reps: r.reps,
                    rir: r.rir,
                  })}{" "}
                  <span className="sy-mod__note num">{r.achieved_on}</span>
                </p>
              ))
            )}
          </section>

          {activeAches.length > 0 && (
            <section className="sy-section">
              <h2 className="sy-section__title">Zgłoszony ból</h2>
              <div className="sy-pain">
                {activeAches.map((a) => (
                  <p className="sy-sub" key={a.id}>
                    {a.body_part.replace("_", " ")} · natężenie <span className="num">{a.severity}</span> ·{" "}
                    <span className="num">{a.logged_on}</span>
                  </p>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "strength" && (
        <section className="sy-section">
          <h2 className="sy-section__title">Siła</h2>
          {exercises.length === 0 ? (
            <EmptyState>Wykres pojawi się po pierwszej zapisanej serii.</EmptyState>
          ) : (
            <>
              <select
                className="sy-input"
                aria-label="Ćwiczenie"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              >
                {exercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name_pl}
                  </option>
                ))}
              </select>

              {progression ? (
                <>
                  <Chart
                    series={[{ values: progression.values, variant: "main" }]}
                    yMin={progression.yMin}
                    yMax={progression.yMax}
                    yTicks={progression.ticks}
                    xFirst={progression.first}
                    xLast={progression.last}
                    ariaLabel="Szacowany ciężar maksymalny w kolejnych sesjach."
                  />
                  <p className="sy-sub">
                    Szacowany maks z najlepszej serii dnia. Oszacowanie ze wzoru, nie zmierzony maks -
                    rośnie razem z ciężarem roboczym, więc nie testuj maksa, żeby to sprawdzić.
                  </p>
                </>
              ) : (
                <p className="sy-sub">Za mało zapisanych sesji tego ćwiczenia na wykres.</p>
              )}

              {tempo !== null && <p className="sy-sub">{incrementSentence(tempo, null)}</p>}

              {pickedRecords.length > 0 && (
                <DataTable
                  caption="Rekordy tego ćwiczenia"
                  columns={[
                    { key: "date", label: "Data" },
                    { key: "type", label: "Rodzaj" },
                    { key: "value", label: "Wynik", numeric: true },
                    { key: "prev", label: "Poprzednio", numeric: true },
                  ]}
                  rows={pickedRecords.slice(0, 8).map((r) => ({
                    date: r.achieved_on,
                    type: RECORD_PL[r.record_type],
                    value: String(r.value).replace(".", ","),
                    prev: r.previous_value ? String(r.previous_value).replace(".", ",") : "-",
                  }))}
                  minWidth={380}
                />
              )}

              {pickedExercise && FORECAST_METRIC[pickedExercise.slug] && (
                <>
                  <h2 className="sy-section__title" style={{ marginTop: 18 }}>
                    Na tle prognozy
                  </h2>
                  <ForecastPanel
                    metric={FORECAST_METRIC[pickedExercise.slug]}
                    label={pickedExercise.name_pl}
                    unit="kg"
                    actual={workingWeight}
                    startedOn={state.started_on}
                    attendance={{ done: stats.done, planned: stats.target, expected: 14 }}
                  />
                </>
              )}
            </>
          )}
        </section>
      )}

      {tab === "volume" && (
        <>
          <section className="sy-section">
            <h2 className="sy-section__title">Objętość na partię</h2>
            {volume.length === 0 ? (
              <EmptyState>Serie z ostatnich 7 dni pokażą się tutaj.</EmptyState>
            ) : (
              <DataTable
                caption="Serie na partię w ostatnich 7 dniach wobec objętości z planu"
                columns={[
                  { key: "muscle", label: "Partia" },
                  { key: "count", label: "Serie", numeric: true },
                  { key: "planned", label: "Plan", numeric: true },
                  { key: "verdict", label: "Stan" },
                ]}
                rows={volume.map(([muscle, count]) => ({
                  muscle,
                  count,
                  planned: volumeGoal(muscle) ?? "-",
                  verdict: volumeVerdict(count, muscle),
                }))}
              />
            )}
            <p className="sy-note">
              Zakres roboczy:{" "}
              <span className="sy-nowrap">
                <span className="num">
                  {VOLUME_TARGET.min}-{VOLUME_TARGET.max} serii
                </span>
                <SourceChip sourceKey="schoenfeld2017" />
              </span>{" "}
              tygodniowo na partię.
            </p>
          </section>

          <section className="sy-section">
            <h2 className="sy-section__title">Tonaż i rozkład sesji</h2>
            <Bars
              values={tonnage.map((t) => t.kg)}
              xFirst={tonnage[0]?.weekStart.slice(5).replace("-", ".") ?? ""}
              xLast="teraz"
              ariaLabel="Tonaż tygodniowy w dwunastu ostatnich tygodniach."
              format={(v) => `${Math.round(v / 1000)} t`}
            />
            <p className="sy-sub">
              Ten tydzień: <span className="num">{tonnage[tonnage.length - 1]?.kg.toLocaleString("pl-PL")}</span> kg ·
              sesje pełne: <span className="num">{sessions.filter((s) => s.status === "full").length}</span> ·
              minimum: <span className="num">{sessions.filter((s) => s.status === "minimal").length}</span>
            </p>
          </section>
        </>
      )}

      {tab === "body" && (
        <>
          {state.weighing_frequency !== "never" && (
            <section className="sy-section">
              <h2 className="sy-section__title">Waga</h2>
              {summary.average === null ? (
                <p className="sy-sub">
                  Zbieram dane. Średnia pojawi się po{" "}
                  <span className="num">{WEIGHT_WINDOW[frequency].minCount}</span> pomiarach.
                </p>
              ) : (
                <>
                  <Stat
                    label={WEIGHT_WINDOW[frequency].label}
                    value={summary.average.toFixed(1).replace(".", ",")}
                    unit="kg"
                    variant="hero"
                  />
                  {delta !== null && (
                    <p className="sy-sub">
                      {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
                      {Math.abs(delta).toFixed(1).replace(".", ",")} kg / 2 tyg.
                    </p>
                  )}
                </>
              )}
              {weightChart && (
                <Chart
                  series={[
                    { values: weightChart.daily, variant: "pess" },
                    { values: weightChart.average, variant: "main" },
                  ]}
                  yMin={weightChart.yMin}
                  yMax={weightChart.yMax}
                  yTicks={weightChart.ticks}
                  xFirst={weightChart.first}
                  xLast={weightChart.last}
                  ariaLabel={weightChart.aria}
                />
              )}
            </section>
          )}

          <CircumferencesSection state={state} />
          <PhotosSection state={state} />

          <section className="sy-section">
            <h2 className="sy-section__title">Ból i ograniczenia</h2>
            <button type="button" className="sy-btn" onClick={() => setPainOpen(true)}>
              Coś boli
            </button>
            {pain.length === 0 ? (
              <p className="sy-sub">Brak zgłoszeń. To dobrze - ale gdy coś się pojawi, zapisz od razu.</p>
            ) : (
              <DataTable
                caption="Zgłoszenia bólu"
                columns={[
                  { key: "date", label: "Data" },
                  { key: "part", label: "Miejsce" },
                  { key: "severity", label: "Natężenie", numeric: true },
                  { key: "state", label: "Stan" },
                ]}
                rows={pain.slice(0, 10).map((p) => ({
                  date: p.logged_on,
                  part: p.body_part.replace("_", " "),
                  severity: p.severity,
                  state: p.resolved_on ? (
                    `minęło ${p.resolved_on}`
                  ) : (
                    <button
                      type="button"
                      className="sy-mod__note"
                      onClick={() => void resolvePain(p.id).then(load)}
                    >
                      oznacz jako minęło
                    </button>
                  ),
                }))}
                minWidth={380}
              />
            )}
          </section>
        </>
      )}

      {tab === "habits" && (
        <section className="sy-section">
          <h2 className="sy-section__title">Nawyki</h2>
          <HabitsCalendar />
        </section>
      )}

      {tab === "calibration" && (
        <section className="sy-section">
          <h2 className="sy-section__title">Kalibracja RIR</h2>
          {calibrations.length === 0 ? (
            <EmptyState>Historia pojawi się po pierwszym teście do upadku.</EmptyState>
          ) : (
            <>
              <p className="sy-sub">
                Twoja średnia pomyłka:{" "}
                <span className="num">
                  {(() => {
                    const avg = calibrations.reduce((s, c) => s + c.bias, 0) / calibrations.length;
                    return `${avg > 0 ? "+" : ""}${avg.toFixed(1).replace(".", ",")}`;
                  })()}
                </span>{" "}
                powtórzeń względem deklaracji.
                <SourceChip sourceKey="steele2017" />
              </p>
              {calibrations.length >= 2 && (
                <Chart
                  series={[{ values: calibrations.map((c) => c.bias), variant: "main" }]}
                  yMin={Math.min(0, ...calibrations.map((c) => c.bias)) - 1}
                  yMax={Math.max(1, ...calibrations.map((c) => c.bias)) + 1}
                  yTicks={[
                    Math.min(0, ...calibrations.map((c) => c.bias)) - 1,
                    0,
                    Math.max(1, ...calibrations.map((c) => c.bias)) + 1,
                  ]}
                  xFirst={calibrations[0].tested_on.slice(5).replace("-", ".")}
                  xLast={calibrations[calibrations.length - 1].tested_on.slice(5).replace("-", ".")}
                  ariaLabel="Pomyłka w ocenie zapasu powtórzeń w kolejnych testach."
                />
              )}
              <DataTable
                caption="Testy kalibracji: deklaracja wobec wykonania"
                columns={[
                  { key: "date", label: "Data" },
                  { key: "predicted", label: "Zapowiedź", numeric: true },
                  { key: "actual", label: "Wykonane", numeric: true },
                  { key: "bias", label: "Pomyłka", numeric: true },
                ]}
                rows={[...calibrations].reverse().map((c) => ({
                  date: c.tested_on,
                  predicted: c.predicted_reps,
                  actual: c.actual_reps,
                  bias: `${c.bias > 0 ? "+" : ""}${c.bias}`,
                }))}
                minWidth={380}
              />
            </>
          )}
        </section>
      )}

      {tab === "history" && <WeekHistory state={state} />}

      <PainLogSheet open={painOpen} onClose={() => { setPainOpen(false); void load(); }} />
    </main>
  );
}

const RECORD_PL: Record<string, string> = {
  max_weight: "ciężar",
  max_reps_at_weight: "powtórzenia",
  est_1rm: "szac. maks",
  max_volume_session: "tonaż sesji",
};

/**
 * Szacowany maks z najlepszej serii każdego dnia. Jeden punkt na dzień, bo wykres
 * ma pokazywać kierunek, a nie każdą serię z osobna.
 */
function buildProgression(
  sets: LocalSet[]
): { values: number[]; yMin: number; yMax: number; ticks: number[]; first: string; last: string } | null {
  const byDay = new Map<string, number>();
  for (const s of sets) {
    const value = estimate1RM(s.weight_kg, s.reps, s.rir);
    if (value === null) continue;
    const day = s.logged_at.slice(0, 10);
    byDay.set(day, Math.max(byDay.get(day) ?? 0, value));
  }

  const days = [...byDay.keys()].sort();
  if (days.length < 2) return null;

  const values = days.map((d) => byDay.get(d) as number);
  const lo = Math.floor(Math.min(...values) - 2);
  const hi = Math.ceil(Math.max(...values) + 2);

  return {
    values,
    yMin: lo,
    yMax: hi,
    ticks: [lo, Math.round((lo + hi) / 2), hi],
    first: days[0].slice(5).replace("-", "."),
    last: days[days.length - 1].slice(5).replace("-", "."),
  };
}
