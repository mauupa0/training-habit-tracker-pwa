"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { todayIso } from "@/lib/day";
import { measurements } from "@/lib/db/queries";
import { saveMeasurement } from "@/lib/db/repo";
import {
  CIRCUMFERENCE_LABEL,
  MEASUREMENT_EVERY_DAYS,
  circumferenceDelta,
  isDue,
  type CircumferenceKey,
} from "@/lib/domain/measure";
import type { LocalMeasurement, LocalProgramState } from "@/types";

const KEYS: CircumferenceKey[] = ["arm_cm", "chest_cm", "waist_cm", "thigh_cm"];

/**
 * Obwody co dwa tygodnie. Zmiana pokazana jest jako różnica względem poprzedniego
 * pomiaru - bez kolorowania na dobrze i źle, bo kierunek zależy od celu.
 */
export function CircumferencesSection({ state }: { state: LocalProgramState }) {
  const [rows, setRows] = useState<LocalMeasurement[]>([]);
  const [draft, setDraft] = useState<Record<CircumferenceKey, string>>({
    arm_cm: "",
    chest_cm: "",
    waist_cm: "",
    thigh_cm: "",
  });
  const [open, setOpen] = useState(false);

  const today = todayIso();
  const load = useCallback(async () => setRows(await measurements()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const due = isDue(rows[0]?.taken_on ?? null, today, MEASUREMENT_EVERY_DAYS, state.started_on);

  async function save() {
    const values: Partial<Record<CircumferenceKey, number>> = {};
    for (const k of KEYS) {
      const v = Number(draft[k].replace(",", "."));
      if (Number.isFinite(v) && v > 0) values[k] = Math.round(v * 10) / 10;
    }
    if (Object.keys(values).length === 0) return;
    await saveMeasurement(today, values);
    setDraft({ arm_cm: "", chest_cm: "", waist_cm: "", thigh_cm: "" });
    setOpen(false);
    await load();
  }

  const table = rows.slice(0, 6).map((row, i) => {
    const delta = circumferenceDelta(row, rows[i + 1]);
    return {
      taken_on: row.taken_on,
      ...Object.fromEntries(
        KEYS.map((k) => [
          k,
          row[k] === null
            ? "-"
            : `${String(row[k]).replace(".", ",")}${delta[k] ? ` (${signed(delta[k] as number)})` : ""}`,
        ])
      ),
    };
  });

  return (
    <section className="sy-section">
      <h2 className="sy-section__title">Obwody</h2>

      {due && !open && (
        <p className="sy-sub">
          Minęły <span className="num">{MEASUREMENT_EVERY_DAYS}</span> dni od ostatniego pomiaru.
          Mierz rano, przed jedzeniem, tą samą miarką.
        </p>
      )}

      {open ? (
        <>
          {KEYS.map((k) => (
            <div className="sy-mod__row" key={k}>
              <span style={{ flex: "1 1 120px" }}>{CIRCUMFERENCE_LABEL[k]}</span>
              <input
                className="sy-input num"
                inputMode="decimal"
                aria-label={`${CIRCUMFERENCE_LABEL[k]} w centymetrach`}
                value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="sy-mod__row">
            <button type="button" className="sy-btn" onClick={() => void save()}>
              Zapisz pomiar
            </button>
            <button type="button" className="sy-btn sy-btn--ghost" onClick={() => setOpen(false)}>
              Anuluj
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="sy-btn" onClick={() => setOpen(true)}>
          {rows.length === 0 ? "Pierwszy pomiar" : "Nowy pomiar"}
        </button>
      )}

      {rows.length > 0 && (
        <DataTable
          caption="Obwody w centymetrach, w nawiasie zmiana względem poprzedniego pomiaru"
          columns={[
            { key: "taken_on", label: "Data" },
            ...KEYS.map((k) => ({ key: k, label: CIRCUMFERENCE_LABEL[k], numeric: true })),
          ]}
          rows={table}
          minWidth={420}
        />
      )}
    </section>
  );
}

/** Znak zawsze widoczny: sam „0,5" nie mówi, w którą stronę poszło. */
function signed(value: number): string {
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1).replace(".", ",")}`;
}
