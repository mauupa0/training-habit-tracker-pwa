"use client";

import { useCallback, useEffect, useState } from "react";
import { Chart } from "@/components/ui/Chart";
import { Sheet } from "@/components/ui/Sheet";
import { SourceChip } from "@/components/ui/SourceChip";
import { todayIso } from "@/lib/day";
import { dailyLogsSince } from "@/lib/db/queries";
import { saveDailyLog } from "@/lib/db/repo";
import { formatWakeSd, wakeMinutes, wakeTimeSd } from "@/lib/domain/measure";
import type { SourceKey } from "@/lib/sources/registry";
import type { LocalDailyLog, LocalProgramState } from "@/types";

const HISTORY_DAYS = 28;

/** Fakty z karty wiedzy. Każdy ma źródło - liczba bez publikacji jest tu bezwartościowa. */
const FACTS: Array<{ text: string; source: SourceKey }> = [
  {
    text: "Tydzień po 5 h snu obniżył dzienny testosteron o 10-15% u zdrowych młodych mężczyzn.",
    source: "leproult2011",
  },
  {
    text: "Przy tej samej restrykcji kalorycznej krótki sen oznaczał mniej utraconego tłuszczu i więcej utraconej masy beztłuszczowej.",
    source: "nedeltcheva2010",
  },
  {
    text: "Skrócenie snu obniżyło leptynę, podniosło grelinę i zwiększyło apetyt.",
    source: "spiegel2004",
  },
  {
    text: "Osoby, które dodały ~1,2 h snu, spontanicznie jadły o ~270 kcal mniej dziennie - bez instrukcji dietetycznych.",
    source: "tasali2022",
  },
];

/**
 * Sen. Mierzymy godzinę pobudki, bo to ona kotwiczy rytm dobowy, i pilnujemy
 * SPÓJNOŚCI, nie długości: aplikacja nigdy nie ocenia, ile się spało.
 */
export function SleepModule({ state }: { state: LocalProgramState }) {
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);
  const [wake, setWake] = useState("");
  const [knowledge, setKnowledge] = useState(false);

  const today = todayIso();
  const load = useCallback(async () => {
    const rows = await dailyLogsSince(HISTORY_DAYS);
    setLogs(rows);
    const row = rows.find((r) => r.log_date === today);
    if (row?.wake_time) setWake(row.wake_time.slice(0, 5));
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayRow = logs.find((r) => r.log_date === today);
  const sd = wakeTimeSd(logs);
  const chart = buildWakeChart(logs);

  async function saveWake(value: string) {
    setWake(value);
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    await saveDailyLog(today, { wake_time: value });
    await load();
  }

  async function saveQuality(value: number) {
    await saveDailyLog(today, { sleep_quality: value });
    await load();
  }

  return (
    <section className="sy-mod">
      <div className="sy-mod__head">
        <span className="sy-mod__name">Sen</span>
        <button type="button" className="sy-mod__note" onClick={() => setKnowledge(true)}>
          co o tym wiadomo
        </button>
      </div>

      <p className="sy-sub">
        {formatWakeSd(sd)}
        {sd !== null && " · Im mniejsze, tym stabilniejszy rytm."}
      </p>

      <div className="sy-mod__row">
        <input
          className="sy-input num"
          type="time"
          aria-label="Godzina pobudki"
          value={wake}
          onChange={(e) => void saveWake(e.target.value)}
        />
        <span className="sy-mod__note">godzina pobudki</span>
      </div>

      <div className="sy-scale" role="group" aria-label="Jakość snu w skali 1-5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="sy-scale__item num"
            aria-pressed={todayRow?.sleep_quality === n}
            aria-label={`Jakość ${n} z 5`}
            onClick={() => void saveQuality(n)}
          >
            {n}
          </button>
        ))}
      </div>

      {chart && (
        <Chart
          series={[{ values: chart.values, variant: "main" }]}
          yMin={chart.yMin}
          yMax={chart.yMax}
          yTicks={chart.ticks}
          xFirst={chart.first}
          xLast={chart.last}
          yFormat={hhmm}
          ariaLabel="Godzina pobudki w kolejnych dniach - wykres pokazuje rozrzut, nie długość snu."
        />
      )}

      <Sheet open={knowledge} title="Sen" onClose={() => setKnowledge(false)}>
        {FACTS.map((f) => (
          <p key={f.source}>
            {f.text}
            <SourceChip sourceKey={f.source} />
          </p>
        ))}
        <p>
          Praktyka: stała godzina pobudki, nie zaśnięcia · przy 6 h nie skacz na 8, dodaj 30 min na
          dwa tygodnie · ostatnia kawa 8 h przed snem (okres półtrwania kofeiny 5-6 h) · telefon poza
          zasięgiem ręki, nie „w trybie nocnym".
        </p>
      </Sheet>
    </section>
  );
}

function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Wykres pobudek. Przy rozrzucie większym niż pół doby oś przestaje cokolwiek znaczyć
 * (pobudki po obu stronach północy), więc wtedy zostaje sama metryka rozrzutu.
 */
function buildWakeChart(
  logs: LocalDailyLog[]
): { values: number[]; yMin: number; yMax: number; ticks: number[]; first: string; last: string } | null {
  const points = logs
    .filter((l) => l.wake_time)
    .map((l) => ({ day: l.log_date, minutes: wakeMinutes(l.wake_time as string) }))
    .filter((p): p is { day: string; minutes: number } => p.minutes !== null);

  if (points.length < 3) return null;

  const values = points.map((p) => p.minutes);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi - lo > 720) return null;

  const pad = Math.max(30, Math.round((hi - lo) * 0.2));
  const yMin = lo - pad;
  const yMax = hi + pad;

  return {
    values,
    yMin,
    yMax,
    ticks: [yMin, Math.round((yMin + yMax) / 2), yMax],
    first: points[0].day.slice(5).replace("-", "."),
    last: points[points.length - 1].day.slice(5).replace("-", "."),
  };
}
