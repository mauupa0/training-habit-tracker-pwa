"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { logPain } from "@/lib/db/repo";
import type { BodyPart, PainEntry } from "@/types";

const PARTS: Array<[BodyPart, string]> = [
  ["bark", "Bark"],
  ["lokiec", "Łokieć"],
  ["nadgarstek", "Nadgarstek"],
  ["dol_plecow", "Dół pleców"],
  ["biodro", "Biodro"],
  ["kolano", "Kolano"],
  ["inne", "Inne"],
];

const CONTEXTS: Array<[NonNullable<PainEntry["context"]>, string]> = [
  ["podczas_cwiczenia", "W trakcie ćwiczenia"],
  ["po_treningu", "Po treningu"],
  ["niezaleznie", "Niezależnie od treningu"],
];

/**
 * Zgłoszenie bólu. Aplikacja tego nie ocenia i nie diagnozuje - zapisuje, a przy
 * powtarzalności albo silnym bólu odsyła do fizjoterapeuty. To jedyne miejsce,
 * które ma prawo przerwać sesję komunikatem.
 */
export function PainLogSheet({
  open,
  onClose,
  exerciseId,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId?: string | null;
}) {
  const [part, setPart] = useState<BodyPart>("bark");
  const [severity, setSeverity] = useState(2);
  const [context, setContext] = useState<NonNullable<PainEntry["context"]>>("podczas_cwiczenia");
  const [note, setNote] = useState("");
  const [signal, setSignal] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const result = await logPain({
      body_part: part,
      severity,
      context,
      exercise_id: exerciseId ?? null,
      note: note.trim() || null,
    });
    setSignal(result.signal);
    setSaved(true);
    setNote("");
  }

  function close() {
    setSaved(false);
    setSignal(null);
    onClose();
  }

  return (
    <Sheet open={open} title="Coś boli" onClose={close}>
      {saved ? (
        <>
          <p>Zapisane.</p>
          {signal && <p className="sy-alert">{signal}</p>}
          <p style={{ color: "var(--ink-2)" }}>
            Aplikacja nie ocenia bólu i nie proponuje ćwiczeń zastępczych. Zapis służy temu, żeby
            dało się zobaczyć wzorzec - i pokazać go komuś, kto potrafi go zbadać.
          </p>
          <button type="button" className="sy-btn" onClick={close}>
            Zamknij
          </button>
        </>
      ) : (
        <>
          <p className="sy-label">Miejsce</p>
          <div className="sy-tiles">
            {PARTS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="sy-tile"
                aria-pressed={part === key}
                onClick={() => setPart(key)}
                style={part === key ? { borderColor: "var(--stamp)" } : undefined}
              >
                <span>{label}</span>
              </button>
            ))}
          </div>

          <p className="sy-label" style={{ marginTop: 14 }}>
            Natężenie
          </p>
          <div className="sy-scale" role="group" aria-label="Natężenie bólu w skali 1-5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="sy-scale__item num"
                aria-pressed={severity === n}
                aria-label={`Natężenie ${n} z 5`}
                onClick={() => setSeverity(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <p className="sy-label" style={{ marginTop: 14 }}>
            Kiedy
          </p>
          {CONTEXTS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="sy-module"
              aria-pressed={context === key}
              onClick={() => setContext(key)}
            >
              <span>{label}</span>
              <span className="sy-module__note">{context === key ? "wybrane" : ""}</span>
            </button>
          ))}

          <input
            className="sy-input"
            style={{ marginTop: 14 }}
            placeholder="Notatka (opcjonalnie)"
            aria-label="Notatka"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button type="button" className="sy-btn" onClick={() => void save()}>
            Zapisz zgłoszenie
          </button>
        </>
      )}
    </Sheet>
  );
}
