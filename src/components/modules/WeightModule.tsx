"use client";

import { useCallback, useEffect, useState } from "react";
import { Chart } from "@/components/ui/Chart";
import { Stat } from "@/components/ui/Stat";
import { todayIso } from "@/lib/day";
import { dailyLogsSince } from "@/lib/db/queries";
import { saveDailyLog } from "@/lib/db/repo";
import { WEIGHT_WINDOW, shiftIso, weightDelta, weightSummary } from "@/lib/domain/measure";
import type { IsoDate, LocalDailyLog, LocalProgramState } from "@/types";

const HISTORY_DAYS = 28;

/**
 * Waga (R4). Liczbą główną jest ZAWSZE średnia - dzienny pomiar pojawia się
 * wyłącznie małym drukiem, jako dana wejściowa. Dopóki pomiarów jest za mało,
 * nie pokazujemy w tym miejscu niczego innego: surowa dzienna waga w roli liczby
 * głównej wywołuje reakcje na szum (woda, zawartość przewodu pokarmowego).
 */
export function WeightModule({ state }: { state: LocalProgramState }) {
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  const today = todayIso();
  const frequency = state.weighing_frequency === "weekly" ? "weekly" : "daily";

  const load = useCallback(async () => {
    const rows = await dailyLogsSince(HISTORY_DAYS * 2);
    setLogs(rows);
    const todayRow = rows.find((r) => r.log_date === today);
    setDraft(
      todayRow?.weight_kg != null
        ? String(todayRow.weight_kg).replace(".", ",")
        : lastWeight(rows) != null
          ? String(lastWeight(rows)).replace(".", ",")
          : ""
    );
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = weightSummary(logs, today, frequency);
  const delta = weightDelta(logs, today, frequency);

  async function save() {
    const value = Number(draft.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    await saveDailyLog(today, { weight_kg: Math.round(value * 10) / 10 });
    setSaved(true);
    await load();
  }

  const chart = buildChart(logs, today, frequency);

  return (
    <section className="sy-mod">
      <div className="sy-mod__head">
        <span className="sy-mod__name">Waga</span>
        <span className="sy-mod__note">
          {state.weighing_frequency === "weekly" ? "raz w tygodniu" : "codziennie"}
        </span>
      </div>

      {summary.average !== null ? (
        <>
          <Stat
            label={WEIGHT_WINDOW[frequency].label}
            value={summary.average.toFixed(1).replace(".", ",")}
            unit="kg"
            variant="hero"
          />
          <p className="sy-sub">
            {delta === null
              ? "Zmianę policzę, gdy uzbiera się drugi taki okres."
              : `${formatDelta(delta)} / 2 tyg.`}
            {summary.today !== null && ` · dziś: ${String(summary.today).replace(".", ",")}`}
          </p>
        </>
      ) : (
        <p className="sy-sub">
          Zbieram dane. Średnia pojawi się po{" "}
          <span className="num">{WEIGHT_WINDOW[frequency].minCount}</span> pomiarach
          {summary.missing > 0 && (
            <>
              {" "}
              - brakuje <span className="num">{summary.missing}</span>
            </>
          )}
          .
          {summary.today !== null && (
            <>
              {" "}
              Dziś: <span className="num">{String(summary.today).replace(".", ",")}</span> kg.
            </>
          )}
        </p>
      )}

      <div className="sy-mod__row">
        <input
          className="sy-input num"
          inputMode="decimal"
          aria-label="Waga w kilogramach"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
        />
        <button type="button" className="sy-btn" onClick={() => void save()}>
          {saved ? "Zapisane" : "Zapisz wagę"}
        </button>
      </div>

      {chart && (
        <Chart
          series={[
            { values: chart.daily, variant: "pess" },
            { values: chart.average, variant: "main" },
          ]}
          yMin={chart.yMin}
          yMax={chart.yMax}
          yTicks={chart.ticks}
          xFirst={chart.first}
          xLast={chart.last}
          ariaLabel={chart.aria}
        />
      )}
    </section>
  );
}

function lastWeight(rows: LocalDailyLog[]): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].weight_kg != null) return rows[i].weight_kg;
  }
  return null;
}

/** Minus zapisujemy znakiem, a nie kolorem - spadek i wzrost są tu tak samo neutralne. */
function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return `${sign}${Math.abs(delta).toFixed(1).replace(".", ",")} kg`;
}

/**
 * Dwie serie na wspólnej osi dni: pomiary dzienne wyciszone i linia średniej.
 * Dni bez ważenia przenoszą ostatnią znaną wartość - linia nie może udawać
 * wahań, których nie zmierzono.
 */
export function buildChart(
  logs: LocalDailyLog[],
  today: IsoDate,
  frequency: "daily" | "weekly"
): { daily: number[]; average: number[]; yMin: number; yMax: number; ticks: number[]; first: string; last: string; aria: string } | null {
  const days: IsoDate[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) days.push(shiftIso(today, -i));

  const daily: number[] = [];
  const average: number[] = [];
  let carry: number | null = null;

  for (const day of days) {
    const row = logs.find((l) => l.log_date === day);
    if (row?.weight_kg != null) carry = row.weight_kg;
    if (carry === null) continue;
    daily.push(carry);
    average.push(weightSummary(logs, day, frequency).average ?? carry);
  }

  if (daily.length < 2) return null;

  const all = [...daily, ...average];
  const lo = Math.floor(Math.min(...all) - 0.5);
  const hi = Math.ceil(Math.max(...all) + 0.5);
  const mid = Math.round(((lo + hi) / 2) * 10) / 10;

  const firstIndex = days.length - daily.length;
  const trend = average[average.length - 1] - average[0];

  return {
    daily,
    average,
    yMin: lo,
    yMax: hi,
    ticks: [lo, mid, hi],
    first: days[firstIndex].slice(5).replace("-", "."),
    last: today.slice(5).replace("-", "."),
    aria:
      Math.abs(trend) < 0.2
        ? "Średnia wagi utrzymuje się na tym samym poziomie."
        : trend < 0
          ? "Średnia wagi opada w całym okresie."
          : "Średnia wagi rośnie w całym okresie.",
  };
}
