"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RestTimer } from "@/components/ui/RestTimer";
import { Sheet, SheetOption } from "@/components/ui/Sheet";
import { SourceChip } from "@/components/ui/SourceChip";
import { Stepper } from "@/components/ui/Stepper";
import { toPl } from "@/components/ui/format";
import { checkFirstSet } from "@/lib/domain/autoregulation";
import { rirBias, shouldOfferCalibration } from "@/lib/domain/calibration";
import { formatKg, maxRir, nextWeight, type SetLog } from "@/lib/domain/progression";
import {
  calibrationHistory,
  lastSessionsOfTemplate,
  lastSetsFor,
  plannedExercises,
  setsOfSession,
  type PlannedExercise,
} from "@/lib/db/queries";
import { PainLogSheet } from "@/components/modules/PainLogSheet";
import { logCalibration, logSet, recordsForSet, saveProgramState, updateSession } from "@/lib/db/repo";
import { askNotifyPermission, buzz, notifyRestOver, useWakeLock } from "@/lib/wakeLock";
import type { LocalProgramState, LocalSession, LocalSet, WorkoutTemplate } from "@/types";

const MINIMAL_EXERCISES = 2;
const MINIMAL_SETS = 2;

type Props = {
  session: LocalSession;
  template: WorkoutTemplate;
  state: LocalProgramState;
  /** wejście prosto w tryb minimum z ekranu „Dziś" (R2) */
  startMinimal?: boolean;
  onFinish: (session: LocalSession) => void;
};

/**
 * Serce aplikacji: logowanie serii. Projektowane pod jedną rękę i hałas -
 * wartości są wstępnie wypełnione sugestią, więc typowa seria to jedno stuknięcie.
 */
