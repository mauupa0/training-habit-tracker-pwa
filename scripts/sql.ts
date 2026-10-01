// Zapytania i migracje na bazie projektu (schemat `system`) przez Management API.
//
//   SUPABASE_PAT=sbp_… SUPABASE_REF=<ref projektu> node scripts/sql.ts "select count(*) from system.sets"
//   SUPABASE_PAT=sbp_… node scripts/sql.ts --file supabase/migrations/0009_cos.sql
//
// PAT (token Management API) trzymaj poza repo. Tą drogą da się wgrać wszystkie migracje
// z supabase/migrations bez wklejania SQL-a w panelu.

import { readFileSync } from "node:fs";

const PAT = process.env.SUPABASE_PAT;
if (!PAT) {
  console.error("Ustaw SUPABASE_PAT (token Management API).");
  process.exit(2);
}

const REF = process.env.SUPABASE_REF;
if (!REF) {
  console.error("Ustaw SUPABASE_REF (ref projektu z adresu https://<ref>.supabase.co).");
  process.exit(2);
}
const args = process.argv.slice(2);
const query = args[0] === "--file" ? readFileSync(args[1], "utf8") : args.join(" ");

if (!query.trim()) {
  console.error('Podaj zapytanie albo --file <ścieżka.sql>');
  process.exit(2);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${PAT}`,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  console.error(res.status, text.slice(0, 500));
  process.exit(1);
}

try {
  console.log(JSON.stringify(JSON.parse(text), null, 1));
} catch {
  console.log(text);
}
