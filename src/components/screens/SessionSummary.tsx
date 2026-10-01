"use client";

import { useEffect, useState } from "react";
import { Stat } from "@/components/ui/Stat";
import { formatKg } from "@/lib/domain/progression";
import { bestWeightFor, personalRecords, plannedExercises, setsOfSession } from "@/lib/db/queries";
import { recordSentence } from "@/lib/domain/metrics";
import type { LocalSession, WorkoutTemplate } from "@/types";

type Line = { name: string; sets: number; text: string; record: boolean };

/**
 * Podsumowanie po sesji. Bez gratulacji i bez animacji - same fakty (R3).
 * Rekord dostaje jedno zdanie, nie odznakę.
 */
export function SessionSummary({
  session,
  template,
  onClose,
}: {
  session: LocalSession;
  template: WorkoutTemplate;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [records, setRecords] = useState<string[]>([]);
  const [tonnage, setTonnage] = useState(0);
  const [setCount, setSetCount] = useState(0);

  useEffect(() => {
    void (async () => {
      const sets = await setsOfSession(session.id);
      const plan = await plannedExercises(session.template_id);

      setSetCount(sets.length);
      setTonnage(sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0));

      const rows: Line[] = [];
      for (const { exercise } of plan) {
        const mine = sets.filter((s) => s.exercise_id === exercise.id);
        if (mine.length === 0) continue;

        const heaviest = mine.reduce((max, s) => Math.max(max, s.weight_kg), 0);
        const best = await bestWeightFor(exercise.id, session.id);
        rows.push({
          name: exercise.name_pl,
          sets: mine.length,
          text: `${formatKg(heaviest)} kg × ${mine.map((s) => s.reps).join(", ")}`,
          record: best !== null && heaviest > best,
        });
      }
      setLines(rows);

      // Rekordy zapisane w trakcie tej sesji - czytamy je z bazy, bo powstały offline
      // przy każdej serii, a nie dopiero teraz.
      const mine = (await personalRecords()).filter((r) => r.session_id === session.id);
      const names = new Map(plan.map(({ exercise }) => [exercise.id, exercise.name_pl]));
      setRecords(
        mine.map((r) =>
          recordSentence(names.get(r.exercise_id) ?? "Ćwiczenie", {
            record_type: r.record_type,
            value: r.value,
            previous_value: r.previous_value,
            weight_kg: r.weight_kg,
            reps: r.reps,
            rir: r.rir,
          })
        )
      );
    })();
  }, [session.id, session.template_id]);

  const statusText =
    session.status === "minimal"
      ? "Zapisane. Liczy się."
      : session.status === "abandoned"
        ? "Zapisane to, co zdążyłeś zrobić."
        : "Zapisane.";

  return (
    <main className="sy-screen">
      <header className="sy-head">
        <h1 className="sy-title">{template.name_pl}</h1>
      </header>

      <p className="sy-lead">{statusText}</p>

      <section className="sy-panel">
        <Stat label="Tonaż" value={formatKg(Math.round(tonnage))} unit="kg" variant="hero" />
        <p className="mt-3 text-[14px]" style={{ color: "var(--ink-2)" }}>
          Serie: <span className="num">{setCount}</span>
        </p>
      </section>

      {records.length > 0 && (
        <section className="sy-section">
          <h2 className="sy-section__title">Rekordy</h2>
          {/* Zdania faktu, jedno pod drugim. Bez ikon, animacji i dźwięku (faza 4B, sekcja 8). */}
          {records.map((r) => (
            <p key={r} className="sy-sub">
              {r}
            </p>
          ))}
        </section>
      )}

      <section className="sy-section">
        <h2 className="sy-section__title">Co poszło</h2>
        <ul className="sy-list">
          {lines.map((l) => (
            <li key={l.name} className="sy-list__row">
              <span>
                <span className="sy-list__name">{l.name}</span>
                {l.record && (
                  <span className="sy-list__note"> · pierwszy raz na tym ciężarze</span>
                )}
              </span>
              <span className="sy-list__meta">{l.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className="sy-btn" onClick={onClose}>
        Wróć do „Dziś”
      </button>
    </main>
  );
}
