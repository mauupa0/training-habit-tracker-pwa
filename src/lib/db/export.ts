// Eksport i usunięcie danych (faza 6). Dane należą do użytkownika i musi móc odejść
// z nimi w dowolnym momencie, bez proszenia o zgodę i bez połączenia z siecią -
// wszystko poniżej czyta wyłącznie IndexedDB.

import { db } from "./local";

/** Wersja układu eksportu, nie aplikacji: rośnie, gdy zmienia się kształt danych. */
export const EXPORT_SCHEMA_VERSION = 3;

const TABLES = [
  "exercises",
  "workoutTemplates",
  "templateExercises",
  "sessions",
  "sets",
  "ifThenPlans",
  "woopEntries",
  "dailyLogs",
  "measurements",
  "progressPhotos",
  "programState",
  "personalRecords",
  "calibrationTests",
  "painLog",
  "weeklySnapshots",
  "habitDaily",
] as const;

export type ExportBundle = {
  exported_at: string;
  schema_version: number;
  app: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
};

export async function buildExport(): Promise<ExportBundle> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const name of TABLES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[name];
    const rows = await table.toArray();
    data[name] = rows;
    counts[name] = rows.length;
  }

  return {
    exported_at: new Date().toISOString(),
    schema_version: EXPORT_SCHEMA_VERSION,
    app: "System",
    counts,
    data,
  };
}

/** CSV z separatorem przecinkowym i cudzysłowami tam, gdzie trzeba - otwiera się w arkuszu. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];

  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [columns.join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))].join("\n");
}

export const CSV_TABLES = ["sets", "sessions", "dailyLogs", "measurements"] as const;

export async function buildCsvFiles(): Promise<Array<{ name: string; content: string }>> {
  const out: Array<{ name: string; content: string }> = [];
  for (const name of CSV_TABLES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<Record<string, unknown>[]> }>)[name];
    out.push({ name: `${name}.csv`, content: toCsv(await table.toArray()) });
  }
  return out;
}

/** Pobranie pliku bez bibliotek - Blob i zwykły odnośnik wystarczą. */
export function download(filename: string, content: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Kasuje lokalną bazę w całości. Dane na serwerze zostają - usunięcie ich wymaga
 * osobnej, świadomej decyzji, a nie kliknięcia w ustawieniach na telefonie.
 */
export async function wipeLocalData(): Promise<void> {
  await db.delete();
  window.location.reload();
}
