// Test fazy 4B (monitoring). Sprawdza to, co ma działać, ORAZ to, czego w monitoringu
// być nie może: łączonego wyniku dnia, odznak, diagnozowania bólu i ocen przy prognozie.
//
//   E2E_SESSION=<konto-z-historia.json> node e2e-monitoring.cjs
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

const iso = (back) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

(async () => {
  // czyszczenie danych monitoringu konta testowego, żeby test dało się puszczać w kółko
  for (const table of ["personal_records", "pain_log", "weekly_snapshots", "calibration_tests"]) {
    await rest(`${table}?owner=eq.${auth.user_id}`, { method: "DELETE" });
  }

  // ---------------------------------------- prognoza w bazie
  // Prognoza jest osobista i startuje pusta (README, sekcja Prognoza): bez punktów porównania niżej są pomijane.
  const forecast = await rest("forecast_points?select=metric,month_index,value_realistic&order=month_index");
  const jestPrognoza = (forecast.body ?? []).length > 0;
  check("tabela prognozy odpowiada", Array.isArray(forecast.body), `punktów: ${forecast.body?.length}`);

  const browser = await chromium.launch();
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
  await page.waitForTimeout(3000);

  // ---------------------------------------- rekordy powstają OFFLINE
  const startTraining = page.getByRole("button", { name: /Zacznij trening|Jeszcze jeden trening/ });
  await startTraining.waitFor();
  await startTraining.click();
  await page.waitForSelector(".sy-steppers");

  await ctx.setOffline(true);

  // Ciężar musi być wyższy niż cokolwiek w historii konta, także z poprzednich przebiegów
  // tego testu - inaczej drugie uruchomienie nie miałoby czym pobić rekordu.
  const heaviest = (await rest(`sets?select=weight_kg&owner=eq.${auth.user_id}&order=weight_kg.desc&limit=1`)).body?.[0];
  const recordWeight = Math.round((Number(heaviest?.weight_kg ?? 0) + 5) * 10) / 10;
  const inputs = page.locator(".dz-stepper__input");
  await inputs.nth(0).fill(String(recordWeight));
  await page.locator(".sy-save").click();
  await page.waitForTimeout(1200);

  const offlineRecords = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("system");
        req.onsuccess = () => {
          const tx = req.result.transaction("personalRecords", "readonly");
          const all = tx.objectStore("personalRecords").getAll();
          all.onsuccess = () => resolve(all.result.map((r) => ({ type: r.record_type, value: r.value, synced: r.synced })));
        };
      })
  );

  check(
    "rekord powstaje bez sieci, od razu po zapisaniu serii",
    offlineRecords.some((r) => r.type === "max_weight" && r.value === recordWeight),
    `zapisane offline: ${offlineRecords.map((r) => r.type).join(", ") || "brak"}`
  );
  check(
    "rekord zapisany offline czeka w kolejce, a nie ginie",
    offlineRecords.every((r) => r.synced === 0)
  );

  // ---------------------------------------- rekord w podsumowaniu jako zdanie faktu
  await page.locator('.sy-session__foot >> text=Zakończ').click();
  await page.waitForSelector("text=Tonaż");
  const summary = await page.innerText("main");
  check("podsumowanie pokazuje rekord jako zdanie", new RegExp(`pierwszy raz na tym ciężarze|${String(recordWeight).replace(".", ",")}`).test(summary));
  check(
    "rekord nie dostaje odznaki, ikony ani gratulacji",
    !/[!]|🏆|⭐|🔥|odznak|gratul|osiągnięcie/i.test(summary),
    summary.replace(/\s+/g, " ").slice(0, 70)
  );
  const images = await page.locator("main img, main svg").count();
  check("w podsumowaniu nie ma grafiki towarzyszącej rekordowi", images === 0, `elementów graficznych: ${images}`);

  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(3000);

  const onServer = await rest(`personal_records?select=record_type,value&owner=eq.${auth.user_id}`);
  check(
    "rekord dociera na serwer po powrocie sieci",
    (onServer.body ?? []).some((r) => Number(r.value) === recordWeight),
    `rekordów na serwerze: ${onServer.body?.length}`
  );

  await page.getByRole("button", { name: /Wróć/ }).click();
  await page.waitForTimeout(1500);

  // ---------------------------------------- log bólu: wzorzec odsyła do fizjoterapeuty
  // Zgłoszenia idą przez interfejs, bo sygnał wzorca liczy się z bazy NA URZĄDZENIU -
  // wpis dodany wyłącznie na serwerze nie byłby tym samym scenariuszem.
  let sheet = "";
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Coś boli" }).first().click();
    await page.waitForTimeout(700);
    await page.locator(".dz-sheet__panel .sy-tile", { hasText: "Bark" }).click();
    await page.getByRole("button", { name: "Zapisz zgłoszenie" }).click();
    await page.waitForTimeout(1200);
    sheet = await page.locator(".dz-sheet__panel").innerText();
    if (i < 2) {
      await page.locator(".dz-sheet__panel button.sy-btn", { hasText: "Zamknij" }).click();
      await page.waitForTimeout(500);
    }
  }

  check("trzecie zgłoszenie tego samego miejsca odsyła do fizjoterapeuty", /fizjoterapeutę, nie na zmianę ćwiczenia/.test(sheet));
  check(
    "aplikacja nie diagnozuje i nie proponuje ćwiczeń zastępczych",
    !/rozciąg|wzmocnij|prawdopodobnie|to zapewne|zamiast tego|ćwiczeni[ea] korekcyjn/i.test(sheet),
    sheet.replace(/\s+/g, " ").slice(0, 80)
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // ---------------------------------------- ekran Postęp: sekcje i zakazy
  await page.getByRole("button", { name: "Postęp" }).click();
  await page.waitForTimeout(1500);

  const tabs = ["Przegląd", "Siła", "Objętość", "Ciało", "Nawyki", "Kalibracja", "Historia"];
  let allText = "";
  let widest = 0;
  for (const tab of tabs) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(900);
    allText += "\n" + (await page.innerText("main"));
    widest = Math.max(widest, await page.evaluate(() => document.documentElement.scrollWidth));
  }

  check("wszystkie siedem sekcji się otwiera", tabs.every((t) => allText.includes(t.toUpperCase())));
  check("brak przewijania w bok na 360 px w każdej sekcji", widest <= 360, `${widest} px`);
  check(
    "nigdzie nie ma łączonego wyniku dnia ani odznak",
    !/wynik dnia|progress score|punkty|odznak|poziom \d|liga/i.test(allText)
  );
  check("nigdzie nie ma BMI ani prognozy sylwetki", !/\bBMI\b|tkanki tłuszczowej|jak będziesz wyglądać/i.test(allText));
  check("szacowany maks jest opisany jako oszacowanie", /Oszacowanie ze wzoru|oszacowanie z Twoich danych|Szacowany maks/i.test(allText));
  check("kalendarz nawyków pokazuje trafność jako licznik, nie procent", /\d+ z \d+/.test(allText) && !/\d+%/.test(allText));

  // ---------------------------------------- prognoza: próg 8 tygodni
  await page.getByRole("button", { name: "Siła", exact: true }).click();
  await page.waitForTimeout(900);
  await page.getByLabel("Ćwiczenie").selectOption({ label: "Wyciskanie sztangi na ławce płaskiej" });
  await page.waitForTimeout(1500);
  const strength = await page.innerText("main");

  const state = (await rest(`program_state?select=started_on&owner=eq.${auth.user_id}`)).body?.[0];
  const weeks = Math.floor((Date.now() - new Date(state.started_on).getTime()) / (7 * 86_400_000));
  if (weeks < 8) {
    check("porównanie z prognozą jest niedostępne przed ośmioma tygodniami", /Za mało danych. Porównanie pojawi się po 8 tygodniach/.test(strength), `tygodni danych: ${weeks}`);
  } else {
    check("porównanie z prognozą jest dostępne po ośmiu tygodniach", /scenariusz|prognoz/i.test(strength), `tygodni danych: ${weeks}`);
  }

  // ---------------------------------------- prognoza po cofnięciu startu programu
  // Data startu zmienia się na serwerze, a urządzenie dostaje ją przez odzyskiwanie
  // danych na czystą bazę - czyli tę samą drogą co po zmianie telefonu.
  await rest(`program_state?owner=eq.${auth.user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ started_on: iso(120) }),
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

  const restored = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("system");
        req.onsuccess = () => {
          const tx = req.result.transaction(["personalRecords", "painLog"], "readonly");
          const prs = tx.objectStore("personalRecords").count();
          prs.onsuccess = () => {
            const pains = tx.objectStore("painLog").count();
            pains.onsuccess = () => resolve({ records: prs.result, pains: pains.result });
          };
        };
      })
  );
  check(
    "puste urządzenie odzyskuje rekordy i log bólu z serwera",
    restored.records > 0 && restored.pains > 0,
    `rekordów ${restored.records}, zgłoszeń bólu ${restored.pains}`
  );
  await page.getByRole("button", { name: "Postęp" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Siła", exact: true }).click();
  await page.waitForTimeout(900);
  await page.getByLabel("Ćwiczenie").selectOption({ label: "Wyciskanie sztangi na ławce płaskiej" });
  await page.waitForTimeout(1800);
  const forecastText = await page.innerText("main");

  if (jestPrognoza) {
    check("po ośmiu tygodniach pojawia się zestawienie z prognozą", /scenariusz|przewidywanym zakresie/i.test(forecastText), forecastText.match(/Jesteś[^.]*\./)?.[0] ?? "");
    check(
      "wynik poniżej pasma pokazuje frekwencję zamiast oceny",
      !/Jesteś poniżej/.test(forecastText) || /Frekwencja w tym okresie/.test(forecastText)
    );
  } else {
    check("bez punktów prognozy panel mówi to wprost", /Brak prognozy/.test(forecastText), forecastText.match(/Brak prognozy[^.]*\./)?.[0] ?? "");
  }
  check("zestawienie z prognozą nie ocenia użytkownika", !/niestety|słabo|musisz|powinieneś|zawiodł/i.test(forecastText));

  if (jestPrognoza) {
    await page.getByRole("button", { name: /co to znaczy/ }).click();
    await page.waitForTimeout(600);
    const dip = await page.innerText("main");
    check("dołek w miesiącach 2-3 jest wyjaśniony", /Większość ludzi rezygnuje właśnie tutaj/.test(dip));
  }
  await page.screenshot({ path: `${OUT}/monitoring-forecast.png`, fullPage: true });

  // ---------------------------------------- migawka tygodnia jest niemodyfikowalna
  await page.getByRole("button", { name: "Historia", exact: true }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Zamknij tydzień" }).click();
  await page.waitForTimeout(2500);

  const afterFirst = (await rest(`weekly_snapshots?select=week_start,sessions_done&owner=eq.${auth.user_id}`)).body ?? [];
  check("zamknięcie tygodnia zapisuje migawkę", afterFirst.length === 1, `migawek: ${afterFirst.length}`);

  const stillThere = await page.locator("text=Zamknij tydzień").count();
  check("zamkniętego tygodnia nie da się zamknąć drugi raz", stillThere === 0);

  const historyText = await page.innerText("main");
  check("historia tygodni jest przeglądalna", /Tydzień od/.test(historyText), historyText.match(/Tydzień od[^\n]*/)?.[0]);

  const appErrors = errors.filter((e) => !/Failed to load resource|Failed to fetch|ERR_INTERNET_DISCONNECTED/i.test(e));
  check("brak błędów aplikacji w całym przebiegu", appErrors.length === 0, appErrors.slice(0, 2).join(" | "));

  // przywrócenie daty startu
  await rest(`program_state?owner=eq.${auth.user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ started_on: state.started_on }),
  });

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
