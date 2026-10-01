// Test fazy 5 (kalorie). Połowa asercji to próby obejścia zabezpieczeń R7 -
// jeśli któraś przejdzie, moduł jest niebezpieczny, a nie „elastyczny”.
//
//   E2E_SESSION=<konto-z-historia.json> node e2e-calories.cjs
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
if (!process.env.E2E_SESSION) {
  console.error("Podaj E2E_SESSION - konto testowe z historią.");
  process.exit(2);
}
const auth = JSON.parse(fs.readFileSync(process.env.E2E_SESSION, "utf8"));
const projectRef = new URL(auth.url).hostname.split(".")[0];
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
}

async function rest(pathAndQuery, init = {}) {
  const r = await fetch(`${auth.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: auth.pub,
      Authorization: `Bearer ${auth.session.access_token}`,
      "Accept-Profile": "system",
      "Content-Profile": "system",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

/** Ustawia stan programu konta testowego - scenariusze wymagają różnych tygodni i celów. */
async function setState(patch) {
  return rest(`program_state?owner=eq.${auth.user_id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

async function readState() {
  const r = await rest(`program_state?select=*&owner=eq.${auth.user_id}`);
  return r.body?.[0] ?? null;
}

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "pl-PL" });
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
  await page.waitForTimeout(2200);
  return { ctx, page, errors };
}

const iso = (back) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

