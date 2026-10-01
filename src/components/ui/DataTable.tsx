import type { ReactNode } from 'react';

export interface Column {
  key: string;
  label: string;
  /** Kolumny liczbowe dostają --stamp i tabular-nums. */
  numeric?: boolean;
}

export interface DataTableProps {
  columns: Column[];
  rows: Array<Record<string, ReactNode>>;
  caption?: string;
  minWidth?: number;
}

/** Poziome przewijanie na wąskich ekranach, mono w kolumnach liczbowych. */
export function DataTable({ columns, rows, caption, minWidth = 280 }: DataTableProps) {
  return (
    <div className="dz-table__wrap">
      <table className="dz-table" style={{ minWidth }}>
        {caption && <caption className="dz-sheet__meta">{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? 'is-num' : undefined}>{row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
