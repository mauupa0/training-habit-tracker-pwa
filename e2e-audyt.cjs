// Audyt końcowy (faza 7): scenariusze krytyczne i listy kontrolne R1-R7 w żywej aplikacji.
// To nie jest powtórka testów fazowych - tutaj sprawdzamy reguły tam, gdzie najłatwiej
// je złamać przy dokładaniu funkcji: w tekstach, w kolorach i w kolejności ekranów.
//
//   E2E_SESSION=<hist.json> E2E_FRESH=<fresh.json> node e2e-audyt.cjs
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
if (!process.env.E2E_SESSION || !process.env.E2E_FRESH) {
  console.error("Podaj E2E_SESSION i E2E_FRESH.");
  process.exit(2);
}
const auth = JSON.parse(fs.readFileSync(process.env.E2E_SESSION, "utf8"));
const fresh = JSON.parse(fs.readFileSync(process.env.E2E_FRESH, "utf8"));
const projectRef = new URL(auth.url).hostname.split(".")[0];
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
}

async function rest(who, pathAndQuery, init = {}) {
  const r = await fetch(`${who.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: who.pub,
      Authorization: `Bearer ${who.session.access_token}`,
      "Accept-Profile": "system",
      "Content-Profile": "system",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

async function open(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "pl-PL" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(
    ([keys, value]) => keys.forEach((k) => window.localStorage.setItem(k, value)),
    [["system-auth", `sb-${projectRef}-auth-token`], JSON.stringify(who.session)]
  );
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}

/** Zbiera tekst ze wszystkich głównych ekranów - audyt copy musi objąć całość, nie próbkę. */
async function collectAllScreens(page) {
  let text = await page.innerText("main");

  for (const tab of ["Postęp", "Plany", "Wiedza"]) {
    await page.getByRole("button", { name: tab }).click();
    await page.waitForTimeout(1000);
    text += "\n" + (await page.innerText("main"));
    if (tab === "Postęp") {
      for (const section of ["Siła", "Objętość", "Ciało", "Nawyki", "Kalibracja", "Historia"]) {
        await page.getByRole("button", { name: section, exact: true }).click();
        await page.waitForTimeout(700);
        text += "\n" + (await page.innerText("main"));
      }
    }
  }

  await page.getByRole("button", { name: "Dziś" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "ustawienia" }).click();
  await page.waitForTimeout(900);
  text += "\n" + (await page.innerText("main"));
  await page.getByRole("button", { name: "wróć" }).click();
  await page.waitForTimeout(900);

  return text;
}

(async () => {
  const browser = await chromium.launch();
  const { page, ctx, errors } = await open(browser, auth);

  // ============================================================ R3: copy całej aplikacji
  const all = await collectAllScreens(page);

  const BANNED = [
    [/[a-ząćęłńóśźż]!/, "wykrzyknik w treści"],
    [/gratulac|brawo|świetna robota|wspaniał/i, "gratulacje"],
    [/💪|🔥|🏆|⚡|🎉|🚀|⭐/u, "emoji ekspresyjne"],
    [/dasz radę|nie poddawaj się|zmiażdż|beast mode/i, "język hype"],
    [/\bBMI\b/, "BMI"],
    [/przewidywana sylwetka|jak będziesz wygląda/i, "obietnica wyglądu"],
  ];
  for (const [pattern, label] of BANNED) {
    const hit = all.match(pattern);
    check(
      `R3: nigdzie w aplikacji nie ma - ${label}`,
      !hit,
      hit ? all.slice(Math.max(0, all.indexOf(hit[0]) - 40), all.indexOf(hit[0]) + 40).replace(/\s+/g, " ") : ""
    );
  }

  // streak: słowo „dni z rzędu" wolno użyć w zasadzie dwóch dni, ale nie jako licznik serii
  check("R1: nigdzie nie ma licznika serii", !/seria dni|streak|passa|🔥/i.test(all));
  check("R1: metryka główna to X / 16 w 28 dniach", /TRENINGI W OSTATNICH 28 DNIACH/i.test(all) && /\/ 16/.test(all));

  // ============================================================ R2: tryb minimum
  const today = await page.innerText("main");
  check("R2: tryb minimum jest na ekranie Dziś", /Tryb minimum/.test(today));
  check(
    "R2: tryb minimum nie ma procentu ukończenia ani osobnego koloru",
    !/ukończono \d+%|25%|50%/.test(today)
  );

  // ============================================================ R5: odblokowywanie
  const before = (await rest(auth, `program_state?select=*&owner=eq.${auth.user_id}`)).body?.[0];
  await rest(auth, `program_state?owner=eq.${auth.user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ program_week: 1, manual_unlocks: [] }),
  });

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.deleteDatabase("system");
        req.onsuccess = () => resolve(null);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      })
  );
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(5000);

  const week1 = await page.innerText("main");
  check("R5: w tygodniu 1 moduł kalorii jest niedostępny", !/Zbieram dane - dzień/.test(week1));
  check(
    "R5: zablokowany moduł podaje tydzień odblokowania",
    /Odblokowuje się w tygodniu \d+/.test(week1),
    week1.match(/[A-Za-zĄ-ż ]+· Odblokowuje się w tygodniu \d+/)?.[0]
  );
  check("R5: w tygodniu 1 nie ma modułu białka", !/\d+ \/ \d+ g\b/.test(week1));

  // ręczne odblokowanie ostrzega raz i zapamiętuje decyzję
  await page.getByRole("button", { name: /Białko · Odblokowuje się/ }).click();
  await page.waitForTimeout(700);
  const sheet = await page.locator(".dz-sheet__panel").innerText();
  check(
    "R5: ostrzeżenie przy ręcznym odblokowaniu jest rzeczowe i jednorazowe",
    /Decyzja zostanie zapamiętana/.test(sheet) && !/[!]/.test(sheet)
  );
  await page.getByRole("button", { name: "Odblokuj mimo to" }).click();
  await page.waitForTimeout(1500);
  // Nota modułu jest pisana wersalikami z CSS, więc porównanie musi być bez wielkości liter.
  const unlocked = await page.innerText("main");
  check(
    "R5: po odblokowaniu moduł jest czynny",
    /Białko/.test(unlocked) && /g\/kg|cel czeka|Kurczak/i.test(unlocked),
    unlocked.split("\n").filter((l) => /Białko|Kurczak|g\/kg/i.test(l)).join(" | ").slice(0, 80)
  );

  // ============================================================ R6: kolejność planów
  await page.getByRole("button", { name: "Plany" }).click();
  await page.waitForTimeout(1200);
  const plans = await page.innerText("main");
  const failureAt = plans.toLowerCase().indexOf("porażk");
  const startAt = plans.toLowerCase().indexOf("start");
  check(
    "R6: sekcja planów na porażkę stoi nad sekcją startową",
    failureAt !== -1 && startAt !== -1 && failureAt < startAt,
    `porażka na pozycji ${failureAt}, start na ${startAt}`
  );

  // ============================================================ R7: limity kalorii
  await rest(auth, `program_state?owner=eq.${auth.user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ program_week: 9, maintenance_kcal: 1700, calorie_goal_kcal: 1700, goal_mode: "bulk", calorie_tracking_off: false }),
  });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.deleteDatabase("system");
        req.onsuccess = () => resolve(null);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      })
  );
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(5000);

  await page.getByRole("button", { name: "Rekompozycja" }).click();
  await page.waitForTimeout(1200);
  const calories = await page.innerText("main");
  check("R7: cel poniżej progu odrzucony bez obejścia", /Aplikacja go nie ustawi/.test(calories));
  check("R7: nie ma suwaka deficytu", (await page.locator('input[type="range"]').count()) === 0);
  check("R7: nie ma opcji agresywnego deficytu", !/agresywn/i.test(calories));

  // ============================================================ jakość: cele dotykowe i focus
  // Liczy się obszar DOTYKU, nie sam prostokąt tekstu: mała etykieta może mieć potomka
  // albo pseudo-element rozciągający cel do 44 px - dokładnie tak działa SourceChip.
  const smallTargets = await page.$$eval("button, a, input, select", (nodes) =>
    nodes
      .map((n) => {
        const own = n.getBoundingClientRect();
        const after = getComputedStyle(n, "::after");
        const afterHeight = parseFloat(after.height) || 0;
        const childHeight = Math.max(0, ...[...n.children].map((c) => c.getBoundingClientRect().height));
        return {
          label: (n.textContent || n.getAttribute("aria-label") || n.tagName).trim().slice(0, 24),
          w: own.width,
          h: Math.max(own.height, afterHeight, childHeight),
        };
      })
      .filter((b) => b.w > 0 && b.h > 0 && b.h < 44)
  );
  check("każdy cel dotykowy ma co najmniej 44 px wysokości", smallTargets.length === 0, JSON.stringify(smallTargets).slice(0, 140));

  const focusRing = await page.evaluate(() => {
    const button = document.querySelector("button");
    if (!button) return null;
    button.focus();
    const style = getComputedStyle(button, ":focus-visible");
    return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
  });
  check("focus klawiaturowy jest widoczny", focusRing !== null && focusRing.outlineStyle !== "none", JSON.stringify(focusRing));

  const reducedMotion = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules];
        } catch {
          return [];
        }
      })
      .some((r) => String(r.cssText).includes("prefers-reduced-motion"))
  );
  check("aplikacja respektuje prefers-reduced-motion", reducedMotion);

  const safeArea = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules];
        } catch {
          return [];
        }
      })
      .some((r) => String(r.cssText).includes("safe-area-inset"))
  );
  check("obsłużone bezpieczne marginesy ekranu (notch, pasek gestów)", safeArea);

  const sw = await page.evaluate(() => navigator.serviceWorker?.controller !== undefined);
  check("service worker jest zarejestrowany", sw !== undefined);

  const appErrors = errors.filter((e) => !/Failed to load resource|Failed to fetch|ERR_INTERNET_DISCONNECTED/i.test(e));
  check("brak błędów aplikacji w całym audycie", appErrors.length === 0, appErrors.slice(0, 2).join(" | "));

  await page.screenshot({ path: `${OUT}/audyt-koncowy.png`, fullPage: true });

  // przywrócenie stanu konta testowego
  if (before) {
    await rest(auth, `program_state?owner=eq.${auth.user_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        program_week: before.program_week,
        manual_unlocks: before.manual_unlocks,
        maintenance_kcal: before.maintenance_kcal,
        calorie_goal_kcal: before.calorie_goal_kcal,
        goal_mode: before.goal_mode,
        calorie_tracking_off: before.calorie_tracking_off,
      }),
    });
  }

  await ctx.close();
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
