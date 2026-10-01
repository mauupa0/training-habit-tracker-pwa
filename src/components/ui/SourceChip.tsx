"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { getSource, type SourceKey } from "@/lib/sources/registry";

export interface SourceChipProps {
  sourceKey: SourceKey;
  /** Co ta liczba oznacza. Trafia do aria-label, więc pisz pełnym zdaniem. */
  describes?: string;
  /** Widoczny podpis, np. „PMID 27433992”. Bez niego chip jest samym znacznikiem. */
  label?: string;
}

/**
 * Sygnatura produktu: każda liczba z badania nosi ten znak.
 * Znacznik ma 26 px, obszar dotykowy 44 px - klasy w components.css.
 *
 * Wersja z handoffu jest bezstanowa (wymaga `onOpen`). Tutaj chip sam sięga
 * do rejestru źródeł i otwiera arkusz, żeby ekrany nie musiały przenosić
 * stanu tylko po to, by pokazać publikację.
 */
export function SourceChip({ sourceKey, describes, label }: SourceChipProps) {
  const [open, setOpen] = useState(false);
  const s = getSource(sourceKey);

  return (
    <>
      <button
        type="button"
        className={label ? "dz-chip dz-chip--labelled" : "dz-chip"}
        aria-label={`Źródło: ${describes ?? `${s.authors}, ${s.year}`}`}
        onClick={() => setOpen(true)}
      >
        <span className="dz-chip__mark" aria-hidden="true">
          i
        </span>
        {label}
      </button>

      <Sheet open={open} title={s.authors} onClose={() => setOpen(false)}>
        <p className="dz-sheet__meta">
          {s.journal} · {s.year}
          {s.locator ? ` · ${s.locator}` : ""}
        </p>

        <p style={{ color: "var(--ink-2)" }}>{s.title}</p>

        <p style={{ color: "var(--ink)", borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          {s.claim_pl}
        </p>

        {(s.doi || s.pmid) && (
          <p className="dz-sheet__meta">
            {s.doi && (
              <a href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer" style={link}>
                DOI {s.doi}
              </a>
            )}
            {s.doi && s.pmid ? <span aria-hidden="true"> · </span> : null}
            {s.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`}
                target="_blank"
                rel="noreferrer"
                style={link}
              >
                PMID {s.pmid}
              </a>
            )}
          </p>
        )}
      </Sheet>
    </>
  );
}

const link: React.CSSProperties = { color: "var(--stamp)", textDecoration: "underline" };
