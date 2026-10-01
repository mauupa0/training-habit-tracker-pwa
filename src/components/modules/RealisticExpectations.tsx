"use client";

import { useState } from "react";
import { CHAPTERS } from "@/content/wiedza";

/**
 * „Realne oczekiwania” wyciągnięte do ekranu „Postęp”, bo to tam trafia się w momencie
 * zniechęcenia - a nie do modułu wiedzy, do którego wtedy nikt nie zagląda.
 * Bez ilustracji i bez wykresu prognozy (R3): sam tekst.
 */
export function RealisticExpectations() {
  const [open, setOpen] = useState(false);
  const chapter = CHAPTERS.find((c) => c.id === "realne-oczekiwania");
  if (!chapter) return null;

  const items = chapter.sections
    .flatMap((s) => s.blocks)
    .flatMap((b) => (b.kind === "list" ? b.items : b.kind === "p" ? [b.text] : []));

  return (
    <>
      <button type="button" className="sy-module" onClick={() => setOpen((v) => !v)}>
        <span>Realne oczekiwania</span>
        <span className="sy-module__note">{open ? "zwiń" : "co kiedy widać"}</span>
      </button>
      {open &&
        items.map((text) => (
          <p className="sy-sub" key={text}>
            {text}
          </p>
        ))}
    </>
  );
}
