"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db/local";
import { todayIso } from "@/lib/day";
import { flush, getSyncStatus, startSync, subscribeSync, type SyncStatus } from "@/lib/db/sync";
import { saveDailyLog, setOwner } from "@/lib/db/repo";
import { DataTable } from "@/components/ui/DataTable";
import { SourceChip } from "@/components/ui/SourceChip";
import { SOURCE_KEYS } from "@/lib/sources/registry";

const PL = "ą ć ę ł ń ó ś ź ż  Ą Ć Ę Ł Ń Ó Ś Ź Ż";

/**
 * Panel diagnostyczny. Sprawdza to, czego nie widać w kodzie:
 * czy zapis wchodzi do IndexedDB bez sieci, czy kolejka rośnie i czy kroje
 * mają polskie znaki. Nie jest częścią przepływu użytkownika.
 */
export function DiagPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [log, setLog] = useState<string[]>([]);

  async function refresh() {
    setStatus(await getSyncStatus());
    setCounts({
      exercises: await db.exercises.count(),
      workoutTemplates: await db.workoutTemplates.count(),
      templateExercises: await db.templateExercises.count(),
      dailyLogs: await db.dailyLogs.count(),
      sets: await db.sets.count(),
      syncQueue: await db.syncQueue.count(),
    });
  }

  useEffect(() => {
    // panel ma pokazywać żywy stan, więc podpina ten sam silnik co aplikacja
    const stop = startSync();
    const off = subscribeSync(() => void refresh());
    void refresh();
    return () => {
      off();
      stop();
    };
  }, []);

  async function testWrite() {
    try {
      await setOwner("00000000-0000-0000-0000-000000000000");
      const date = todayIso();
      const row = await saveDailyLog(date, { weight_kg: 70.5 });
      setLog((l) => [`zapisano ${row.log_date} · waga ${row.weight_kg} · synced=${row.synced}`, ...l]);
      await refresh();
    } catch (err) {
      setLog((l) => [`błąd zapisu: ${err instanceof Error ? err.message : String(err)}`, ...l]);
    }
  }

  return (
    <main className="sy-screen" data-testid="diag">
      <h1 className="sy-title" style={{ marginBottom: 18 }}>
        Diagnostyka
      </h1>

      <Section title="Typografia">
        <p data-testid="font-display" style={{ fontFamily: "var(--font-display)", fontSize: 19 }}>
          {PL}
        </p>
        <p data-testid="font-body" style={{ fontFamily: "var(--font-body)", fontSize: 17 }}>
          {PL}
        </p>
        <p data-testid="font-mono" className="num" style={{ fontSize: 15 }}>
          {PL} 0123456789
        </p>
      </Section>

      <Section title="Źródła">
        <p style={{ margin: 0 }}>
          W rejestrze:{" "}
          <span className="num" data-testid="sources-count">
            {SOURCE_KEYS.length}
          </span>
          <span> · próbka: </span>
          <span className="sy-nowrap">
            <span className="num">12-18 serii</span>
            <SourceChip sourceKey="schoenfeld2017" />
          </span>
        </p>
      </Section>

      <Section title="Baza lokalna">
        <DataTable
          columns={[
            { key: "table", label: "Tabela" },
            { key: "rows", label: "Wierszy", numeric: true },
          ]}
          rows={Object.entries(counts).map(([k, v]) => ({
            table: k,
            rows: <span data-testid={`count-${k}`}>{v}</span>,
          }))}
        />
      </Section>

      <Section title="Synchronizacja">
        <p className="num" style={{ fontSize: 14, margin: 0 }} data-testid="sync-status">
          w kolejce: {status?.pending ?? "-"} · zablokowane: {status?.blocked ?? "-"} · sieć:{" "}
          {status?.online ? "jest" : "brak"}
        </p>
        {status?.lastError && (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
            ostatni błąd: {status.lastError}
          </p>
        )}

        <div className="mt-3.5 flex gap-2.5">
          <button type="button" onClick={testWrite} className="sy-btn sy-btn--ghost mt-0 w-auto px-3.5" data-testid="test-write">
            Zapisz wiersz testowy
          </button>
          <button
            type="button"
            onClick={async () => {
              await flush();
              await refresh();
            }}
            className="sy-btn sy-btn--ghost mt-0 w-auto px-3.5"
            data-testid="test-flush"
          >
            Wyślij kolejkę
          </button>
        </div>

        <ul data-testid="diag-log" className="num mt-3.5 list-none p-0" style={{ fontSize: 13 }}>
          {log.map((l, i) => (
            <li key={i} style={{ color: "var(--ink-2)", padding: "3px 0" }}>
              {l}
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sy-section">
      <h2 className="sy-section__title">{title}</h2>
      {children}
    </section>
  );
}