export function SessionScreen({ session, template, state, startMinimal = false, onFinish }: Props) {
  const [plan, setPlan] = useState<PlannedExercise[]>([]);
  const [index, setIndex] = useState(0);
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [previous, setPrevious] = useState<LocalSet[]>([]);

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number>(2);

  const [restEndsAt, setRestEndsAt] = useState(0);
  const [restTotal, setRestTotal] = useState(0);

  const [minimal, setMinimal] = useState(startMinimal);
  const [hint, setHint] = useState<string | null>(null);
  const [holdSeen, setHoldSeen] = useState(false);
  const [editing, setEditing] = useState<LocalSet | null>(null);
  const [picker, setPicker] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [calibration, setCalibration] = useState<{ predicted: number } | null>(null);
  const [lastCalibrationAt, setLastCalibrationAt] = useState<Date | null>(null);
  const [exitAsk, setExitAsk] = useState(false);

  useWakeLock(true);

  const visiblePlan = useMemo(
    () => (minimal ? plan.slice(0, MINIMAL_EXERCISES) : plan),
    [plan, minimal]
  );
  const current = visiblePlan[index];
  const targetSets = current
    ? minimal
      ? MINIMAL_SETS
      : current.position.target_sets
    : 0;

  const currentSets = useMemo(
    () => (current ? sets.filter((s) => s.exercise_id === current.exercise.id) : []),
    [sets, current]
  );

  // ---------------------------------------------------------------- wczytanie
  useEffect(() => {
    void (async () => {
      setPlan(await plannedExercises(session.template_id));
      setSets(await setsOfSession(session.id));
      const [lastTest] = await calibrationHistory(1);
      setLastCalibrationAt(lastTest ? new Date(lastTest.logged_at) : null);
      void askNotifyPermission();
    })();
  }, [session.id, session.template_id]);

  const suggestion = useMemo(() => {
    if (!current) return null;
    const history: SetLog[] = previous.map((s) => ({
      weight_kg: s.weight_kg,
      reps: s.reps,
      rir: s.rir,
    }));
    return nextWeight(history, {
      rep_min: current.position.rep_min,
      rep_max: current.position.rep_max,
      target_rir: current.position.target_rir,
      increment_kg: current.exercise.increment_kg,
    });
  }, [current, previous]);

  // dane sprzed tygodnia + wartości startowe steppera
  useEffect(() => {
    if (!current) return;
    void (async () => {
      const { sets: last } = await lastSetsFor(current.exercise.id, session.id);
      setPrevious(last);
    })();
  }, [current, session.id]);

  useEffect(() => {
    if (!current || !suggestion) return;
    const done = currentSets.length;
    if (done > 0) {
      // kolejne serie startują z ostatnio zapisanej wartości
      const last = currentSets[currentSets.length - 1];
      setWeight(last.weight_kg);
      setReps(last.reps);
      setRir(last.rir ?? maxRir(current.position.target_rir) ?? 2);
      return;
    }
    setWeight(suggestion.weight_kg || previous[0]?.weight_kg || 0);
    setReps(suggestion.target_reps ?? previous[0]?.reps ?? current.position.rep_min);
    setRir(maxRir(current.position.target_rir) ?? 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.exercise.id, suggestion?.weight_kg, previous.length]);

  // ---------------------------------------------------------------- zapis serii
  const save = useCallback(async () => {
    if (!current) return;

    const row = await logSet({
      id: editing?.id,
      session_id: session.id,
      exercise_id: current.exercise.id,
      set_index: editing ? editing.set_index : currentSets.length + 1,
      weight_kg: weight,
      reps,
      rir: calibration ? 0 : rir,
      is_calibration: Boolean(calibration),
      predicted_reps: calibration?.predicted ?? null,
      logged_at: editing?.logged_at,
    });

    buzz();
    // Rekordy liczą się lokalnie, od razu po zapisie - poprawka istniejącej serii
    // ich nie generuje, bo to ta sama próba, tylko z poprawioną liczbą.
    if (!editing) await recordsForSet(row);
    setSets(await setsOfSession(session.id));
    setEditing(null);

    if (calibration) {
      await finishCalibration();
      return;
    }

    // pierwsza seria ćwiczenia mówi, czy dziś w ogóle dokładamy
    if (currentSets.length === 0 && previous.length > 0) {
      const priorHold = await hadHoldLastTime();
      const verdict = checkFirstSet(
        { weight_kg: row.weight_kg, reps: row.reps, rir: row.rir },
        { weight_kg: previous[0].weight_kg, reps: previous[0].reps, rir: previous[0].rir },
        priorHold
      );
      if (verdict.flag !== "none") {
        setHint(verdict.message_pl);
        setHoldSeen(true);
      }
    }

    const rest = current.position.rest_seconds;
    setRestTotal(rest);
    setRestEndsAt(Date.now() + rest * 1000);

    const done = currentSets.length + (editing ? 0 : 1);
    if (!editing && done >= targetSets && index < visiblePlan.length - 1) {
      setIndex((i) => i + 1);
      setHint(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, weight, reps, rir, currentSets, editing, calibration, previous, targetSets, index, visiblePlan.length]);

  async function hadHoldLastTime(): Promise<boolean> {
    const [last] = await lastSessionsOfTemplate(session.template_id, 1, session.id);
    return Boolean(last?.note?.includes("hold"));
  }

  async function finishCalibration() {
    // Historia kalibracji dostaje własny wpis - bez niego wykres nauki oceny
    // musiałby zgadywać z serii oznaczonych flagą.
    if (calibration && current) {
      await logCalibration({
        exercise_id: current.exercise.id,
        predicted_reps: calibration.predicted,
        actual_reps: reps,
      });
    }

    setCalibration(null);
    const tests = await calibrationHistory(3);
    const bias = rirBias(
      tests.map((t) => ({ predicted_reps: t.predicted_reps ?? 0, reps: t.reps }))
    );
    if (bias !== null) {
      await saveProgramState({ rir_bias: bias });
      setHint(
        `Twoja średnia pomyłka: ${bias > 0 ? "+" : ""}${toPl(bias, 1)} powtórzeń względem deklaracji.`
      );
    }
  }

  // ---------------------------------------------------------------- zakończenie
  async function finish() {
    const byExercise = new Map<string, number>();
    for (const s of sets) byExercise.set(s.exercise_id, (byExercise.get(s.exercise_id) ?? 0) + 1);

    const planned = visiblePlan.length;
    const covered = visiblePlan.filter((p) => (byExercise.get(p.exercise.id) ?? 0) > 0).length;
    const solid = [...byExercise.values()].filter((n) => n >= 2).length;

    const status =
      minimal && covered >= Math.min(MINIMAL_EXERCISES, planned)
        ? "minimal"
        : covered === planned && planned > 0
          ? "full"
          : solid >= 2
            ? "minimal"
            : "abandoned";

    const note = [session.note, minimal ? "minimum" : null, holdSeen ? "hold" : null]
      .filter(Boolean)
      .join(" ");

    const updated = await updateSession(session.id, {
      status,
      finished_at: new Date().toISOString(),
      note: note || null,
    });
    onFinish(updated);
  }

  if (!current) {
    return (
      <main className="sy-session">
        <div className="sy-session__top">
          <span className="sy-session__where">{template.name_pl}</span>
        </div>
        <p className="sy-note">Plan tego treningu nie jest jeszcze na urządzeniu.</p>
      </main>
    );
  }

  const target = current.position;
  const canCalibrate =
    !minimal &&
    currentSets.length + 1 === targetSets &&
    shouldOfferCalibration(lastCalibrationAt, {
      is_compound: current.exercise.is_compound,
      slug: current.exercise.slug,
    });

  return (
    <main className="sy-session">
      <div className="sy-session__top">
        <span className="sy-session__where">
          {template.name_pl}
          {minimal ? " · minimum" : ` · seria ${currentSets.length + 1} z ${targetSets}`}
        </span>
        <button
          type="button"
          className="sy-session__exit"
          aria-label="Wyjdź z sesji"
          onClick={() => setExitAsk(true)}
        >
          ✕
        </button>
      </div>

      {restEndsAt > 0 && (
        <RestTimer
          endsAt={restEndsAt}
          total={restTotal}
          onDone={() => {
            notifyRestOver();
            setRestEndsAt(0);
          }}
        />
      )}

      <div className="sy-session__body">
        <button type="button" className="sy-exercise" onClick={() => setPicker(true)}>
          <span>{current.exercise.name_pl}</span>
          <span className="sy-exercise__switch">zmień</span>
        </button>

        <p className="sy-target">
          <span>
            {targetSets} × {target.rep_min}-{target.rep_max}
          </span>
          <SourceChip sourceKey="schoenfeld2017" />
          {target.target_rir && (
            <>
              <span> · RIR {target.target_rir}</span>
              <SourceChip sourceKey="robinson2024" />
            </>
          )}
          <span> · {Math.round(target.rest_seconds / 60)} min</span>
          <SourceChip sourceKey="schoenfeld2016rest" />
        </p>

        <div className="sy-last">
          <span className="sy-last__label">Tydzień temu</span>
          <p className="sy-last__value">
            {previous.length === 0
              ? "Brak danych - to pierwsze wejście w to ćwiczenie."
              : `${formatKg(previous[0].weight_kg)} kg × ${previous.map((s) => s.reps).join(", ")}`}
          </p>
        </div>

        {calibration ? (
          <p className="sy-hint">
            Seria do faktycznego upadku. Zapisz tyle powtórzeń, ile realnie zrobisz.
          </p>
        ) : null}

        <div className="sy-steppers">
          <Stepper
            id="set-weight"
            label="Ciężar"
            value={weight}
            step={current.exercise.increment_kg}
            decimals={2}
            onChange={setWeight}
          />
          <Stepper
            id="set-reps"
            label="Powt."
            value={reps}
            step={1}
            decimals={0}
            onChange={setReps}
          />
          <Stepper
            id="set-rir"
            label="RIR"
            value={rir}
            step={1}
            max={6}
            decimals={0}
            onChange={setRir}
          />
        </div>

        <button type="button" className="sy-save" onClick={() => void save()}>
          {editing ? "Zapisz zmianę" : "Zapisz serię"}
        </button>

        {canCalibrate && !calibration && (
          <button
            type="button"
            className="sy-btn sy-btn--ghost"
            onClick={() => setCalibration({ predicted: reps })}
          >
            Test kalibracji RIR
            <SourceChip sourceKey="steele2017" />
          </button>
        )}

        {hint && <p className="sy-hint">{hint}</p>}

        {currentSets.length > 0 && (
          <ul className="sy-logged">
            {currentSets.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="sy-logged__item"
                  aria-current={editing?.id === s.id}
                  onClick={() => {
                    setEditing(s);
                    setWeight(s.weight_kg);
                    setReps(s.reps);
                    setRir(s.rir ?? 2);
                  }}
                >
                  ✓ {formatKg(s.weight_kg)}×{s.reps}
                  {s.rir !== null && ` RIR${s.rir}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sy-session__foot">
        {!minimal && (
          <button
            type="button"
            className="sy-btn sy-btn--ghost"
            onClick={() => {
              setMinimal(true);
              setIndex((i) => Math.min(i, MINIMAL_EXERCISES - 1));
            }}
          >
            Tryb minimum
          </button>
        )}
        <button type="button" className="sy-btn sy-btn--ghost" onClick={() => setPainOpen(true)}>
          Coś boli
        </button>
        <button type="button" className="sy-btn" onClick={() => void finish()}>
          Zakończ
        </button>
      </div>

      {/* Jedyna rzecz, która ma prawo przerwać trening komunikatem */}
      <PainLogSheet open={painOpen} onClose={() => setPainOpen(false)} exerciseId={current?.exercise.id} />

      <Sheet open={picker} title="Ćwiczenie" onClose={() => setPicker(false)}>
        {visiblePlan.map((p, i) => (
          <SheetOption
            key={p.exercise.id}
            label={p.exercise.name_pl}
            state={`${sets.filter((s) => s.exercise_id === p.exercise.id).length}/${
              minimal ? MINIMAL_SETS : p.position.target_sets
            }`}
            pressed={i === index}
            onClick={() => {
              setIndex(i);
              setHint(null);
              setPicker(false);
            }}
          />
        ))}
      </Sheet>

      <Sheet open={exitAsk} title="Przerwać sesję?" onClose={() => setExitAsk(false)}>
        <p>
          Zapisane serie zostają. Sesja dostanie status wynikający z tego, ile zdążyłeś zrobić.
        </p>
        <SheetOption label="Zakończ i zapisz" onClick={() => void finish()} />
        <SheetOption label="Wróć do sesji" onClick={() => setExitAsk(false)} />
      </Sheet>
    </main>
  );
}
