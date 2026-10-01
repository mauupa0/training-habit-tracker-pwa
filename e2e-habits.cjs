// Test fazy 3 na ŚWIEŻYM koncie: onboarding nawykowy jest blokujący, WOOP ma
// licznik na kroku „Rezultat”, moduły odblokowują się etapami.
//
//   E2E_SESSION=<plik-z-sesja.json> node e2e-habits.cjs
//
// Plik sesji musi wskazywać konto bez planów jeśli-to (patrz skrypt zakładający
// użytkownika testowego) - inaczej aplikacja wejdzie prosto na ekran „Dziś”.
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
const auth = JSON.parse(fs.readFileSync(process.env.E2E_SESSION, "utf8"));
const projectRef = new URL(auth.url).hostname.split(".")[0];
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
}

/**
 * Test bada wejście na czyste konto, więc sam je czyści - inaczej drugi przebieg
 * zastaje plany z pierwszego i aplikacja słusznie wchodzi prosto na „Dziś".
 * Kasujemy wyłącznie wiersze tego użytkownika: RLS nie pozwoli ruszyć cudzych.
 */
async function resetKonto() {
  const tabele = ["sets", "sessions", "if_then_plans", "woop_entries", "daily_logs", "program_state"];
  for (const t of tabele) {
    const r = await fetch(`${auth.url}/rest/v1/${t}?owner=eq.${auth.user_id}`, {
      method: "DELETE",
      headers: {
        apikey: auth.pub,
        Authorization: `Bearer ${auth.session.access_token}`,
        "Content-Profile": "system",
      },
    });
    if (r.status >= 400) console.log(`  reset ${t}: ${r.status} ${(await r.text()).slice(0, 140)}`);
  }
}

(async () => {
  await resetKonto();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    locale: "pl-PL",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(40_000);

  await page.addInitScript(
    ([keys, value]) => keys.forEach((k) => window.localStorage.setItem(k, value)),
    [["system-auth", `sb-${projectRef}-auth-token`], JSON.stringify(auth.session)]
  );

  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("h1");

  if ((await page.textContent("h1")).startsWith("Trzy dane")) {
    const fields = page.locator('form input:not([type="date"])');
    await fields.nth(0).fill("180"); // wzrost
    await fields.nth(1).fill("78"); // waga startowa
    await page.click('button[type="submit"]');
    await page.waitForTimeout(800);
  }

  // --- 1. onboarding nawykowy jest blokujący
  const heading = (await page.textContent("h1")).trim();
  check("po danych startowych wchodzi onboarding nawykowy", /Plany na konkretne/.test(heading), heading);

  const blocked = await page.$eval(".sy-save", (n) => n.disabled);
  check("bez planów nie da się przejść dalej (R6)", blocked === true);

  await page.screenshot({ path: `${OUT}/habits-360.png`, fullPage: true });

  // dwa plany na porażkę i jeden na start - nadal za mało
  const choices = await page.$$(".sy-choice");
  await choices[0].click();
  await choices[1].click();
  const stillBlocked = await page.$eval(".sy-save", (n) => n.disabled);
  check("dwa plany na porażkę to za mało - brakuje startowych", stillBlocked === true);

  // start: pierwsza pozycja drugiej grupy (po czterech na porażkę)
  await choices[4].click();
  await choices[5].click();
  const open = await page.$eval(".sy-save", (n) => n.disabled);
  check("2 na porażkę + 2 na start otwierają przejście", open === false);

  await page.click(".sy-save");
  await page.waitForSelector("text=WOOP");

  // --- 2. WOOP: krok „Rezultat” ma licznik i sam przechodzi dalej
  await page.fill("textarea", "chcę zrobić wszystkie 32 treningi w najbliższe 8 tygodni");
  await page.click(".sy-save");
  await page.waitForSelector("text=Rezultat");

  const counter = await page.textContent(".sy-label");
  check("krok „Rezultat” pokazuje licznik", /Dalej za \d+ s/.test(counter), counter.trim());

  await page.fill("textarea", "więcej siły i kondycji, które widać w dzienniku");
  await page.waitForFunction(
    () => document.querySelector(".sy-lead")?.textContent?.includes("Przeszkoda"),
    { timeout: 30_000 }
  );
  check("po 20 s licznik sam przechodzi do przeszkody (Kappes i Oettingen)", true);

  await page.fill("textarea", "jak pada i jest zimno, nie będzie mi się chciało wyjść");
  await page.click(".sy-save");
  await page.fill("textarea", "jeśli pada i nie chce mi się wyjść, to robię tryb minimum w domu");
  await page.click(".sy-save");

  await page.waitForSelector(".sy-nav");
  const today = await page.textContent("main");

  // --- 3. moduły etapami (R5)
  check(
    "białko jest zablokowane w tygodniu 1 i mówi kiedy wejdzie",
    /Białko · Odblokowuje się w tygodniu 3/.test(today),
    (today.match(/Białko[^]{0,48}/) || [""])[0]
  );

  const marked = await page.$$eval("*", (nodes) =>
    nodes
      .filter((n) => {
        const c = getComputedStyle(n);
        const mark = getComputedStyle(document.documentElement).getPropertyValue("--mark").trim();
        return (
          (c.color.includes("168, 47, 38") || c.borderTopColor.includes("168, 47, 38")) && mark
        );
      })
      .map((n) => n.className)
      .slice(0, 4)
  );
  check("nigdzie na ekranie „Dziś” nie ma czerwieni (R1)", marked.length === 0, marked.join(" | "));

  check(
    "brak słów „porażka”, „przegapiłeś”, „niestety” i wykrzykników",
    !/przegapiłeś|niestety|!/i.test(today),
    (today.match(/.{0,30}(przegapiłeś|niestety|!).{0,20}/i) || [""])[0]
  );

  // świeże konto nie dostaje na powitanie „dwa pominięte z rzędu”
  check(
    "nowe konto bez sesji nie dostaje sygnału o pominięciach",
    !/pominięte z rzędu/.test(today)
  );

  await page.screenshot({ path: `${OUT}/today-modules-360.png`, fullPage: true });

  // --- 4. ekran „Plany”
  await page.click(".sy-nav__item >> text=Plany");
  await page.waitForSelector("text=Na porażkę");
  // nagłówek renderuje się od razu, lista dopiero po odczycie z IndexedDB
  await page.waitForSelector(".sy-choice", { timeout: 8000 }).catch(() => {});
  const plans = await page.$$eval(".sy-choice", (n) => n.length);
  check("plany zapisały się i są widoczne na osobnym ekranie", plans >= 4, `pozycji: ${plans}`);
  await page.screenshot({ path: `${OUT}/plans-360.png`, fullPage: true });

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
