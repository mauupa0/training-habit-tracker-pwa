"use client";

import { useCallback, useEffect, useState } from "react";
import { todayIso } from "@/lib/day";
import { habitDays } from "@/lib/db/queries";
import { formatWakeSd, wakeTimeSd } from "@/lib/domain/measure";
import { habitHitRate, type HabitKey } from "@/lib/domain/metrics";
import { dailyLogsSince } from "@/lib/db/queries";
import type { LocalDailyLog, LocalHabitDaily } from "@/types";

const HABITS: Array<[HabitKey, string]> = [
  ["training_done", "Trening"],
  ["protein_hit", "Białko"],
  ["creatine_taken", "Kreatyna"],
  ["weight_logged", "Waga"],
];

const WINDOWS = [7, 28, 90];

/**
 * Kalendarz 90 dni i trafność w oknach. Świadomie BEZ łączonego „wyniku dnia":
 * każda liczba zbiorcza natychmiast staje się celem samym w sobie i wypacza zachowanie.
 * Trafność podana jest jako „24 z 28", nigdy jako procent z oceną.
 */
export function HabitsCalendar() {
  const [days, setDays] = useState<LocalHabitDaily[]>([]);
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);

  const load = useCallback(async () => {
    setDays(await habitDays(90));
    setLogs(await dailyLogsSince(28));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayIso();
  const byDate = new Map(days.map((d) => [d.log_date, d]));

  // 90 dni wstecz, w kolumnach po tygodniu - układ czytelny na 360 px
  const cells: string[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - i);
    cells.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }

  return (
    <>
      <div className="sy-grid90" role="img" aria-label="Ostatnie 90 dni: trening, białko, kreatyna, waga">
        {cells.map((date) => {
          const day = byDate.get(date);
          const marks = [
            day?.training_done === true,
            day?.protein_hit === true,
            day?.creatine_taken === true,
            day?.weight_logged === true,
          ];
          const filled = marks.filter(Boolean).length;
          return (
            <span
              key={date}
              className="sy-grid90__day"
              title={`${date}: ${filled} z 4`}
              data-level={filled}
            />
          );
        })}
      </div>

      {HABITS.map(([key, label]) => (
        <p className="sy-sub" key={key}>
          {label}:{" "}
          {WINDOWS.map((w, i) => {
            const r = habitHitRate(days, key, w, today);
            return (
              <span key={w}>
                {i > 0 && " · "}
                <span className="num">
                  {r.hit} z {r.of}
                </span>
              </span>
            );
          })}
        </p>
      ))}

      <p className="sy-sub">{formatWakeSd(wakeTimeSd(logs))}</p>
    </>
  );
}
