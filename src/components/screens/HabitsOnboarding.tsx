"use client";

import { useEffect, useState } from "react";
import { SourceChip } from "@/components/ui/SourceChip";
import { saveIfThenPlan, saveWoop } from "@/lib/db/repo";
import { activePlans } from "@/lib/db/queries";

const REQUIRED = 2;

const SUGGESTED_START = [
  "Jeśli jest dzień treningowy i wybije 18:00, to zakładam buty i wychodzę na siłownię.",
  "Jeśli robię poranną kawę, to obok kubka odmierzam 5 g kreatyny.",
  "Jeśli robię śniadanie, to najpierw odkładam źródło białka na talerz.",
];

const SUGGESTED_FAILURE = [
  "Jeśli nie zdążę na siłownię przed zamknięciem, to robię 15-minutowe minimum następnego dnia rano.",
  "Jeśli opuszczę jeden trening, to następny odbywa się bez wyjątku.",
  "Jeśli jestem na wyjeździe bez siłowni, to robię 3 serie pompek i przysiadów i zapisuję jako zaliczone.",
  "Jeśli w piątek kładę się późno, to w sobotę i tak wstaję o stałej godzinie.",
];

/** Zdanie „jeśli X, to Y" rozbite na wyzwalacz i działanie. */
function split(sentence: string): { trigger_pl: string; action_pl: string } {
  const marker = sentence.toLowerCase().indexOf(", to ");
  if (marker === -1) return { trigger_pl: sentence, action_pl: sentence };
  return {
    trigger_pl: sentence.slice(0, marker).trim(),
    action_pl: sentence.slice(marker + 5).trim(),
  };
}

type Stage = "plans" | "woop" | "done";

/**
 * Onboarding nawykowy (R6). Blokujący: bez dwóch planów startowych i dwóch
 * na porażkę nie przechodzimy dalej. Plany na porażkę są tu ważniejsze -
 * d = 0,77 wobec 0,65 dla planów startowych.
 */
