// Test fazy 1: typografia, SourceChip, zapis offline do IndexedDB, kolejka synchronizacji.
//
// Uruchomienie:  node e2e.cjs            (serwer na :4321)
//                E2E_BASE=… node e2e.cjs
//
// Runner jest przenośny między maszynami: playwright bierzemy z globalnej
// instalacji npm (nie ma go w zależnościach projektu i nie powinno być -
// to narzędzie, nie zależność aplikacji), a przeglądarkę zostawiamy playwrightowi.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function loadPlaywright() {
  const tries = [];
  try {
    return require("playwright");
  } catch (e) {
    tries.push("require('playwright')");
  }
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(root, "playwright"));
  } catch (e) {
    tries.push("npm root -g");
  }
  console.error(`Nie znalazłem playwrighta (${tries.join(", ")}). Zainstaluj: npm i -g playwright`);
  process.exit(2);
}

const { chromium } = loadPlaywright();

const BASE = process.env.E2E_BASE || "http://localhost:4321";
const OUT = process.env.E2E_OUT || path.join(__dirname, "e2e-out");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    locale: "pl-PL",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/diag`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="diag"]');

  // --- 1. fonty: czy załadowały się realne pliki, a nie fallback systemowy
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const fams = new Set();
    document.fonts.forEach((f) => fams.add(f.family));
    const measure = (sel) => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily.split(",")[0].trim(), width: el.getBoundingClientRect().width };
    };
    return {
      loaded: [...fams],
      display: measure('[data-testid="font-display"]'),
      body: measure('[data-testid="font-body"]'),
      mono: measure('[data-testid="font-mono"]'),
    };
  });
  check("fonty załadowane (3 rodziny)", fonts.loaded.length >= 3, fonts.loaded.join(", "));

  // kontrola negatywna: te same napisy w foncie systemowym mają inną szerokość
  const fallbackWidth = await page.evaluate(() => {
    const d = document.createElement("span");
    d.style.cssText = "position:absolute;font:19px monospace;white-space:nowrap";
    d.textContent = "ą ć ę ł ń ó ś ź ż  Ą Ć Ę Ł Ń Ó Ś Ź Ż";
    document.body.appendChild(d);
    const w = d.getBoundingClientRect().width;
    d.remove();
    return w;
  });
  check(
    "kroje różnią się od fallbacku",
    Math.abs(fonts.display.width - fallbackWidth) > 1,
    `display ${fonts.display.width.toFixed(1)} vs monospace ${fallbackWidth.toFixed(1)}`
  );

  // szerokość bywa przypadkowa - nagłówki muszą realnie stać na Bricolage
  check("nagłówki w Bricolage Grotesque", /Bricolage/i.test(fonts.display.family), fonts.display.family);
  check(
    "body to krój szeryfowy (Newsreader)",
    /Newsreader/i.test(fonts.body.family),
    fonts.body.family
  );
  check(
    "liczby w JetBrains Mono",
    /JetBrains/i.test(fonts.mono.family),
    fonts.mono.family
  );

  // chip musi siedzieć w tej samej linii co liczba, a nie spadać pod nią
  const chip = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="Schoenfeld"]');
    const txt = [...document.querySelectorAll("span")].find((s) =>
      s.textContent.includes("12-18 serii")
    );
    const b = btn.getBoundingClientRect();
    const t = txt.getBoundingClientRect();
    return { sameLine: Math.abs(b.top - t.top) < 14, chipTop: b.top, textTop: t.top, w: b.width };
  });
  check("SourceChip stoi przy liczbie", chip.sameLine, `chip ${chip.chipTop} vs tekst ${chip.textTop}`);

  // ...i nie wchodzi na ostatnią literę: ujemny margines lewy nasuwał znak na tekst
  const gap = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="Schoenfeld"]');
    // dokładnie ten span z liczbą, nie owijka - owijka zawiera też chip,
    // więc mierzenie do jej prawej krawędzi zawsze wychodzi ujemne
    const txt = [...document.querySelectorAll("span")].find(
      (s) => s.textContent.trim() === "12-18 serii"
    );
    return btn.getBoundingClientRect().left - txt.getBoundingClientRect().right;
  });
  check("SourceChip nie nachodzi na tekst", gap >= 0, `odstęp ${gap.toFixed(1)} px`);

  // obszar dotyku ma mieć 44 px mimo małego znaku
  const hit = await page.evaluate(() => {
    const r = document.querySelector('button[aria-label*="Schoenfeld"]').getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  check("obszar dotyku ≥ 44 px", hit.w >= 44 && hit.h >= 44, `${hit.w}×${hit.h}`);

  // --- 2. liczba źródeł
  const sources = await page.textContent('[data-testid="sources-count"]');
  check("rejestr źródeł ma 25 wpisów", sources.trim() === "25", `jest: ${sources.trim()}`);

  // --- 3. SourceChip otwiera arkusz z PMID
  await page.click('button[aria-label*="Schoenfeld"]');
  await page.waitForSelector('[role="dialog"]');
  const sheet = await page.textContent('[role="dialog"]');
  check("SourceChip pokazuje PMID 27433992", sheet.includes("27433992"));
  check("SourceChip pokazuje tezę po polsku", sheet.includes("0,38%"));
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached" });

  // --- 4. zapis do IndexedDB przy WŁĄCZONEJ sieci
  await page.click('[data-testid="test-write"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="count-dailyLogs"]')?.textContent === "1"
  );
  const queueOnline = await page.textContent('[data-testid="count-syncQueue"]');
  check("zapis trafia do IndexedDB", true, `dailyLogs=1, kolejka=${queueOnline}`);

  // --- 5. tryb samolotowy: zapis musi działać dalej
  await ctx.setOffline(true);
  const beforeOffline = Number(await page.textContent('[data-testid="count-syncQueue"]'));
  await page.click('[data-testid="test-write"]');
  await page.waitForTimeout(600);
  const afterOffline = Number(await page.textContent('[data-testid="count-syncQueue"]'));
  const logText = await page.textContent('[data-testid="diag-log"]');
  check(
    "zapis działa bez sieci",
    !logText.includes("błąd zapisu"),
    `kolejka ${beforeOffline} → ${afterOffline}`
  );
  check("operacja czeka w kolejce, nie ginie", afterOffline >= beforeOffline);

  // --- 6. flush bez sieci nie wywala aplikacji
  await page.click('[data-testid="test-flush"]');
  await page.waitForTimeout(800);
  check("wysyłka bez sieci nie rzuca błędem", errors.length === 0, errors.slice(0, 2).join(" | "));

  // --- 7. powrót sieci uruchamia próbę wysyłki
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1500);
  const status = await page.textContent('[data-testid="sync-status"]');
  check("po powrocie sieci silnik reaguje", status.includes("sieć: jest"), status.trim());

  await page.screenshot({ path: `${OUT}/diag-360.png`, fullPage: true });

  // --- 8. brak poziomego przewijania na 360 px
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check("brak przewijania w bok na 360 px", overflow.doc <= overflow.win, `${overflow.doc} vs ${overflow.win}`);

  // --- 9. ekran startowy (bez sesji) pokazuje logowanie
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("h1");
  const home = await page.textContent("body");
  check("bez sesji wchodzi ekran logowania hasłem", home.includes("Hasło") && home.includes("Wejdź"));
  await page.screenshot({ path: `${OUT}/auth-360.png` });

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
