"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { todayIso } from "@/lib/day";
import {
  dailyLogsSince,
  exerciseMap,
  personalRecords,
  recentSessions,
  setsSince,
  snapshots,
} from "@/lib/db/queries";
import { saveSnapshot } from "@/lib/db/repo";
import { shiftIso, proteinTarget, weightSummary, wakeTimeSd } from "@/lib/domain/measure";
import { buildSnapshot } from "@/lib/domain/metrics";
import { weekStart } from "@/lib/domain/schedule";
import type { IsoDate, LocalProgramState, LocalWeeklySnapshot } from "@/types";

/**
 * Archiwum tygodni. Najcenniejsza część aplikacji po roku używania: pozwala wrócić
 * do tygodnia 3 i zobaczyć, jak było naprawdę. Migawka raz zamknięta się nie zmienia,
 * nawet jeśli brakujący wpis uzupełnimy później.
 */
export function WeekHistory({ state }: { state: LocalProgramState }) {
  const [rows, setRows] = useState<LocalWeeklySnapshot[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setRows(await snapshots()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const today = todayIso();
  const lastClosedWeek = shiftIso(isoOf(weekStart(new Date())), -7);
  const alreadyClosed = rows.some((r) => r.week_start === lastClosedWeek);

  async function closeWeek() {
    setBusy(true);
    try {
      const [sessions, sets, muscles, logs, prs] = await Promise.all([
        recentSessions(21),
        setsSince(21),
        exerciseMap(),
        dailyLogsSince(21),
        personalRecords(),
      ]);

      const weekEnd = shiftIso(lastClosedWeek, 6);
      const average = weightSummary(logs, weekEnd, state.weighing_frequency === "weekly" ? "weekly" : "daily").average;

      const snapshot = buildSnapshot({
        weekStart: lastClosedWeek,
        programWeek: state.program_week,
        sessions,
        sets,
        muscleOf: (id) => muscles.get(id)?.muscle_group,
        logs,
        proteinTarget: proteinTarget(average, state.protein_per_kg),
        wakeSd: wakeTimeSd(logs.filter((l) => l.log_date >= lastClosedWeek && l.log_date <= weekEnd)),
        prsCount: prs.filter((p) => p.achieved_on >= lastClosedWeek && p.achieved_on <= weekEnd).length,
        emergencyMode: state.emergency_mode,
      });

      await saveSnapshot(snapshot, note.trim() || undefined);
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sy-section">
      <h2 className="sy-section__title">Historia tygodni</h2>

      {!alreadyClosed && (
        <>
          <p className="sy-sub">
            Przegląd tygodnia - dwie minuty. Zamknięcie zapisuje tydzień{" "}
            <span className="num">{lastClosedWeek}</span> na stałe.
          </p>
          <div className="sy-mod__row">
            <input
              className="sy-input"
              placeholder="Notatka do tygodnia (opcjonalnie)"
              aria-label="Notatka do tygodnia"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" className="sy-btn" disabled={busy} onClick={() => void closeWeek()}>
              {busy ? "Zapisuję…" : "Zamknij tydzień"}
            </button>
          </div>
        </>
      )}

      {rows.length === 0 ? (
        <EmptyState>Pierwsza migawka pojawi się po zamknięciu tygodnia.</EmptyState>
      ) : (
        rows.map((row) => (
          <div key={row.week_start} className="sy-mod">
            <button
              type="button"
              className="sy-module"
              onClick={() => setOpen(open === row.week_start ? null : row.week_start)}
            >
              <span>
                Tydzień od <span className="num">{row.week_start}</span>
              </span>
              <span className="sy-module__note">
                {row.sessions_done} / {row.sessions_planned} sesji
              </span>
            </button>

            {open === row.week_start && (
              <>
                <DataTable
                  caption={`Zapis tygodnia ${row.week_start} - program: tydzień ${row.program_week}`}
                  columns={[
                    { key: "co", label: "Co" },
                    { key: "ile", label: "Ile", numeric: true },
                  ]}
                  rows={[
                    { co: "Sesje (w tym minimum)", ile: `${row.sessions_done} (${row.sessions_minimal})` },
                    { co: "Tonaż", ile: row.total_tonnage_kg ? `${row.total_tonnage_kg} kg` : "-" },
                    { co: "Średnia waga", ile: row.weight_avg7_kg ? `${row.weight_avg7_kg} kg` : "-" },
                    { co: "Białko średnio", ile: row.protein_avg_g ? `${row.protein_avg_g} g` : "-" },
                    { co: "Dni z trafionym białkiem", ile: row.protein_hit_days ?? "-" },
                    { co: "Kalorie średnio", ile: row.calories_avg_kcal ? `${row.calories_avg_kcal} kcal` : "-" },
                    { co: "Rozrzut pobudki", ile: row.wake_time_sd_min ? `${row.wake_time_sd_min} min` : "-" },
                    { co: "Jakość snu", ile: row.sleep_quality_avg ?? "-" },
                    { co: "Dni z kreatyną", ile: row.creatine_days ?? "-" },
                    { co: "Rekordy", ile: row.prs_count ?? 0 },
                  ]}
                />
                {row.sets_by_muscle && Object.keys(row.sets_by_muscle).length > 0 && (
                  <p className="sy-sub">
                    Serie na partię:{" "}
                    {Object.entries(row.sets_by_muscle)
                      .map(([m, n]) => `${m} ${n}`)
                      .join(" · ")}
                  </p>
                )}
                {row.note && <p className="sy-sub">Notatka: {row.note}</p>}
              </>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function isoOf(date: Date): IsoDate {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` as IsoDate;
}