(async () => {
  const before = await readState();
  const browser = await chromium.launch();

  // ---------------------------------------- 1. przed tygodniem 7 modułu nie ma
  await setState({ program_week: 5, calorie_tracking_off: false, maintenance_kcal: null, calorie_goal_kcal: null });
  {
    const { page, ctx } = await open(browser);
    const body = await page.innerText("main");
    check("moduł kalorii jest niedostępny przed tygodniem 7", !/Zbieram dane - dzień/.test(body));
    check(
      "zablokowany moduł mówi, kiedy wejdzie",
      /Kalorie - pomiar · Odblokowuje się w tygodniu 7/.test(body),
      body.match(/Kalorie[^\n]*/)?.[0]?.slice(0, 60)
    );
    await ctx.close();
  }

  // ---------------------------------------- 2. tygodnie 7-8: pomiar bez celu
  await setState({ program_week: 7, maintenance_kcal: null, calorie_goal_kcal: null, goal_mode: null });
  {
    const { page, ctx } = await open(browser);
    const section = await page.locator("section.sy-mod", { hasText: "Kalorie" }).first().innerText();
    check("etap pomiaru pokazuje postęp zamiast celu", /Zbieram dane - dzień \d+ z 14/.test(section), section.split("\n")[2]);
    check("w etapie pomiaru nie ma żadnego celu", !/\/\s*\d+\s*kcal/.test(section));
    check("etap pomiaru nie ocenia wpisanych liczb", !/za dużo|za mało|przekroczyłeś|[!]/i.test(section));
    await ctx.close();
  }

  // ---------------------------------------- 3. tydzień 9: zapotrzebowanie z danych
  await setState({ program_week: 9, maintenance_kcal: null, calorie_goal_kcal: null, goal_mode: null, goal_revised_on: null });
  {
    const { page, ctx } = await open(browser);
    await page.waitForTimeout(2500);
    const state = await readState();
    const logs = (await rest(`daily_logs?select=log_date,calories_kcal,weight_kg&owner=eq.${auth.user_id}&order=log_date`)).body ?? [];
    const full = logs.filter((l) => l.calories_kcal !== null && l.weight_kg !== null).slice(-14);
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const expected =
      full.length === 14
        ? Math.round(
            avg(full.map((l) => l.calories_kcal)) -
              ((avg(full.slice(-7).map((l) => Number(l.weight_kg))) - avg(full.slice(0, 7).map((l) => Number(l.weight_kg)))) / 7) * 7700
          )
        : null;

    check(
      "zapotrzebowanie policzone z 14 dni własnych danych, nie ze wzoru",
      state?.maintenance_kcal !== null && Math.abs(state.maintenance_kcal - expected) <= 1,
      `aplikacja ${state?.maintenance_kcal}, policzone niezależnie ${expected}`
    );
    check(
      "cel to zapotrzebowanie minus umiarkowany deficyt",
      state?.calorie_goal_kcal === state?.maintenance_kcal - 350,
      `cel ${state?.calorie_goal_kcal} przy zapotrzebowaniu ${state?.maintenance_kcal}`
    );

    const section = await page.locator("section.sy-mod", { hasText: "Kalorie" }).first().innerText();
    check("cel podany z zastrzeżeniem, że to oszacowanie", /oszacowanie z Twoich danych, nie ze wzoru/.test(section));
    check(
      "nie ma suwaka ani trybu agresywnego (R7)",
      (await page.locator('input[type="range"]').count()) === 0 && !/agresywn/i.test(await page.innerText("body"))
    );
    check("rewizja niedostępna zaraz po ustawieniu celu", !/Sprawdź, czy zmienić cel/.test(section));
    await page.screenshot({ path: `${OUT}/calories-360.png`, fullPage: true });
    await ctx.close();
  }

  // ---------------------------------------- 4. rewizja dopiero po 14 dniach
  await setState({ goal_revised_on: iso(15) });
  {
    const { page, ctx } = await open(browser);
    const section = await page.locator("section.sy-mod", { hasText: "Kalorie" }).first().innerText();
    check("po dwóch tygodniach rewizja jest dostępna", /Sprawdź, czy zmienić cel/.test(section));

    const goalBefore = (await readState())?.calorie_goal_kcal;
    await page.getByRole("button", { name: "Sprawdź, czy zmienić cel" }).click();
    await page.waitForTimeout(1800);
    const goalAfter = (await readState())?.calorie_goal_kcal;
    check(
      "rewizja zmienia cel najwyżej o 200 kcal",
      Math.abs(goalAfter - goalBefore) <= 200,
      `${goalBefore} → ${goalAfter}`
    );
    await ctx.close();
  }

  // ---------------------------------------- 5. twarda podłoga bez obejścia
  await setState({ maintenance_kcal: 1700, calorie_goal_kcal: 1700, goal_mode: "bulk", goal_revised_on: iso(1) });
  {
    const { page, ctx } = await open(browser);
    await page.getByRole("button", { name: "Rekompozycja" }).click();
    await page.waitForTimeout(1500);
    const section = await page.locator("section.sy-mod", { hasText: "Kalorie" }).first().innerText();
    check(
      "cel poniżej bezpiecznego progu jest odrzucany",
      /Aplikacja go nie ustawi/.test(section),
      section.match(/Ten cel[^]{0,60}/)?.[0]?.replace(/\n/g, " ")
    );
    check("odrzucenie odsyła do specjalisty, a nie do ustawień", /dietetykiem albo lekarzem/.test(section));
    check(
      "nie ma przycisku obejścia typu „ustaw mimo to”",
      !/ustaw mimo to|mimo wszystko|kontynuuj/i.test(await page.innerText("body"))
    );
    const state = await readState();
    check("odrzucony cel nie trafia do bazy", state?.calorie_goal_kcal !== 1200, `w bazie ${state?.calorie_goal_kcal}`);
    await ctx.close();
  }

  // ---------------------------------------- 6. tryb bez ważenia
  await setState({ weighing_frequency: "never", maintenance_kcal: null, calorie_goal_kcal: null });
  {
    const { page, ctx } = await open(browser);
    const section = await page.locator("section.sy-mod", { hasText: "Kalorie" }).first().innerText();
    check("bez ważenia moduł tłumaczy ograniczenie", /Bez pomiarów wagi nie da się wyliczyć zapotrzebowania/.test(section));
    check(
      "bez ważenia aplikacja nie namawia do wchodzenia na wagę",
      !/włącz ważenie|zacznij się ważyć|musisz się ważyć/i.test(await page.innerText("body"))
    );
    await ctx.close();
  }

  // ---------------------------------------- 7. wyłącznik R7
  await setState({ weighing_frequency: "daily", program_week: 9 });
  {
    const { page, ctx } = await open(browser);
    await page.getByRole("button", { name: "ustawienia" }).click();
    await page.waitForTimeout(900);

    const dialogs = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await page.getByRole("button", { name: "Wyłącz liczenie kalorii" }).click();
    await page.waitForTimeout(1500);

    check("wyłączenie działa jednym kliknięciem, bez pytania o potwierdzenie", dialogs.length === 0);
    check("po wyłączeniu ustawienia mówią to wprost", /Białko i regularność posiłków/.test(await page.innerText("main")));
    check("wyłączenie zapisało się w stanie programu", (await readState())?.calorie_tracking_off === true);

    await page.getByRole("button", { name: "wróć" }).click();
    await page.waitForTimeout(1200);
    const main = await page.innerText("main");
    check("moduł kalorii znika z ekranu Dziś", !/Zbieram dane - dzień|kcal · rekompozycja/.test(main));
    check("reszta aplikacji działa dalej", /Białko/.test(main) && /Zacznij trening|Jeszcze jeden trening/.test(main));
    check(
      "aplikacja nie proponuje włączenia liczenia z powrotem",
      !/włącz liczenie|wróć do liczenia|chcesz znowu liczyć/i.test(main)
    );
    await ctx.close();
  }

  // ---------------------------------------- 8. ostrzeżenie o obsesyjnym liczeniu
  await setState({ calorie_tracking_off: false });
  {
    const { page, ctx, errors } = await open(browser);
    await page.locator("section.sy-mod", { hasText: "Kalorie" }).getByRole("button", { name: "jak to liczymy" }).click();
    await page.waitForTimeout(600);
    const sheet = await page.locator(".dz-sheet__panel").innerText();
    check("karta wiedzy ostrzega przed obsesyjnym liczeniem", /przestań liczyć/i.test(sheet));
    check("karta wiedzy tłumaczy, czemu nie ma wzoru", /47%/.test(sheet) && /nie ze wzoru|nie liczy zapotrzebowania ze wzoru/.test(sheet));
    check("wyłącznik jest też w module, nie tylko w ustawieniach", /Wyłącz liczenie kalorii/.test(sheet));

    const appErrors = errors.filter((e) => !/Failed to load resource|Failed to fetch/i.test(e));
    check("brak błędów aplikacji w całym przebiegu", appErrors.length === 0, appErrors.slice(0, 2).join(" | "));
    await ctx.close();
  }

  // przywrócenie stanu sprzed testu
  if (before) {
    await setState({
      program_week: before.program_week,
      weighing_frequency: before.weighing_frequency,
      calorie_tracking_off: before.calorie_tracking_off,
      maintenance_kcal: before.maintenance_kcal,
      calorie_goal_kcal: before.calorie_goal_kcal,
      goal_mode: before.goal_mode,
      goal_revised_on: before.goal_revised_on,
    });
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
