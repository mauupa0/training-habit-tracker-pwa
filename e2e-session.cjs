// Test fazy 2: sesja treningowa od startu do podsumowania, w trybie samolotowym,
// i dowód, że po powrocie sieci serie są na serwerze.
//
//   E2E_SESSION=<plik-z-sesja.json> node e2e-session.cjs
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright"));
  }
}
const { chromium } = loadPlaywright();

const BASE = process.env.E2E_BASE || "http://localhost:4321";
const OUT = process.env.E2E_OUT || path.join(__dirname, "e2e-out");
const SESSION_FILE = process.env.E2E_SESSION;
if (!SESSION_FILE) {
  console.error("Podaj E2E_SESSION - plik z tokenami użytkownika testowego.");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const auth = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
const projectRef = new URL(auth.url).hostname.split(".")[0];

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
}

async function rest(pathAndQuery) {
  const r = await fetch(`${auth.url}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: auth.pub,
      Authorization: `Bearer ${auth.session.access_token}`,
      "Accept-Profile": "system",
    },
  });
  return { status: r.status, body: await r.json() };
}

/** Faza 3 blokuje wejście bez planów jeśli-to. Zakładamy je na serwerze -
 *  przy okazji sprawdzamy, czy puste urządzenie potrafi je pobrać. */
async function ensurePlansOnServer() {
  const existing = await rest("if_then_plans?select=id");
  if (Array.isArray(existing.body) && existing.body.length >= 4) return existing.body.length;

  const rows = [
    ["failure", "Jeśli opuszczę jeden trening", "następny odbywa się bez wyjątku."],
    ["failure", "Jeśli jestem na wyjeździe bez siłowni", "robię 3 serie pompek i przysiadów."],
    ["start", "Jeśli wybije 18:00 w dzień treningowy", "zakładam buty i wychodzę."],
    ["start", "Jeśli robię śniadanie", "najpierw odkładam źródło białka na talerz."],
  ].map(([type, trigger_pl, action_pl]) => ({ type, trigger_pl, action_pl, owner: auth.user_id }));

  const r = await fetch(`${auth.url}/rest/v1/if_then_plans`, {
    method: "POST",
    headers: {
      apikey: auth.pub,
      Authorization: `Bearer ${auth.session.access_token}`,
      "Content-Profile": "system",
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  const body = await r.json();
  return Array.isArray(body) ? body.length : 0;
}

(async () => {
  const seeded = await ensurePlansOnServer();
  console.log(`plany jeśli-to na serwerze: ${seeded}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    locale: "pl-PL",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.addInitScript(
    ([keys, value]) => keys.forEach((k) => window.localStorage.setItem(k, value)),
    [["system-auth", `sb-${projectRef}-auth-token`], JSON.stringify(auth.session)]
  );

  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("h1");

  // onboarding, jeśli to świeże konto - pola muszą być wypełnione, inaczej formularz nie przejdzie
  if ((await page.textContent("h1")).startsWith("Trzy dane")) {
    const fields = page.locator('form input:not([type="date"])');
    await fields.nth(0).fill("180"); // wzrost
    await fields.nth(1).fill("78"); // waga startowa
    await page.click('button[type="submit"]');
  }

  // Napis na przycisku zależy od tego, czy dzisiejszy trening jest już zapisany
  // („Jeszcze jeden trening"), więc test nie może się opierać na jednej wersji.
  const startTraining = page.getByRole("button", { name: /Zacznij trening|Jeszcze jeden trening/ });
  await startTraining.waitFor();
  await page.waitForTimeout(1200); // słowniki z serwera

  // --- 1. start sesji
  await startTraining.click();
  await page.waitForSelector(".sy-steppers");
  const header = await page.textContent(".sy-session__where");
  check("sesja startuje z nazwą szablonu i numerem serii", /seria 1 z \d/.test(header), header.trim());

  // --- 2. tryb samolotowy na CAŁY trening
  await ctx.setOffline(true);

  const cel = await page.textContent(".sy-target");
  check("cel z szablonu widoczny", /×/.test(cel), cel.replace(/\s+/g, " ").trim());

  const last = await page.textContent(".sy-last__value");
  check("blok z danymi sprzed tygodnia obecny", last.length > 0, last.trim().slice(0, 46));

  // cztery serie pierwszego ćwiczenia
  for (let i = 0; i < 4; i++) {
    await page.click(".sy-save");
    await page.waitForTimeout(220);
  }
  const loggedFirst = await page.$$eval(".sy-logged__item", (n) => n.length);
  const afterFour = await page.textContent(".sy-session__where");
  check(
    "po komplecie serii przechodzi do następnego ćwiczenia",
    /seria 1 z \d/.test(afterFour),
    afterFour.trim()
  );
  check("licznik serii wyzerował się na nowym ćwiczeniu", loggedFirst === 0, `pozycji: ${loggedFirst}`);

  // druga pozycja: dwie serie, potem koniec
  await page.click(".sy-save");
  await page.waitForTimeout(200);
  await page.click(".sy-save");
  await page.waitForTimeout(200);

  const timer = await page.$(".dz-rest");
  check("timer przerwy startuje sam po zapisie", Boolean(timer));

  // --- wymagania ekranu sesji
  const inputs = await page.$$eval(".dz-stepper__input", (nodes) =>
    nodes.map((n) => ({ w: n.getBoundingClientRect().width, v: n.value }))
  );
  check(
    "wartości w stepperach są widoczne",
    inputs.length === 3 && inputs.every((i) => i.w >= 24),
    inputs.map((i) => `${i.v}:${Math.round(i.w)}px`).join(" ")
  );

  const taps = await page.$$eval("button", (nodes) =>
    nodes
      .map((n) => {
        const r = n.getBoundingClientRect();
        return { label: (n.textContent || n.getAttribute("aria-label") || "").trim().slice(0, 18), w: r.width, h: r.height };
      })
      .filter((b) => b.w > 0 && b.h > 0 && b.h < 44)
  );
  check("każdy cel dotykowy ma ≥ 44 px wysokości", taps.length === 0, JSON.stringify(taps).slice(0, 160));

  const saveBox = await page.$eval(".sy-save", (n) => n.getBoundingClientRect().height);
  check("przycisk zapisu ma ≥ 64 px", saveBox >= 64, `${Math.round(saveBox)} px`);

  const sessionText = await page.textContent("main");
  check(
    "ekran sesji bez wykrzykników, emoji i odznak (R1/R3)",
    !/[!🔥💪🏆⭐]|seria dni|streak|gratul/i.test(sessionText),
    sessionText.replace(/\s+/g, " ").slice(0, 50)
  );

  const wide = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check("brak przewijania w bok na 360 px", wide.doc <= wide.win, `${wide.doc} vs ${wide.win}`);

  await page.screenshot({ path: `${OUT}/session-360.png`, fullPage: true });

  // Odcięta sieć sama z siebie loguje ERR_INTERNET_DISCONNECTED - to nie jest błąd
  // aplikacji, tylko przeglądarka. Interesują nas wyjątki JS i błędy naszego kodu.
  const appErrors = errors.filter(
    (e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|Failed to fetch/i.test(e)
  );
  check("brak błędów aplikacji podczas sesji offline", appErrors.length === 0, appErrors.slice(0, 2).join(" | "));

  // --- 3. zakończenie i podsumowanie
  await page.click(".sy-session__foot >> text=Zakończ");
  await page.waitForSelector("text=Tonaż");
  const summary = await page.textContent("main");
  check("podsumowanie pokazuje tonaż i serie", /Tonaż/.test(summary) && /Serie/.test(summary));
  check(
    "podsumowanie bez gratulacji i wykrzykników (R3)",
    !/!|gratul|świetn|brawo|super/i.test(summary),
    summary.replace(/\s+/g, " ").slice(0, 60)
  );
  await page.screenshot({ path: `${OUT}/summary-360.png`, fullPage: true });

  // --- 4. powrót sieci: kolejka ma dojść do serwera
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  const readQueue = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("system");
          req.onsuccess = () => {
            const tx = req.result.transaction("syncQueue", "readonly");
            const all = tx.objectStore("syncQueue").getAll();
            all.onsuccess = () =>
              resolve(
                all.result.map((op) => ({
                  table: op.table,
                  op: op.op,
                  attempts: op.attempts,
                  last_error: op.last_error,
                }))
              );
          };
        })
    );

  let queue = await readQueue();
  for (let i = 0; i < 30 && queue.length > 0; i++) {
    await page.waitForTimeout(1000);
    queue = await readQueue();
  }
  check(
    "kolejka synchronizacji opróżniona",
    queue.length === 0,
    queue.length ? JSON.stringify(queue).slice(0, 220) : "pusta"
  );

  // --- 5. dowód po stronie serwera: serie DOKŁADNIE tej sesji, nie ostatnie N globalnie
  const serverSessions = await rest("sessions?select=id,status,finished_at&order=started_at.desc&limit=5");
  const sessionId = serverSessions.body[0]?.id;
  const serverSets = await rest(
    `sets?select=id,weight_kg,reps,set_index&session_id=eq.${sessionId}&order=logged_at`
  );
  // Po stronie urządzenia też liczymy serie TEJ sesji: od kiedy puste urządzenie
  // odzyskuje historię z serwera, licznik globalny obejmowałby również stare treningi.
  const localCount = await page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const req = indexedDB.open("system");
        req.onsuccess = () => {
          const tx = req.result.transaction("sets", "readonly");
          const all = tx.objectStore("sets").getAll();
          all.onsuccess = () => resolve(all.result.filter((s) => s.session_id === id).length);
        };
      }),
    sessionId
  );
  check(
    "wszystkie serie sesji są w Supabase",
    serverSets.status === 200 && serverSets.body.length === localCount,
    `serwer ${Array.isArray(serverSets.body) ? serverSets.body.length : "?"} / urządzenie ${localCount}`
  );
  check(
    "sesja zamknięta ze statusem full/minimal",
    serverSessions.status === 200 &&
      ["full", "minimal"].includes(serverSessions.body[0]?.status),
    serverSessions.body[0]?.status
  );

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
