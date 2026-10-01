"use client";

import { useCallback, useEffect, useState } from "react";
import { Chart } from "@/components/ui/Chart";
import { forecastFor } from "@/lib/db/queries";
import {
  DIP_EXPLANATION,
  DIP_MONTHS,
  FORECAST_MIN_WEEKS,
  forecastVerdict,
  monthIndexOf,
  weeksOfData,
} from "@/lib/domain/metrics";
import { todayIso } from "@/lib/day";
import type { ForecastPoint, IsoDate } from "@/types";

/**
 * Zestawienie realnego wyniku z prognozą. Miejsce o największym potencjale do zrobienia
 * szkody, więc trzyma się trzech zasad: powyżej - stwierdzamy fakt bez gratulacji,
 * w paśmie - stwierdzamy fakt, poniżej - pokazujemy frekwencję zamiast oceny.
 */
export function ForecastPanel({
  metric,
  label,
  unit,
  actual,
  startedOn,
  attendance,
}: {
  metric: string;
  label: string;
  unit: string;
  actual: number | null;
  startedOn: IsoDate;
  attendance?: { done: number; planned: number; expected: number };
}) {
  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [showDip, setShowDip] = useState(false);

  const load = useCallback(async () => setPoints(await forecastFor(metric)), [metric]);
  useEffect(() => {
    void load();
  }, [load]);

  const today = todayIso();
  const weeks = weeksOfData(startedOn, today);
  const month = monthIndexOf(startedOn, today);
  const verdict = forecastVerdict(actual, points, metric, month, weeks, attendance);

  if (verdict.status === "too_early") {
    return (
      <p className="sy-sub">
        {verdict.message} Masz <span className="num">{weeks}</span> z{" "}
        <span className="num">{FORECAST_MIN_WEEKS}</span>.
      </p>
    );
  }

  if (points.length === 0) {
    return <p className="sy-sub">Brak prognozy. Tabela forecast_points jest pusta albo dane jeszcze się nie pobrały.</p>;
  }

  // Oś obejmuje dwa lata programu; realny wynik wchodzi jako pojedynczy znacznik,
  // bo mamy jedną wartość na dziś, a nie własną krzywą.
  const realistic = points.map((p) => p.value_realistic);
  const low = points.map((p) => p.value_pessimist ?? p.value_realistic);
  const high = points.map((p) => p.value_optimist ?? p.value_realistic);

  const all = [...realistic, ...low, ...high, ...(actual !== null ? [actual] : [])];
  const yMin = Math.floor(Math.min(...all) - 2);
  const yMax = Math.ceil(Math.max(...all) + 2);

  return (
    <>
      <Chart
        series={[
          { values: low, variant: "pess" },
          { values: high, variant: "opt" },
          { values: realistic, variant: "main" },
        ]}
        band={[low, high]}
        yMin={yMin}
        yMax={yMax}
        yTicks={[yMin, Math.round((yMin + yMax) / 2), yMax]}
        xFirst="start"
        xLast="24 mies."
        markers={
          actual !== null
            ? [{ index: month, label: `${String(actual).replace(".", ",")} ${unit}`, kind: "current" }]
            : []
        }
        ariaLabel={`${label}: prognoza na 24 miesiące z pasmem scenariuszy.`}
      />

      <p className="sy-sub">{verdict.message}</p>
      {verdict.status !== "no_data" && (
        <p className="sy-sub">
          Scenariusz realistyczny na miesiąc <span className="num">{month}</span>:{" "}
          <span className="num">{String(verdict.realistic).replace(".", ",")}</span> {unit}.
        </p>
      )}

      <button type="button" className="sy-module" onClick={() => setShowDip((v) => !v)}>
        <span>
          Dołek: miesiące {DIP_MONTHS.from}-{DIP_MONTHS.to}
        </span>
        <span className="sy-module__note">{showDip ? "zwiń" : "co to znaczy"}</span>
      </button>
      {showDip && <p className="sy-sub">{DIP_EXPLANATION}</p>}
    </>
  );
}
