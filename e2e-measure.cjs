// Test fazy 4 (pomiar): kryteria akceptacji z promptu, na żywej bazie i żywym buildzie.
//
//   E2E_SESSION=<konto-z-historia.json> E2E_FRESH=<konto-swieze.json> node e2e-measure.cjs
//
// Konto świeże sprawdza próg R4 (bez kompletu pomiarów nie ma liczby głównej),
// konto z historią - całą resztę. Oba są czyszczone/przywracane, żeby test dało się
// puszczać w kółko.
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
  console.error("Podaj E2E_SESSION (konto z historią) i E2E_FRESH (konto świeże).");
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

function headers(who, extra = {}) {
  return {
    apikey: who.pub,
    Authorization: `Bearer ${who.session.access_token}`,
    "Accept-Profile": "system",
    "Content-Profile": "system",
    ...extra,
  };
}

async function rest(who, pathAndQuery, init = {}) {
  const r = await fetch(`${who.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: headers(who, init.headers),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

/** Jedna sesja przeglądarki z wstrzykniętą sesją użytkownika. */
async function open(browser, who) {
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
    [["system-auth", `sb-${projectRef}-auth-token`], JSON.stringify(who.session)]
  );
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}

(async () => {
  // Test dotyka modułów odblokowywanych w tygodniu 5, więc sam ustawia warunki zamiast
  // liczyć na stan zostawiony przez inny test - zestaw ma działać w dowolnej kolejności.
  const stateBefore = (await rest(auth, `program_state?select=*&owner=eq.${auth.user_id}`)).body?.[0];
  await rest(auth, `program_state?owner=eq.${auth.user_id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ program_week: 9, weighing_frequency: "daily", calorie_tracking_off: false }),
  });

  // Potwierdzenie zapisu przed otwarciem przeglądarki: urządzenie zaraz pobierze ten stan,
  // więc test nie może ruszyć, zanim serwer go faktycznie ma.
  const confirmed = (await rest(auth, `program_state?select=program_week&owner=eq.${auth.user_id}`)).body?.[0];
  if (confirmed?.program_week !== 9) {
    console.error(`Nie udało się przygotować konta: program_week = ${confirmed?.program_week}`);
    process.exit(2);
  }

  // --- przygotowanie danych: konto świeże ma mieć TYLKO dwa ważenia
  for (const table of ["daily_logs", "measurements", "progress_photos"]) {
    await rest(fresh, `${table}?owner=eq.${fresh.user_id}`, { method: "DELETE" });
  }
  const today = new Date();
  const iso = (back) => new Date(today.getTime() - back * 86_400_000).toISOString().slice(0, 10);
  await rest(fresh, "daily_logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { owner: fresh.user_id, log_date: iso(1), weight_kg: 78.4 },
      { owner: fresh.user_id, log_date: iso(0), weight_kg: 78.1 },
    ]),
  });

  const browser = await chromium.launch();

  // ==================================================== świeże konto: próg R4
  {
    const { page, ctx } = await open(browser, fresh);
    const body = await page.innerText("body");

    check(
      "przy dwóch pomiarach nie ma jeszcze średniej",
      /Zbieram dane\. Średnia pojawi się po/.test(body),
      body.match(/Zbieram dane[^.]*\.[^.]*\./)?.[0]?.slice(0, 60)
    );
    // liczymy hero WEWNĄTRZ modułu wagi - ekran „Dziś" ma własną liczbę główną (treningi w 28 dniach)
    const heroInWeight = await page
      .locator("section.sy-mod", { hasText: "Waga" })
      .locator(".dz-stat--hero")
      .count();
    check("dzienna waga nie zajmuje miejsca liczby głównej (R4)", heroInWeight === 0, `elementów hero w module wagi: ${heroInWeight}`);
    await ctx.close();
  }

  // ==================================================== konto z historią
  const { page, ctx, errors } = await open(browser, auth);

  // --- 1. waga
  const weightSection = page.locator("section.sy-mod", { hasText: "Waga" }).first();
  const hero = await weightSection.locator(".dz-stat--hero").innerText();
  check("liczbą główną wagi jest średnia", /ŚREDNIA/i.test(hero) && /\d+,\d/.test(hero), hero.replace(/\n/g, " "));

  const weightBlock = await weightSection.innerText();
  check(
    "dzisiejszy pomiar jest podany osobno, drobnym drukiem",
    /dziś:\s*\d+,\d/.test(weightBlock),
    weightBlock.match(/dziś:\s*[\d,]+/)?.[0]
  );

  // --- 2. białko: cel z 1,8 g/kg średniej
  const proteinBlock = await page.locator("section.sy-mod", { hasText: "Białko" }).first().innerText();
  const average = Number((hero.match(/(\d+,\d)/)?.[1] || "0").replace(",", "."));
  const target = Number(proteinBlock.match(/\/\s*(\d+)\s*g/)?.[1] || 0);
  const expected = Math.round((average * 1.8) / 10) * 10;
  check("cel białka to 1,8 g/kg średniej, zaokrąglone do dziesiątek", target === expected, `${target} g przy średniej ${average} (oczekiwane ${expected})`);

  // --- 3. kafelek dodaje jednym stuknięciem
  const before = Number(proteinBlock.match(/(\d+)\s*\/\s*\d+\s*g/)?.[1] || 0);
  await page.getByRole("button", { name: /Kurczak 200 g/ }).click();
  await page.waitForTimeout(900);
  const afterText = await page.locator("section.sy-mod", { hasText: "Białko" }).first().innerText();
  const after = Number(afterText.match(/(\d+)\s*\/\s*\d+\s*g/)?.[1] || 0);
  check("kafelek dodaje porcję jednym stuknięciem", after === before + 50, `${before} → ${after} g`);

  await page.getByRole("button", { name: /Cofnij 50 g/ }).click();
  await page.waitForTimeout(900);
  const undone = Number(
    (await page.locator("section.sy-mod", { hasText: "Białko" }).first().innerText()).match(/(\d+)\s*\/\s*\d+\s*g/)?.[1] || 0
  );
  check("pomyłkę da się cofnąć", undone === before, `${after} → ${undone} g`);

  // --- 4. sen: spójność zamiast długości
  const sleepBlock = await page.locator("section.sy-mod", { hasText: "Sen" }).first().innerText();
  check(
    "sen mierzy rozrzut godziny pobudki",
    /Odchylenie standardowe godziny pobudki/.test(sleepBlock),
    sleepBlock.split("\n").find((l) => l.includes("Odchylenie"))
  );
  check(
    "sen nie ocenia długości snu",
    !/za mało snu|spałeś|godzin snu|za krótko/i.test(sleepBlock)
  );

  await page.locator("section.sy-mod", { hasText: "Sen" }).getByRole("button", { name: "co o tym wiadomo" }).click();
  await page.waitForTimeout(500);
  const sheet = await page.locator(".dz-sheet__panel").innerText();
  const chips = await page.locator(".dz-sheet__panel .dz-chip").count();
  check("karta wiedzy o śnie ma cztery fakty ze źródłami", chips >= 4, `odnośników: ${chips}`);
  check(
    "fakty o śnie są konkretne (testosteron, masa beztłuszczowa, grelina, kcal)",
    /testosteron/i.test(sheet) && /beztłuszczow/i.test(sheet) && /grelin/i.test(sheet) && /270 kcal/.test(sheet)
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // --- 5. czego NIE ma być
  const todayText = await page.innerText("body");
  check(
    "nigdzie nie ma skanera kodów ani bazy produktów",
    !/skaner|kod kreskowy|baza produktów/i.test(todayText)
  );
  check("nigdzie nie ma BMI ani prognozy sylwetki", !/\bBMI\b|przewidywana sylwetka|jak będziesz wyglądać/i.test(todayText));
  check("na ekranie nie ma wykrzykników ani gratulacji", !/[!]|gratul|świetnie|brawo/i.test(todayText), todayText.match(/.{0,20}[!].{0,20}/)?.[0]);

  // --- 6. ekran Postęp
  await page.getByRole("button", { name: "Postęp" }).click();
  await page.waitForTimeout(1500);

  // Od fazy 4B ekran jest podzielony na zakładki, więc treść zbieramy przechodząc po nich;
  // na końcu zostajemy w „Ciele", bo tam są obwody i zdjęcia sprawdzane niżej.
  let progress = "";
  for (const tab of ["Siła", "Objętość", "Ciało"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(1100);
    progress += "\n" + (await page.innerText("main"));
  }

  check(
    "Postęp ma sekcje wagi, progresji, tonażu, objętości, obwodów i zdjęć",
    ["Waga", "Siła", "Tonaż", "Objętość na partię", "Obwody", "Zdjęcia"].every((s) =>
      progress.toUpperCase().includes(s.toUpperCase())
    ),
    progress.match(/[A-ZĄĆĘŁŃÓŚŹŻ ]{4,}/g)?.slice(0, 8).join(" | ")
  );
  check("objętość odnosi się do zakresu 12-18 serii", /12-18 serii/.test(progress));

  const wide = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check("brak przewijania w bok na 360 px", wide.doc <= wide.win, `${wide.doc} vs ${wide.win}`);
  await page.screenshot({ path: `${OUT}/progress-360.png`, fullPage: true });

  // --- 7. zdjęcia lądują w prywatnym buckecie
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const inputs = page.locator('input[type="file"]');
  await inputs.setInputFiles({ name: "front.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await page.waitForTimeout(2500);
  const photos = await rest(auth, `progress_photos?select=id,storage_path,taken_on&owner=eq.${auth.user_id}`);
  check("zdjęcie zapisało się z wierszem w bazie", photos.status === 200 && photos.body.length >= 1, `zdjęć: ${photos.body?.length}`);

  const stored = photos.body?.[photos.body.length - 1];
  if (stored) {
    const pub = await fetch(`${auth.url}/storage/v1/object/public/progress-photos/${stored.storage_path}`);
    check("zdjęcia nie da się pobrać publicznym adresem", pub.status >= 400, `status ${pub.status}`);
    const own = await fetch(`${auth.url}/storage/v1/object/progress-photos/${stored.storage_path}`, {
      headers: { apikey: auth.pub, Authorization: `Bearer ${auth.session.access_token}` },
    });
    check("właściciel pobiera swoje zdjęcie", own.status === 200, `status ${own.status}`);
    check("plik leży w folderze właściciela", stored.storage_path.startsWith(`${auth.user_id}/`), stored.storage_path.slice(0, 40));
  }

  // drugie zdjęcie: siatka porównawcza
  await inputs.setInputFiles({ name: "front2.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await page.waitForTimeout(2500);
  const cells = await page.locator(".sy-shots__cell").count();
  check("porównanie pokazuje dwa kadry obok siebie", cells === 2, `kadrów: ${cells}`);

  // --- 8. obwody z deltą
  await page.getByRole("button", { name: /pomiar/ }).first().click();
  await page.waitForTimeout(400);
  for (const [label, value] of [["Ramię napięte", "36"], ["Klatka", "100"], ["Talia", "80"], ["Udo", "56"]]) {
    await page.getByLabel(`${label} w centymetrach`).fill(value);
  }
  await page.getByRole("button", { name: "Zapisz pomiar" }).click();
  await page.waitForTimeout(1500);
  const table = await page
    .locator("section.sy-section", { hasText: "Obwody" })
    .locator(".dz-table")
    .first()
    .innerText();
  check("obwody zapisują się i trafiają do tabeli", /36/.test(table) && /100/.test(table), table.split("\n").slice(0, 3).join(" | "));

  // --- 9. R7: wyłączenie ważenia usuwa moduł
  await page.getByRole("button", { name: "Dziś" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "ustawienia" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Nie ważę się wcale" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "wróć" }).click();
  await page.waitForTimeout(1200);
  const withoutWeight = await page.innerText("main");
  check(
    "po wyłączeniu ważenia moduł wagi znika z ekranu Dziś (R7)",
    !/ŚREDNIA 7-DNIOWA|Zapisz wagę/.test(withoutWeight)
  );
  check("aplikacja nie proponuje włączenia ważenia z powrotem", !/włącz ważenie|wróć do ważenia/i.test(withoutWeight));

  // sprzątanie: konto testowe wraca do ważenia codziennego
  await page.getByRole("button", { name: "ustawienia" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Ważę się codziennie" }).click();
  await page.waitForTimeout(900);

  // sprzątanie zdjęć testowych - inaczej każdy przebieg zostawia dwa pliki w buckecie
  const mine = await rest(auth, `progress_photos?select=id,storage_path&owner=eq.${auth.user_id}`);
  for (const row of mine.body ?? []) {
    await fetch(`${auth.url}/storage/v1/object/progress-photos/${row.storage_path}`, {
      method: "DELETE",
      headers: { apikey: auth.pub, Authorization: `Bearer ${auth.session.access_token}` },
    });
  }
  await rest(auth, `progress_photos?owner=eq.${auth.user_id}`, { method: "DELETE" });

  if (stateBefore) {
    await rest(auth, `program_state?owner=eq.${auth.user_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        program_week: stateBefore.program_week,
        weighing_frequency: stateBefore.weighing_frequency,
        calorie_tracking_off: stateBefore.calorie_tracking_off,
      }),
    });
  }

  const appErrors = errors.filter((e) => !/Failed to load resource|Failed to fetch/i.test(e));
  check("brak błędów aplikacji w całym przebiegu", appErrors.length === 0, appErrors.slice(0, 2).join(" | "));

  await ctx.close();
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
