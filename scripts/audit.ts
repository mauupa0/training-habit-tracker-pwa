// Audyt reguł nienaruszalnych (faza 7). Uruchomienie: `pnpm audit-regul`.
//
// Każda z reguł R1-R7 jest sprzeczna z domyślnym wzorcem branżowym, więc naturalna
// tendencja przy dopisywaniu kodu jest taka, żeby je złamać - zwłaszcza pod koniec
// projektu i pod presją. Ten skrypt istnieje po to, żeby wychwycić to maszynowo.
//
// Zasada projektowa skryptu: ma mieć MAŁO fałszywych trafień. Narzędzie, które krzyczy
// na poprawny kod, zostaje wyłączone po tygodniu i przestaje cokolwiek chronić. Dlatego
// pomija komentarze, zna dozwolone konteksty i pozwala oznaczyć wyjątek w linii.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Rule = { id: string; why: string; pattern: RegExp };

/** Wzorce zakazane w tekstach interfejsu. */
const COPY_RULES: Rule[] = [
  { id: "R3", why: "wykrzyknik w treści interfejsu", pattern: /[a-ząćęłńóśźż][!]["'`]/ },
  { id: "R3", why: "gratulacje i pochwały", pattern: /świetn|gratulac|brawo|wspaniał|super robota/i },
  { id: "R3", why: "język hype", pattern: /dasz radę|nie poddawaj|walcz do końca|zmiażdż|rozwal to|let'?s go|you got this|beast mode/i },
  { id: "R3", why: "emoji ekspresyjne", pattern: /[\u{1F4AA}\u{1F525}\u{1F3C6}\u{26A1}\u{1F389}\u{1F680}\u{2B50}]/u },
  // „dni z rzędu" świadomie NIE jest wzorcem: R1 sama opisuje zasadę dwóch dni z rzędu.
  // Streak poznaje się po tym, że jest LICZNIKIEM, a nie po samym słowie.
  { id: "R1", why: "licznik serii dni", pattern: /streak|seria dni|licznik dni|passa/i },
  { id: "wstyd", why: "ocenianie i zawstydzanie", pattern: /niestety|przegapił|zawiodł|jest słabo/i },
  { id: "R3", why: "obietnice wyglądu", pattern: /przewidywan[aey] sylwetk|jak będziesz wygląda|za \d+ miesięcy będziesz/i },
];

/** Wzorce zakazane w kodzie - nazwy funkcji i pól zdradzają zakazany mechanizm. */
const CODE_RULES: Rule[] = [
  { id: "R4", why: "BMI jako miara postępu", pattern: /\bbmi\b|calculateBmi/i },
  { id: "R7", why: "wzór zapotrzebowania zamiast pomiaru", pattern: /mifflin|harris.?benedict|st.?jeor/i },
  { id: "gamifikacja", why: "odznaki, punkty, poziomy", pattern: /\bbadge|achievement|xpPoints|level_?up|leaderboard/i },
  { id: "zakres", why: "skaner kodów i baza produktów", pattern: /barcode|foodDatabase|productDatabase/i },
  { id: "4B", why: "łączony wynik dnia", pattern: /dayScore|progressScore|wynikDnia/i },
];

/**
 * Konteksty, w których dopasowanie jest poprawne. Każdy z powodem - bez tego lista
 * wyjątków po roku staje się cichym obejściem audytu.
 */
const ALLOWED: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /porażk/i, why: "plany jeśli-to typu failure nazywają się po polsku „porażka” (R6)" },
  { pattern: /Porażka nie buduje/i, why: "rozdział o motywacji cytuje i obala ten slogan" },
  { pattern: /nie poddawaj|zmiażdż|dasz radę/i, why: "tabela „zamiast tego napisz” w module wiedzy pokazuje zakazane zwroty" },
  // Wyjątek celowo wąski: „bez BMI" wolno napisać, `calculateBmi(...)` już nie.
  // Pierwsza wersja miała tu samo /bmi/i i przepuszczała realne wyliczanie BMI -
  // wyszło dopiero w kontroli negatywnej, przy podrzuconym naruszeniu.
  { pattern: /bez BMI|nie ma BMI|BMI jako miara/i, why: "treść wymienia BMI jako rzecz zakazaną" },
  { pattern: /goal achievement|achievement of/i, why: "angielski tytuł publikacji w rejestrze źródeł" },
  { pattern: /fantazj/i, why: "rozdział o motywacji opisuje mechanizm fantazji, cytując jego skutki" },
];

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SCAN_DIRS = ["src"];
const EXTENSIONS = [".ts", ".tsx"];
const SKIP = ["__tests__", "node_modules", ".next"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.some((s) => entry.includes(s))) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/** Komentarze opisują reguły i wymieniają zakazane wzorce z nazwy - nie audytujemy ich. */
function stripComments(source: string): string[] {
  const lines = source.split("\n");
  let inBlock = false;

  return lines.map((line) => {
    let out = line;
    if (inBlock) {
      const end = out.indexOf("*/");
      if (end === -1) return "";
      out = out.slice(end + 2);
      inBlock = false;
    }
    const block = out.indexOf("/*");
    if (block !== -1) {
      const end = out.indexOf("*/", block);
      if (end === -1) {
        inBlock = true;
        out = out.slice(0, block);
      } else {
        out = out.slice(0, block) + out.slice(end + 2);
      }
    }
    const line2 = out.indexOf("//");
    if (line2 !== -1) out = out.slice(0, line2);
    return out;
  });
}

type Finding = { file: string; line: number; rule: Rule; text: string };

function audit(): Finding[] {
  const findings: Finding[] = [];
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const lines = stripComments(source);

    lines.forEach((line, i) => {
      if (!line.trim()) return;
      // wyjątek świadomy i opisany w tej samej linii
      if (source.split("\n")[i].includes("audit-ok:")) return;

      for (const rule of [...COPY_RULES, ...CODE_RULES]) {
        if (!rule.pattern.test(line)) continue;
        if (ALLOWED.some((a) => a.pattern.test(line))) continue;
        findings.push({ file: relative(ROOT, file), line: i + 1, rule, text: line.trim().slice(0, 100) });
      }
    });
  }

  return findings;
}

const findings = audit();

if (findings.length === 0) {
  console.log("Audyt reguł: czysto. Żadna z reguł R1-R7 nie została złamana w kodzie ani w treści.");
  process.exit(0);
}

console.log(`Audyt reguł: ${findings.length} naruszeń.\n`);
for (const f of findings) {
  console.log(`${f.rule.id}  ${f.file}:${f.line}`);
  console.log(`    ${f.rule.why}`);
  console.log(`    ${f.text}\n`);
}
console.log("Naprawa albo świadomy wyjątek: dopisz w linii komentarz `audit-ok: powód`.");
process.exit(1);
