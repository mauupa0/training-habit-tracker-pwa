"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SourceChip } from "@/components/ui/SourceChip";
import { CHAPTERS, type Block, type Chapter } from "@/content/wiedza";
import { MENTAL_MODELS } from "@/content/modele";
import { SOURCE_KEYS, getSource } from "@/lib/sources/registry";

/** Porównanie bez ogonków i wielkości liter - „bialko” ma znaleźć „białko”. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase();
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "quote":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].join(" ");
    case "verdict":
      return `${block.claim} ${block.verdict} ${block.body}`;
  }
}

function chapterText(chapter: Chapter): string {
  return [
    chapter.title,
    chapter.lead,
    ...chapter.sections.flatMap((s) => [s.title, ...s.blocks.map(blockText)]),
  ].join(" ");
}

/**
 * Moduł wiedzy. Cała treść jest w bundlu, więc rozdziały i wyszukiwarka działają
 * bez sieci - tak samo jak reszta aplikacji na siłowni bez zasięgu.
 */
export function KnowledgeScreen() {
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [openModels, setOpenModels] = useState(false);
  const [query, setQuery] = useState("");

  const index = useMemo(
    () => CHAPTERS.map((c) => ({ chapter: c, text: fold(chapterText(c)) })),
    []
  );

  const modelIndex = useMemo(
    () => MENTAL_MODELS.map((m) => ({ model: m, text: fold(`${m.name} ${m.definition} ${m.application}`) })),
    []
  );

  const needle = fold(query.trim());
  const foundChapters = needle.length >= 3 ? index.filter((i) => i.text.includes(needle)) : index;
  const foundModels = needle.length >= 3 ? modelIndex.filter((i) => i.text.includes(needle)) : [];

  if (openChapter === "zrodla") {
    return (
      <main className="sy-screen sy-with-nav">
        <header className="sy-head">
          <h1 className="sy-title">Źródła</h1>
          <button type="button" className="sy-list__meta" style={BACK} onClick={() => setOpenChapter(null)}>
            wróć
          </button>
        </header>
        <p className="sy-lead">
          Każda liczba dawkowania w tej aplikacji prowadzi do jednej z tych pozycji. Wszystkie do
          zweryfikowania - identyfikatory podane po to, żeby dało się sprawdzić, że nie zostały wymyślone.
        </p>
        {SOURCE_KEYS.map((key) => {
          const s = getSource(key);
          return (
            <div className="sy-mod" key={key}>
              <div className="sy-mod__head">
                <span className="sy-mod__name">{s.authors}</span>
                <span className="sy-mod__note num">{s.year}</span>
              </div>
              <p className="sy-sub">{s.title}</p>
              <p className="sy-sub">{s.claim_pl}</p>
              <p className="sy-sub num" style={{ fontSize: 12 }}>
                {[s.journal, s.locator, s.doi && `DOI ${s.doi}`, s.pmid && `PMID ${s.pmid}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          );
        })}
      </main>
    );
  }

  const chapter = CHAPTERS.find((c) => c.id === openChapter);

  if (chapter) {
    return (
      <main className="sy-screen sy-with-nav">
        <header className="sy-head">
          <h1 className="sy-title">{chapter.title}</h1>
          <button type="button" className="sy-list__meta" style={BACK} onClick={() => setOpenChapter(null)}>
            wróć
          </button>
        </header>
        <p className="sy-lead">{chapter.lead}</p>

        {chapter.sections.map((section) => (
          <section className="sy-section" key={section.title}>
            <h2 className="sy-section__title">{section.title}</h2>
            {section.blocks.map((block, i) => (
              <BlockView block={block} key={i} />
            ))}
          </section>
        ))}
      </main>
    );
  }

  if (openModels) {
    return (
      <main className="sy-screen sy-with-nav">
        <header className="sy-head">
          <h1 className="sy-title">Modele mentalne</h1>
          <button type="button" className="sy-list__meta" style={BACK} onClick={() => setOpenModels(false)}>
            wróć
          </button>
        </header>
        <p className="sy-lead">
          Trzynaście modeli. Każdy z zastosowaniem u Ciebie, nie w ogóle - bez tego byłby to zbiór cytatów.
        </p>
        {MENTAL_MODELS.map((m) => (
          <ModelCard key={m.id} model={m} />
        ))}
      </main>
    );
  }

  return (
    <main className="sy-screen sy-with-nav">
      <header className="sy-head">
        <h1 className="sy-title">Wiedza</h1>
      </header>

      <input
        className="sy-input"
        type="search"
        placeholder="Szukaj w treści"
        aria-label="Szukaj w treści"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {needle.length >= 3 && foundChapters.length === 0 && foundModels.length === 0 && (
        <EmptyState>Nic takiego tu nie ma. Spróbuj innego słowa.</EmptyState>
      )}

      <section className="sy-section">
        <h2 className="sy-section__title">Rozdziały</h2>
        {foundChapters.map(({ chapter: c }) => (
          <button key={c.id} type="button" className="sy-module" onClick={() => setOpenChapter(c.id)}>
            <span>{c.title}</span>
            <span className="sy-module__note">{c.sections.length} sekcji</span>
          </button>
        ))}
        <button type="button" className="sy-module" onClick={() => setOpenModels(true)}>
          <span>Modele mentalne</span>
          <span className="sy-module__note">{MENTAL_MODELS.length} kart</span>
        </button>
        <button type="button" className="sy-module" onClick={() => setOpenChapter("zrodla")}>
          <span>Źródła</span>
          <span className="sy-module__note">{SOURCE_KEYS.length} pozycji</span>
        </button>
      </section>

      {foundModels.length > 0 && (
        <section className="sy-section">
          <h2 className="sy-section__title">Modele pasujące do wyszukiwania</h2>
          {foundModels.map(({ model }) => (
            <ModelCard key={model.id} model={model} />
          ))}
        </section>
      )}
    </main>
  );
}

const BACK: React.CSSProperties = { background: "none", border: 0, cursor: "pointer", minHeight: 44 };

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="sy-sub">
          {block.text}
          {block.source && <SourceChip sourceKey={block.source} />}
        </p>
      );
    case "quote":
      return <p className="sy-alert">{block.text}</p>;
    case "list":
      return (
        <ul className="sy-list">
          {block.items.map((item) => (
            <li className="sy-list__row" key={item} style={{ display: "block" }}>
              <span className="sy-sub">{item}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <DataTable
          columns={block.head.map((h, i) => ({ key: `c${i}`, label: h }))}
          rows={block.rows.map((r) => Object.fromEntries(r.map((cell, i) => [`c${i}`, cell])))}
          minWidth={Math.max(320, block.head.length * 150)}
        />
      );
    case "verdict":
      return (
        <div className="sy-mod">
          <div className="sy-mod__head">
            <span className="sy-mod__name">„{block.claim}”</span>
            <span className="sy-mod__note">{block.verdict}</span>
          </div>
          <p className="sy-sub">
            {block.body}
            {block.source && <SourceChip sourceKey={block.source} />}
          </p>
        </div>
      );
  }
}

export function ModelCard({ model }: { model: (typeof MENTAL_MODELS)[number] }) {
  return (
    <div className={model.highlighted ? "sy-mod sy-mod--mark" : "sy-mod"}>
      <div className="sy-mod__head">
        <span className="sy-mod__name">{model.name}</span>
        {model.highlighted && <span className="sy-mod__note">zabezpieczenie</span>}
      </div>
      <p className="sy-sub">{model.definition}</p>
      <p className="sy-sub">
        {model.application}
        {model.source && <SourceChip sourceKey={model.source} />}
      </p>
    </div>
  );
}
