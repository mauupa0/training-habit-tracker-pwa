// Test fazy 6 (wiedza, modele, eksport). Najważniejsza część robi się z odciętą siecią:
// moduł wiedzy i eksport mają działać tam, gdzie nie ma zasięgu.
//
//   E2E_SESSION=<konto-z-historia.json> node e2e-wiedza.cjs
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
  console.error("Podaj E2E_SESSION - konto testowe.");
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

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    locale: "pl-PL",
    acceptDownloads: true,
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
  await page.waitForTimeout(3000);

  // od tego miejsca wszystko dzieje się bez sieci
  await ctx.setOffline(true);

  await page.getByRole("button", { name: "Wiedza" }).click();
  await page.waitForTimeout(1200);
  const list = await page.innerText("main");

  const CHAPTERS = [
    "Jak działa plan",
    "Trzy korekty w planie",
    "Dieta",
    "Sen",
    "Suplementy",
    "Nawyki",
    "Motywacja działa przeciwko Tobie",
    "Modele mentalne",
    "Czego nie wiemy",
    "Realne oczekiwania",
    "Źródła",
  ];
  check(
    "wszystkie rozdziały widoczne bez sieci",
    CHAPTERS.every((c) => list.includes(c)),
    CHAPTERS.filter((c) => !list.includes(c)).join(", ") || "komplet"
  );

  // ---------------------------------------- wyszukiwarka offline
  await page.getByLabel("Szukaj w treści").fill("bialko");
  await page.waitForTimeout(700);
  const found = await page.innerText("main");
  const shown = CHAPTERS.filter((c) => found.includes(c)).length;
  check(
    "wyszukiwarka działa bez ogonków i bez sieci",
    /Dieta/.test(found) && shown < CHAPTERS.length,
    `pasujących rozdziałów: ${shown} z ${CHAPTERS.length}`
  );

  await page.getByLabel("Szukaj w treści").fill("kreatyna");
  await page.waitForTimeout(700);
  const creatine = await page.innerText("main");
  check("wyszukiwarka znajduje rozdział po treści, nie tylko po tytule", /Suplementy/.test(creatine));

  await page.getByLabel("Szukaj w treści").fill("qqqqq");
  await page.waitForTimeout(700);
  check("brak wyników mówi to wprost", /Nic takiego tu nie ma/.test(await page.innerText("main")));
  await page.getByLabel("Szukaj w treści").fill("");
  await page.waitForTimeout(500);

  // ---------------------------------------- „Czego nie wiemy"
  await page.getByRole("button", { name: /Czego nie wiemy/ }).click();
  await page.waitForTimeout(900);
  const limits = await page.innerText("main");
  const POINTS = ["Sztanga wobec hantli", "Kolejność ćwiczeń", "Przedziały powtórzeń", "Deload", "Ograniczenia prób", "pozycjach wydłużonych"];
  check(
    "rozdział o granicach wiedzy ma wszystkie sześć punktów",
    POINTS.every((p) => limits.includes(p)),
    POINTS.filter((p) => !limits.includes(p)).join(", ") || "komplet"
  );
  await page.getByRole("button", { name: "wróć" }).click();
  await page.waitForTimeout(700);

  // ---------------------------------------- cztery obalone slogany
  await page.getByRole("button", { name: /Motywacja działa przeciwko Tobie/ }).click();
  await page.waitForTimeout(900);
  // Werdykty stoją w elemencie z wersalikami z CSS, więc porównujemy bez wielkości liter.
  const motivation = (await page.innerText("main")).toLowerCase();
  check(
    "cztery slogany mają werdykty",
    ["obalone", "brak dowodów", "półprawda", "aktywnie szkodzą"].every((v) => motivation.includes(v)),
    ["obalone", "brak dowodów", "półprawda", "aktywnie szkodzą"].filter((v) => !motivation.includes(v)).join(", ") || "komplet"
  );
  const chips = await page.locator("main .dz-chip").count();
  check("slogany mają klikalne źródła", chips >= 4, `odnośników: ${chips}`);

  await page.locator("main .dz-chip").first().click();
  await page.waitForTimeout(600);
  const sourceSheet = await page.locator(".dz-sheet__panel").innerText();
  check("odnośnik otwiera kartę źródła z identyfikatorem", /DOI|PMID/.test(sourceSheet), sourceSheet.replace(/\s+/g, " ").slice(0, 60));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "wróć" }).click();
  await page.waitForTimeout(700);

  // ---------------------------------------- modele mentalne
  await page.getByRole("button", { name: /Modele mentalne 13 kart/ }).click();
  await page.waitForTimeout(900);
  const models = await page.innerText("main");
  const cards = await page.locator("main .sy-mod").count();
  check("trzynaście kart modeli", cards === 13, `kart: ${cards}`);
  check("karta o czytaniu ludzi podaje liczby z metaanalizy", /54%/.test(models) && /53,8%/.test(models));
  check("karta 12 jest wyróżniona wizualnie", (await page.locator("main .sy-mod--mark").count()) === 1);
  check("karta 12 mówi o narzędziu do bicia samego siebie", /narzędzie do bicia samego siebie/.test(models));
  await page.screenshot({ path: `${OUT}/wiedza-modele.png`, fullPage: true });
  await page.getByRole("button", { name: "wróć" }).click();
  await page.waitForTimeout(700);

  // ---------------------------------------- werdykty o pięciu książkach
  await page.getByRole("button", { name: /Modele mentalne 1 sekcji/ }).click();
  await page.waitForTimeout(900);
  const books = await page.innerText("main");
  check(
    "werdykty o pięciu książkach są obecne",
    ["Housel", "Sun Tzu", "Dobelli", "Peterson", "King"].every((b) => books.includes(b)),
    ["Housel", "Sun Tzu", "Dobelli", "Peterson", "King"].filter((b) => !books.includes(b)).join(", ") || "komplet"
  );
  check("krytyka Dobellego podaje wynik replikacji", /36% ze 97/.test(books));
  check("krytyka Kinga tłumaczy, czemu jest szkodliwa", /podnosi pewność/.test(books) && /54%/.test(books));
  await page.getByRole("button", { name: "wróć" }).click();
  await page.waitForTimeout(700);

  // ---------------------------------------- realne oczekiwania z Postępu
  await page.getByRole("button", { name: "Postęp" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Realne oczekiwania/ }).click();
  await page.waitForTimeout(700);
  const expectations = await page.innerText("main");
  check(
    "Realne oczekiwania dostępne z ekranu Postęp",
    /większość ludzi rezygnuje/i.test(expectations) && /4-7 kg/.test(expectations)
  );
  check("Realne oczekiwania nie pokazują wizualizacji sylwetki", !/sylwetk[ai] za|wygenerowan|zobacz jak będziesz/i.test(expectations));

  // ---------------------------------------- eksport offline
  await page.getByRole("button", { name: "Dziś" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "ustawienia" }).click();
  await page.waitForTimeout(900);

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj JSON" }).click();
  const json = await jsonDownload;
  const jsonPath = path.join(OUT, "eksport.json");
  await json.saveAs(jsonPath);
  const bundle = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  check("eksport JSON działa bez sieci", Object.keys(bundle.data ?? {}).length >= 16, `tabel: ${Object.keys(bundle.data ?? {}).length}`);
  check("eksport ma wersję schematu i znacznik czasu", Boolean(bundle.schema_version) && Boolean(bundle.exported_at));
  check(
    "eksport obejmuje tabele monitoringu z fazy 4B",
    ["personalRecords", "painLog", "weeklySnapshots", "habitDaily", "calibrationTests"].every((t) => t in bundle.data),
    Object.keys(bundle.data).join(", ").slice(0, 80)
  );
  check("eksport zawiera realne dane, nie puste tabele", (bundle.counts?.sets ?? 0) > 0, `serii: ${bundle.counts?.sets}`);

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj CSV" }).click();
  const csv = await csvDownload;
  const csvPath = path.join(OUT, "eksport-sets.csv");
  await csv.saveAs(csvPath);
  const csvText = fs.readFileSync(csvPath, "utf8");
  check("eksport CSV działa bez sieci i ma nagłówek", /weight_kg/.test(csvText) && csvText.split("\n").length > 1, csvText.split("\n")[0]?.slice(0, 60));

  // ---------------------------------------- karta 12 również w ustawieniach
  const settings = await page.innerText("main");
  check("karta 12 jest dostępna z ustawień", /narzędzie do bicia samego siebie/.test(settings));
  check(
    "usuwanie danych ma podwójne potwierdzenie",
    /Usuń wszystkie dane z tego urządzenia/.test(settings)
  );
  await page.getByRole("button", { name: /Usuń wszystkie dane/ }).click();
  await page.waitForTimeout(600);
  const confirmStage = await page.innerText("main");
  check("pierwsze kliknięcie nie kasuje, tylko pyta", /Na pewno\? Kliknij raz jeszcze/.test(confirmStage));
  check("aplikacja mówi, że kopia na serwerze zostaje", /Kopia na serwerze zostaje/.test(confirmStage));

  const appErrors = errors.filter((e) => !/Failed to load resource|Failed to fetch|ERR_INTERNET_DISCONNECTED/i.test(e));
  check("brak błędów aplikacji w całym przebiegu", appErrors.length === 0, appErrors.slice(0, 2).join(" | "));

  await ctx.setOffline(false);
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} przeszło`);
  process.exit(failed.length ? 1 : 0);
})();
