// Zrzuty ekranów w obu motywach, 360 × 780.
//
//   node shots.cjs                      - auth + diag
//   E2E_SESSION=<plik.json> node shots.cjs   - dokłada ekrany za logowaniem
//
// Plik sesji powstaje poza repo (zawiera tokeny) i ma kształt:
//   { url, user_id, session: { access_token, refresh_token, expires_at, ... } }
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
fs.mkdirSync(OUT, { recursive: true });

const auth = SESSION_FILE ? JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) : null;
const projectRef = auth ? new URL(auth.url).hostname.split(".")[0] : null;

(async () => {
  const browser = await chromium.launch();

  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 780 },
      locale: "pl-PL",
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.waitForSelector("h1");
    await page.screenshot({ path: `${OUT}/auth-${scheme}.png` });

    await page.goto(`${BASE}/diag`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="diag"]');
    await page.screenshot({ path: `${OUT}/diag-${scheme}.png`, fullPage: true });

    if (auth) {
      // Sesja wprost do magazynu urządzenia - aplikacja czyta getSession, nie getUser.
      // Klient ma własny storageKey ("system-auth"), ale wpisujemy też domyślny klucz
      // supabase-js, żeby skrypt przeżył zmianę konfiguracji.
      await page.addInitScript(
        ([keys, value]) => keys.forEach((k) => window.localStorage.setItem(k, value)),
        [["system-auth", `sb-${projectRef}-auth-token`], JSON.stringify(auth.session)]
      );
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      await page.waitForSelector("h1", { timeout: 15000 });
      const heading = (await page.textContent("h1")).trim();
      await page.screenshot({ path: `${OUT}/logged-${scheme}.png`, fullPage: true });
      console.log(`${scheme}: ekran za logowaniem → „${heading}"`);

      // onboarding przechodzimy na wartościach domyślnych, żeby zobaczyć ekran „Dziś”
      if (heading.startsWith("Trzy dane")) {
        await page.click('button[type="submit"]');
        await page.waitForFunction(
          () => !document.querySelector("h1")?.textContent?.startsWith("Trzy dane")
        );
      }
      await page.waitForTimeout(1200); // słowniki dociągają się z serwera po wejściu
      await page.screenshot({ path: `${OUT}/today-${scheme}.png`, fullPage: true });
      console.log(`${scheme}: „Dziś” → ${(await page.textContent("h1")).trim()}`);
    }

    await ctx.close();
  }

  await browser.close();
  console.log("zrzuty w", OUT);
})();
