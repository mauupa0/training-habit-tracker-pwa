// Weryfikacja rejestru źródeł wobec PubMed i Crossref (faza 7).
// Uruchomienie: `pnpm zrodla` - wymaga sieci.
//
// Cały produkt opiera się na tym, że liczby w interfejsie prowadzą do prawdziwych
// publikacji. Jeden zmyślony PMID przekreśla wiarygodność całości, a modele językowe
// mają udokumentowaną skłonność do konfabulowania identyfikatorów - dlatego sprawdzamy
// je maszynowo, u źródła, a nie „na oko".

import { SOURCES, SOURCE_KEYS } from "../src/lib/sources/registry.ts";

type Result = { key: string; ok: boolean; detail: string };

/** Nazwisko pierwszego autora - po nim porównujemy, czy identyfikator wskazuje tę pracę. */
function firstAuthorSurname(authors: string): string {
  return authors.split(/[,;]/)[0].trim().split(/\s+/)[0].toLowerCase();
}

async function checkPmid(pmid: string, expectYear: number, authors: string): Promise<Result["detail"] | null> {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${pmid}`;
  const r = await fetch(url, { headers: { "User-Agent": "system-app-source-check" } });
  if (!r.ok) return `PubMed odpowiedział ${r.status}`;

  const json = (await r.json()) as { result?: Record<string, { title?: string; pubdate?: string; sortfirstauthor?: string; error?: string }> };
  const entry = json.result?.[pmid];
  if (!entry || entry.error) return "PubMed nie zna tego identyfikatora";

  const year = Number((entry.pubdate ?? "").slice(0, 4));
  const surname = firstAuthorSurname(authors);
  const actual = (entry.sortfirstauthor ?? "").toLowerCase();

  const problems: string[] = [];
  if (Math.abs(year - expectYear) > 1) problems.push(`rok ${year} wobec ${expectYear} w rejestrze`);
  if (surname.length > 3 && actual && !actual.includes(surname)) {
    problems.push(`pierwszy autor „${entry.sortfirstauthor}" wobec „${authors.split(",")[0]}"`);
  }
  return problems.length ? problems.join("; ") : null;
}

async function checkDoi(doi: string, expectYear: number): Promise<Result["detail"] | null> {
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { "User-Agent": "system-app-source-check" },
  });
  if (r.status === 404) return "Crossref nie zna tego DOI";
  if (!r.ok) return `Crossref odpowiedział ${r.status}`;

  const json = (await r.json()) as { message?: { issued?: { "date-parts"?: number[][] } } };
  const year = json.message?.issued?.["date-parts"]?.[0]?.[0];
  if (year && Math.abs(year - expectYear) > 1) return `rok ${year} wobec ${expectYear} w rejestrze`;
  return null;
}

(async () => {
  console.log(`Rejestr: ${SOURCE_KEYS.length} pozycji.\n`);
  const results: Result[] = [];

  for (const key of SOURCE_KEYS) {
    const s = SOURCES[key] as {
      authors: string;
      year: number;
      doi?: string;
      pmid?: string;
    };

    if (!s.doi && !s.pmid) {
      results.push({ key, ok: false, detail: "brak DOI i PMID" });
      continue;
    }

    const problems: string[] = [];
    if (s.pmid) {
      const problem = await checkPmid(s.pmid, s.year, s.authors);
      if (problem) problems.push(`PMID ${s.pmid}: ${problem}`);
    }
    if (s.doi) {
      const problem = await checkDoi(s.doi, s.year);
      if (problem) problems.push(`DOI ${s.doi}: ${problem}`);
    }

    results.push({
      key,
      ok: problems.length === 0,
      detail: problems.join(" · ") || [s.pmid && `PMID ${s.pmid}`, s.doi && `DOI ${s.doi}`].filter(Boolean).join(" · "),
    });

    // NCBI prosi o nie więcej niż trzy zapytania na sekundę bez klucza
    await new Promise((r) => setTimeout(r, 400));
  }

  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "BŁĄD"}  ${r.key.padEnd(20)} ${r.detail}`);
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} zweryfikowanych`);
  process.exit(bad.length ? 1 : 0);
})();
