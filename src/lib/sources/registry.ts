// Rejestr źródeł naukowych.
//
// To nie jest tabela w bazie: dane nigdy się nie zmienią, a muszą być dostępne
// bez sieci. Każda liczba dawkowania w interfejsie odsyła tutaj przez <SourceChip>.
//
// `claim_pl` to jedno zdanie: co dokładnie z tej pracy wynika dla tej aplikacji.

export type Source = {
  key: string;
  authors: string;
  title: string;
  journal: string;
  year: number;
  locator?: string;
  doi?: string;
  pmid?: string;
  claim_pl: string;
};

export const SOURCES = {
  // ---------- objętość, częstotliwość, bliskość upadku ----------
  schoenfeld2017: {
    key: "schoenfeld2017",
    authors: "Schoenfeld BJ, Ogborn D, Krieger JW",
    title:
      "Dose-response relationship between weekly resistance training volume and increases in muscle mass",
    journal: "Journal of Sports Sciences",
    year: 2017,
    locator: "35(11):1073-1082",
    doi: "10.1080/02640414.2016.1210197",
    pmid: "27433992",
    claim_pl:
      "Na 34 grupach treningowych z 15 badań każda dodatkowa seria tygodniowo dokładała +0,38% hipertrofii - zależność jest stopniowana, nie progowa.",
  },
  doseresponse2025: {
    key: "doseresponse2025",
    authors: "Pelland JC i wsp.",
    title:
      "Dose-response relationship between resistance training volume and hypertrophy (metaregresja 67 badań)",
    journal: "Sports Medicine",
    year: 2025,
    locator: "67 badań, 2058 uczestników",
    doi: "10.1007/s40279-025-02344-w",
    pmid: "41343037",
    claim_pl:
      "Potwierdzono kierunek, ale z niższym oszacowaniem: +0,24% na serię przy średniej 12,25 serii tygodniowo, a najlepiej dopasowany model jest odwrotnościowy - zyski maleją, nie rosną bez końca.",
  },
  schoenfeld2016freq: {
    key: "schoenfeld2016freq",
    authors: "Schoenfeld BJ, Ogborn D, Krieger JW",
    title:
      "Effects of resistance training frequency on measures of muscle hypertrophy: a systematic review and meta-analysis",
    journal: "Sports Medicine",
    year: 2016,
    doi: "10.1007/s40279-016-0543-8",
    pmid: "27102172",
    claim_pl:
      "Przy zrównanej objętości tygodniowej trenowanie partii częściej niż raz w tygodniu daje przewagę - stąd podział góra/dół zamiast splitu na jedną partię dziennie.",
  },
  robinson2024: {
    key: "robinson2024",
    authors: "Robinson ZP, Pelland JC, Remmert JF i wsp.",
    title:
      "Exploring the dose-response relationship between estimated resistance training proximity to failure, strength gain, and muscle hypertrophy",
    journal: "Sports Medicine",
    year: 2024,
    doi: "10.1007/s40279-024-02069-2",
    pmid: "38970765",
    locator: "metaregresje na 55 badaniach",
    claim_pl:
      "Im niższy RIR, tym większa hipertrofia - zależność ciągła, bez progu, po którym przestaje się opłacać schodzić bliżej upadku.",
  },
  refalo2024: {
    key: "refalo2024",
    authors: "Refalo MC, Helms ER, Robinson ZP, Hamilton DL, Fyfe JJ",
    title:
      "Similar muscle hypertrophy following eight weeks of resistance training to momentary muscular failure or with repetitions-in-reserve",
    journal: "Journal of Sports Sciences",
    year: 2024,
    locator: "42(1):85-101",
    doi: "10.1080/02640414.2024.2321021",
    pmid: "38393985",
    claim_pl:
      "Osiem tygodni w układzie wewnątrzosobniczym: przyrosty czworogłowego były podobne przy pracy do upadku i na 1-2 RIR, więc dochodzenie do upadku nie dokłada, a kosztuje regeneracyjnie.",
  },
  steele2017: {
    key: "steele2017",
    authors: "Steele J i wsp.",
    title: "Przewidywanie liczby powtórzeń pozostałych do upadku",
    journal: "-",
    year: 2017,
    doi: "10.7717/peerj.4105",
    pmid: "29204323",
    locator: "n = 141",
    claim_pl:
      "Doświadczeni zaniżają odległość od upadku o 1-2 powtórzenia, mniej doświadczeni o 4-5 - dlatego RIR wymaga okresowej kalibracji zamiast wiary we własne wyczucie.",
  },
  schoenfeld2016rest: {
    key: "schoenfeld2016rest",
    authors: "Schoenfeld BJ, Pope ZK, Benik FM i wsp.",
    title:
      "Longer interset rest periods enhance muscle strength and hypertrophy in resistance-trained men",
    journal: "Journal of Strength and Conditioning Research",
    year: 2016,
    doi: "10.1519/JSC.0000000000001272",
    pmid: "26605807",
    locator: "30(7):1805-1812",
    claim_pl:
      "Przerwy 3-minutowe dały więcej siły w przysiadzie i ławce oraz większą grubość mięśnia niż 1-minutowe - odwrotnie do zaleceń „krótkie przerwy dla pompy”.",
  },

  // ---------- dobór wariantów ćwiczeń ----------
  maeo2021: {
    key: "maeo2021",
    authors: "Maeo S i wsp.",
    title:
      "Greater hamstrings muscle hypertrophy but similar damage protection after training at long versus short muscle lengths",
    journal: "Medicine & Science in Sports & Exercise",
    year: 2021,
    doi: "10.1249/MSS.0000000000002523",
    pmid: "33009197",
    claim_pl:
      "Dwanaście tygodni uginania nóg siedząc dało +14,1% wobec +9,3% leżąc (p < 0,001) - dwugłowe uda rosną lepiej trenowane w większym rozciągnięciu.",
  },
  maeo2023: {
    key: "maeo2023",
    authors: "Maeo S i wsp.",
    title:
      "Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position",
    journal: "European Journal of Sport Science",
    year: 2023,
    doi: "10.1080/17461391.2022.2100279",
    claim_pl:
      "Wariant zza głowy dał większy przyrost tricepsa niż przy ramieniu wzdłuż tułowia (d = 0,61), z różnicą półtorakrotną dla głowy długiej.",
  },
  kinoshita2023: {
    key: "kinoshita2023",
    authors: "Kinoshita M, Maeo S, Kobayashi Y i wsp.",
    title:
      "Triceps surae muscle hypertrophy is greater after standing versus seated calf-raise training",
    journal: "Frontiers in Physiology",
    year: 2023,
    locator: "14:1272106",
    doi: "10.3389/fphys.2023.1272106",
    claim_pl:
      "Wspięcia stojąc dały istotnie większy przyrost brzuchatego łydki niż siedząc, bo zgięte kolano wyłącza mięsień przechodzący nad stawem kolanowym.",
  },
  kubo2019: {
    key: "kubo2019",
    authors: "Kubo K, Ikebukuro T, Yata H",
    title: "Effects of squat training with different depths on lower limb muscle volumes",
    journal: "European Journal of Applied Physiology",
    year: 2019,
    doi: "10.1007/s00421-019-04181-y",
    pmid: "31230110",
    locator: "119:1933-1942",
    claim_pl:
      "Przy pełnym zakresie wobec 90° czworogłowe urosły podobnie, ale pośladkowy wielki +7% wobec +2% i przywodziciele +6% wobec +3%; kulszowo-goleniowe nie urosły w żadnej grupie.",
  },
  plotkin2023: {
    key: "plotkin2023",
    authors: "Plotkin DL, Rodas MA, Vigotsky AD i wsp.",
    title:
      "Hip thrust and back squat training elicit similar gluteus muscle hypertrophy and transfer similarly to the deadlift",
    journal: "Frontiers in Physiology",
    year: 2023,
    locator: "14:1279170",
    doi: "10.3389/fphys.2023.1279170",
    claim_pl:
      "Przy zrównanej objętości hip thrust i przysiad dały podobny przyrost pośladkowego wielkiego - hip thrust nie jest przewagą, tylko zamiennikiem.",
  },

  // ---------- żywienie ----------
  morton2018: {
    key: "morton2018",
    authors: "Morton RW, Murphy KT, McKellar SR i wsp.",
    title:
      "A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength",
    journal: "British Journal of Sports Medicine",
    year: 2018,
    locator: "52(6):376-384 · 49 badań, 1863 osoby",
    doi: "10.1136/bjsports-2017-097608",
    pmid: "28698222",
    claim_pl:
      "Powyżej 1,62 g białka na kilogram masy ciała dodatkowe białko nie dokłada już masy beztłuszczowej; górna granica przedziału ufności to 2,20 g/kg.",
  },
  lichtman1992: {
    key: "lichtman1992",
    authors: "Lichtman SW, Pisarska K, Berman ER i wsp.",
    title:
      "Discrepancy between self-reported and actual caloric intake and exercise in obese subjects",
    journal: "New England Journal of Medicine",
    year: 1992,
    locator: "327(27):1893-1898",
    doi: "10.1056/NEJM199212313272701",
    pmid: "1454084",
    claim_pl:
      "Osoby przekonane, że jedzą 1028 kcal, jadły faktycznie 2081 kcal - zaniżenie o 47% przy prawidłowym metabolizmie, co wyklucza „wolną przemianę materii” jako wyjaśnienie.",
  },
  burrows2019: {
    key: "burrows2019",
    authors: "Burrows T i wsp.",
    title: "Dokładność samoraportowanego spożycia energii - przegląd systematyczny",
    journal: "Frontiers in Endocrinology",
    year: 2019,
    doi: "10.3389/fendo.2019.00850",
    pmid: "31920966",
    locator: "59 badań, 6298 osób",
    claim_pl:
      "Dzienniczki żywieniowe zaniżają spożycie o 11-41%, a wywiady 24-godzinne o 8-30% - każda metoda samoraportu zaniża, więc punktem odniesienia musi być pomiar wagi.",
  },
  kreider2017: {
    key: "kreider2017",
    authors: "Kreider RB, Kalman DS, Antonio J i wsp.",
    title:
      "International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine",
    journal: "Journal of the International Society of Sports Nutrition",
    year: 2017,
    locator: "14:18",
    doi: "10.1186/s12970-017-0173-z",
    pmid: "28615996",
    claim_pl:
      "Monohydrat kreatyny jest najskuteczniejszym suplementem na wysiłki o wysokiej intensywności i masę beztłuszczową; brak dowodów na szkodliwość przy dawkach do 30 g dziennie przez 5 lat.",
  },

  // ---------- sen ----------
  leproult2011: {
    key: "leproult2011",
    authors: "Leproult R, Van Cauter E",
    title: "Effect of 1 week of sleep restriction on testosterone levels in young healthy men",
    journal: "JAMA",
    year: 2011,
    locator: "305(21):2173-2174",
    doi: "10.1001/jama.2011.710",
    claim_pl:
      "Tydzień snu skróconego do 5 godzin obniżył dzienny testosteron o 10-15% u zdrowych młodych mężczyzn.",
  },
  nedeltcheva2010: {
    key: "nedeltcheva2010",
    authors: "Nedeltcheva AV i wsp.",
    title: "Insufficient sleep undermines dietary efforts to reduce adiposity",
    journal: "Annals of Internal Medicine",
    year: 2010,
    doi: "10.7326/0003-4819-153-7-201010050-00006",
    pmid: "20921542",
    claim_pl:
      "Przy identycznym deficycie kalorycznym krótki sen przesunął utratę masy z tłuszczu na masę beztłuszczową - dokładnie odwrotnie do celu.",
  },
  spiegel2004: {
    key: "spiegel2004",
    authors: "Spiegel K i wsp.",
    title:
      "Sleep curtailment in healthy young men is associated with decreased leptin levels, elevated ghrelin levels, and increased hunger and appetite",
    journal: "Annals of Internal Medicine",
    year: 2004,
    doi: "10.7326/0003-4819-141-11-200412070-00008",
    pmid: "15583226",
    locator: "141(11)",
    claim_pl:
      "Skrócenie snu obniżyło leptynę, podniosło grelinę i zwiększyło subiektywny apetyt - krótki sen utrudnia trzymanie diety, nie tylko psuje regenerację.",
  },
  tasali2022: {
    key: "tasali2022",
    authors: "Tasali E i wsp.",
    title: "Effect of sleep extension on objectively assessed energy intake among adults with overweight",
    journal: "JAMA Internal Medicine",
    year: 2022,
    doi: "10.1001/jamainternmed.2021.8098",
    pmid: "35129580",
    claim_pl:
      "Wydłużenie snu o około 1,2 godziny dało spontaniczne ograniczenie spożycia o ~270 kcal dziennie, bez żadnych instrukcji dietetycznych i bez zmiany wydatku energetycznego.",
  },

  // ---------- nawyki i psychologia ----------
  lally2010: {
    key: "lally2010",
    authors: "Lally P, van Jaarsveld CHM, Potts HWW, Wardle J",
    title: "How are habits formed: modelling habit formation in the real world",
    journal: "European Journal of Social Psychology",
    year: 2010,
    locator: "40(6):998-1009 · 96 osób, 84 dni",
    doi: "10.1002/ejsp.674",
    claim_pl:
      "Mediana czasu do 95% automatyzmu wyniosła 66 dni przy rozrzucie 18-254, a pominięcie jednej okazji nie wpłynęło istotnie na proces formowania nawyku.",
  },
  gollwitzer2006: {
    key: "gollwitzer2006",
    authors: "Gollwitzer PM, Sheeran P",
    title: "Implementation intentions and goal achievement: a meta-analysis of effects and processes",
    journal: "Advances in Experimental Social Psychology",
    year: 2006,
    locator: "38:69-119 · 94 testy, ponad 8000 osób",
    doi: "10.1016/S0065-2601(06)38002-1",
    claim_pl:
      "Plan „jeśli sytuacja Y, to zrobię X” dał efekt d = 0,65 na realizację celu, a dla zapobiegania wykolejeniu się z rozpoczętego działania aż d = 0,77.",
  },
  galla2015: {
    key: "galla2015",
    authors: "Galla BM, Duckworth AL",
    title:
      "More than resisting temptation: beneficial habits mediate the relationship between self-control and positive life outcomes",
    journal: "Journal of Personality and Social Psychology",
    year: 2015,
    locator: "109(3):508-525 · 6 badań, N = 2274",
    doi: "10.1037/pspp0000026",
    pmid: "25643222",
    claim_pl:
      "Samokontrola przekłada się na wyniki życiowe przez nawyki i zaprojektowane otoczenie, a nie przez opieranie się pokusie w momencie decyzji.",
  },
  kappes2011: {
    key: "kappes2011",
    authors: "Kappes HB, Oettingen G",
    title: "Positive fantasies about idealized futures sap energy",
    journal: "Journal of Experimental Social Psychology",
    year: 2011,
    doi: "10.1016/j.jesp.2011.02.003",
    locator: "47(4):719-729",
    claim_pl:
      "Po wywołaniu pozytywnych fantazji o pożądanej przyszłości badani mieli niższe ciśnienie skurczowe, raportowali mniej energii i w kolejnym tygodniu osiągnęli mniej.",
  },
  bond2006: {
    key: "bond2006",
    authors: "Bond CF Jr, DePaulo BM",
    title: "Accuracy of deception judgments",
    journal: "Personality and Social Psychology Review",
    year: 2006,
    locator: "10(3):214-234 · 206 prac, 24 483 sędziów",
    doi: "10.1207/s15327957pspr1003_2",
    pmid: "16859438",
    claim_pl:
      "Trafność w rozróżnianiu prawdy od kłamstwa wynosi 54% wobec 50% z przypadku, eksperci mają 53,8%, a pewność siebie nie koreluje z trafnością.",
  },
} as const satisfies Record<string, Source>;

export type SourceKey = keyof typeof SOURCES;

export function getSource(key: SourceKey): Source {
  return SOURCES[key];
}

export const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];