export function HabitsOnboarding({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>("plans");
  const [start, setStart] = useState<string[]>([]);
  const [failure, setFailure] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [customType, setCustomType] = useState<"start" | "failure">("start");
  const [busy, setBusy] = useState(false);

  const ready = start.length >= REQUIRED && failure.length >= REQUIRED;

  function toggle(list: string[], set: (v: string[]) => void, text: string) {
    set(list.includes(text) ? list.filter((t) => t !== text) : [...list, text]);
  }

  async function savePlans() {
    setBusy(true);
    for (const text of start) await saveIfThenPlan({ type: "start", ...split(text) });
    for (const text of failure) await saveIfThenPlan({ type: "failure", ...split(text) });
    setBusy(false);
    setStage("woop");
  }

  if (stage === "woop") {
    return <WoopWizard onDone={onDone} />;
  }

  return (
    <main className="sy-screen">
      <h1 className="sy-title sy-title--entry">Plany na konkretne momenty</h1>

      <p className="sy-lead">
        Zdania „jeśli X, to Y" działają lepiej niż postanowienia, bo przypinają działanie do
        konkretnego momentu, a nie do chęci.
      </p>
      <p style={{ color: "var(--ink-2)", marginBottom: 26 }}>
        W metaanalizie 94 badań efekt wyniósł <span className="num">d = 0,65</span> na realizację
        celu i <span className="num">d = 0,77</span> na niedopuszczenie do porzucenia rozpoczętego
        działania
        <SourceChip sourceKey="gollwitzer2006" />. Plany na porażkę działają mocniej niż plany na
        start - dlatego prosimy o oba rodzaje.
      </p>

      <PlanGroup
        title={`Na porażkę - wybierz co najmniej ${REQUIRED}`}
        options={SUGGESTED_FAILURE}
        chosen={failure}
        onToggle={(t) => toggle(failure, setFailure, t)}
      />

      <PlanGroup
        title={`Na start - wybierz co najmniej ${REQUIRED}`}
        options={SUGGESTED_START}
        chosen={start}
        onToggle={(t) => toggle(start, setStart, t)}
      />

      <section className="sy-section">
        <h2 className="sy-section__title">Własne zdanie</h2>
        <textarea
          className="sy-input"
          rows={3}
          placeholder="Jeśli…, to…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <div className="flex gap-2.5">
          <button
            type="button"
            className="sy-btn sy-btn--ghost"
            onClick={() => setCustomType(customType === "start" ? "failure" : "start")}
          >
            {customType === "start" ? "Typ: start" : "Typ: porażka"}
          </button>
          <button
            type="button"
            className="sy-btn sy-btn--ghost"
            disabled={!custom.toLowerCase().includes("jeśli") || !custom.toLowerCase().includes("to")}
            onClick={() => {
              if (customType === "start") setStart([...start, custom.trim()]);
              else setFailure([...failure, custom.trim()]);
              setCustom("");
            }}
          >
            Dodaj
          </button>
        </div>
      </section>

      <button type="button" className="sy-save" disabled={!ready || busy} onClick={() => void savePlans()}>
        {busy ? "Zapisuję…" : "Dalej"}
      </button>
      {!ready && (
        <p className="sy-alert">
          Brakuje: {Math.max(0, REQUIRED - failure.length)} na porażkę,{" "}
          {Math.max(0, REQUIRED - start.length)} na start.
        </p>
      )}
    </main>
  );
}

function PlanGroup({
  title,
  options,
  chosen,
  onToggle,
}: {
  title: string;
  options: string[];
  chosen: string[];
  onToggle: (text: string) => void;
}) {
  return (
    <section className="sy-section">
      <h2 className="sy-section__title">{title}</h2>
      <ul className="sy-list" style={{ borderTop: "1px solid var(--rule)" }}>
        {options.map((text) => (
          <li key={text}>
            <button
              type="button"
              className="sy-choice"
              aria-pressed={chosen.includes(text)}
              onClick={() => onToggle(text)}
            >
              <span className="sy-choice__mark">{chosen.includes(text) ? "✓" : ""}</span>
              <span>{text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const OUTCOME_SECONDS = 20;

/**
 * WOOP. Krok „Rezultat" ma twardy licznik 20 s i sam przechodzi dalej -
 * ograniczenie ekspozycji na fantazję jest tym, co odróżnia WOOP od wizualizacji
 * (Kappes i Oettingen 2011: fantazje obniżają mobilizację).
 */
export function WoopWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [wish, setWish] = useState("");
  const [outcome, setOutcome] = useState("");
  const [obstacle, setObstacle] = useState("");
  const [plan, setPlan] = useState("");
  const [left, setLeft] = useState(OUTCOME_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== 1) return;
    setLeft(OUTCOME_SECONDS);
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          setStep(2);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [step]);

  async function finish() {
    setBusy(true);
    await saveWoop({ wish, outcome, obstacle, plan });
    setBusy(false);
    onDone();
  }

  const steps = [
    {
      label: "Życzenie",
      hint: "Konkretne i wymagające, ale realne. Nie „chcę być koksem”, tylko „chcę przez najbliższe 8 tygodni zrobić wszystkie 32 treningi”.",
      value: wish,
      set: setWish,
      ok: wish.trim().length >= 10,
    },
    {
      label: "Rezultat",
      hint: "Wyobraź sobie najlepszy efekt. Krótko - ten krok jest celowo ograniczony w czasie.",
      value: outcome,
      set: setOutcome,
      ok: true,
    },
    {
      label: "Przeszkoda",
      hint: "Co konkretnie, wewnątrz Ciebie, stanie na drodze? Nie „brak czasu” - to wymówka zewnętrzna.",
      value: obstacle,
      set: setObstacle,
      ok: obstacle.trim().length >= 15,
    },
    {
      label: "Plan",
      hint: "Zdanie jeśli-to na tę konkretną przeszkodę.",
      value: plan,
      set: setPlan,
      ok: plan.toLowerCase().includes("jeśli") && plan.toLowerCase().includes("to"),
    },
  ];

  const s = steps[step];

  return (
    <main className="sy-screen">
      <h1 className="sy-title sy-title--entry">WOOP</h1>
      <p className="sy-lead">
        Krok {step + 1} z 4 · {s.label}
      </p>

      <p style={{ color: "var(--ink-2)", marginBottom: 16 }}>{s.hint}</p>

      <textarea
        className="sy-input"
        rows={4}
        value={s.value}
        onChange={(e) => s.set(e.target.value)}
        autoFocus
      />

      {step === 1 && (
        <p className="sy-label" style={{ marginTop: 10 }}>
          Dalej za <span className="num">{left}</span> s
        </p>
      )}

      {step < 3 ? (
        <button
          type="button"
          className="sy-save"
          disabled={!s.ok}
          onClick={() => setStep(step + 1)}
        >
          Dalej
        </button>
      ) : (
        <button type="button" className="sy-save" disabled={!s.ok || busy} onClick={() => void finish()}>
          {busy ? "Zapisuję…" : "Zapisz WOOP"}
        </button>
      )}

      {!s.ok && step !== 1 && (
        <p className="sy-alert">
          {step === 3
            ? "Zdanie musi zawierać „jeśli” i „to”."
            : `Minimum ${step === 0 ? 10 : 15} znaków.`}
        </p>
      )}
    </main>
  );
}

/** Czy onboarding nawykowy jest już za nami. */
export async function habitsReady(): Promise<boolean> {
  const [start, failure] = await Promise.all([activePlans("start"), activePlans("failure")]);
  return start.length >= REQUIRED && failure.length >= REQUIRED;
}
