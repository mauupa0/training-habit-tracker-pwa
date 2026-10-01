"use client";

import { useCallback, useEffect, useState } from "react";
import { SourceChip } from "@/components/ui/SourceChip";
import { todayIso } from "@/lib/day";
import { dailyLogsSince } from "@/lib/db/queries";
import { saveDailyLog } from "@/lib/db/repo";
import {
  PROTEIN_TILES_DEFAULT,
  proteinPortions,
  proteinTarget,
  weightSummary,
} from "@/lib/domain/measure";
import type { LocalDailyLog, LocalProgramState } from "@/types";

/**
 * Białko. Wejście przez kafelki, świadomie bez skanera kodów i bazy produktów -
 * to zakres, który zabija takie projekty, a osiem pozycji pokrywa niemal każdy dzień.
 * Cel liczy się ze średniej wagi, nigdy z dziennego pomiaru (R4).
 */
export function ProteinModule({ state }: { state: LocalProgramState }) {
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);
  const [manual, setManual] = useState("");
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  const today = todayIso();
  const frequency = state.weighing_frequency === "weekly" ? "weekly" : "daily";
  const tiles = state.protein_tiles ?? PROTEIN_TILES_DEFAULT;

  const load = useCallback(async () => setLogs(await dailyLogsSince(28)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const eaten = logs.find((l) => l.log_date === today)?.protein_g ?? 0;
  const target = proteinTarget(weightSummary(logs, today, frequency).average, state.protein_per_kg);
  const portions = proteinPortions(target);

  async function add(grams: number) {
    const next = Math.max(0, eaten + grams);
    await saveDailyLog(today, { protein_g: next });
    setLastAdded(grams);
    await load();
  }

  async function addManual() {
    const value = Number(manual.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    setManual("");
    await add(Math.round(value));
  }

  return (
    <section className="sy-mod">
      <div className="sy-mod__head">
        <span className="sy-mod__name">Białko</span>
        <span className="sy-mod__note">
          {target ? `${state.protein_per_kg} g/kg` : "cel czeka na średnią"}
        </span>
      </div>

      <p className="sy-sub">
        {target ? (
          <>
            <span className="num">{eaten}</span> / <span className="num">{target}</span> g
            <SourceChip sourceKey="morton2018" />
          </>
        ) : (
          <>
            Dziś: <span className="num">{eaten}</span> g. Cel policzę, gdy pojawi się średnia wagi.
          </>
        )}
      </p>

      {target !== null && (
        <div className="sy-bar" role="img" aria-label={`Zjedzone ${eaten} z ${target} gramów białka`}>
          <div className="sy-bar__fill" style={{ width: `${Math.min(100, (eaten / target) * 100)}%` }} />
        </div>
      )}

      <div className="sy-tiles">
        {tiles.map((tile) => (
          <button key={tile.label} type="button" className="sy-tile" onClick={() => void add(tile.grams)}>
            <span>{tile.label}</span>
            <span className="sy-tile__g num">{tile.grams} g</span>
          </button>
        ))}
      </div>

      <div className="sy-mod__row">
        <input
          className="sy-input num"
          inputMode="numeric"
          aria-label="Białko w gramach"
          placeholder="g"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button type="button" className="sy-btn" onClick={() => void addManual()}>
          Dodaj
        </button>
        {lastAdded !== null && (
          <button
            type="button"
            className="sy-btn sy-btn--ghost"
            onClick={() => {
              const back = lastAdded;
              setLastAdded(null);
              void add(-back);
            }}
          >
            Cofnij {lastAdded} g
          </button>
        )}
      </div>

      <button type="button" className="sy-module" onClick={() => setShowWhy((v) => !v)}>
        <span>Jak to rozłożyć w ciągu dnia</span>
        <span className="sy-mod__note">{showWhy ? "zwiń" : "rozwiń"}</span>
      </button>
      {showWhy && (
        <p className="sy-sub">
          Rozkład na <span className="num">{portions ?? 4}</span> porcje po ~40 g. Synteza białek jest
          wysycalna - pojedyncza porcja 20-40 g maksymalizuje odpowiedź, nadmiar idzie do utleniania.
        </p>
      )}
    </section>
  );
}
