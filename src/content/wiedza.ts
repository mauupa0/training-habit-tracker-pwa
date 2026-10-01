// Moduł wiedzy (faza 6). Treść jako dane, nie MDX: dzięki temu każda liczba dawkowania
// może nieść klucz źródła obsługiwany przez <SourceChip>, wyszukiwarka pełnotekstowa
// działa na zwykłych stringach bez indeksu, a całość ląduje w bundlu - czyli działa
// offline bez dodatkowej warstwy i bez nowej zależności.

import type { SourceKey } from "@/lib/sources/registry";

export type Block =
  | { kind: "p"; text: string; source?: SourceKey }
  | { kind: "quote"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "verdict"; claim: string; verdict: string; body: string; source?: SourceKey };

export type Section = { title: string; blocks: Block[] };
export type Chapter = { id: string; title: string; lead: string; sections: Section[] };

export const CHAPTERS: Chapter[] = [
  {
    id: "jak-dziala-plan",
    title: "Jak działa plan",
    lead: "Badania nie mówią, że konkretne ćwiczenie jest lepsze od innego. Mocno udowodnione są zmienne: ile serii, jak blisko upadku, jak często, ile odpoczynku.",
    sections: [
      {
        title: "Objętość",
        blocks: [
          {
            kind: "p",
            text: "12-18 serii tygodniowo na partię to zakres roboczy. Zależność jest stopniowana: każda dodatkowa seria dokłada około 0,38% hipertrofii, ale zyski maleją, a nie rosną bez końca.",
            source: "schoenfeld2017",
          },
          {
            kind: "p",
            text: "Metaregresja z 2025 na 67 badaniach i 2058 uczestnikach potwierdza kierunek przy niższym oszacowaniu: +0,24% na serię przy średniej 12,25 serii. Najlepiej dopasowany model był odwrotnościowy.",
            source: "doseresponse2025",
          },
        ],
      },
      {
        title: "Częstotliwość",
        blocks: [
          {
            kind: "p",
            text: "Każda partia dwa razy w tygodniu. Synteza białek mięśniowych po treningu wraca do poziomu wyjściowego w ciągu 24-48 godzin - trenując partię raz w tygodniu, przez pozostałe pięć-sześć dni nie masz w niej podwyższonej syntezy.",
            source: "schoenfeld2016freq",
          },
        ],
      },
      {
        title: "Bliskość upadku",
        blocks: [
          {
            kind: "p",
            text: "1-2 powtórzenia w zapasie. Zasada wielkości Hennemana: jednostki motoryczne rekrutowane są od najmniejszych do największych, więc włókna o największym potencjale wzrostu wchodzą do gry dopiero przy wysokim zapotrzebowaniu na siłę.",
            source: "robinson2024",
          },
          {
            kind: "p",
            text: "Dochodzenie do faktycznego upadku nie dokłada nic, a kosztuje regeneracyjnie: w badaniu wewnątrzosobniczym jedna noga trenowała do upadku, druga na 1-2 RIR - przyrosty czworogłowego były podobne.",
            source: "refalo2024",
          },
          {
            kind: "p",
            text: "Najważniejsza liczba w tym rozdziale: doświadczeni zaniżają zapas o 1-2 powtórzenia, mniej doświadczeni o 4-5. Gdy myślisz „mam 2 w zapasie”, realnie masz 5-7 i trenujesz w strefie, która robi mniej, niż zakładasz. Dlatego aplikacja co 2-3 tygodnie proponuje kalibrację.",
            source: "steele2017",
          },
        ],
      },
      {
        title: "Przerwy",
        blocks: [
          {
            kind: "p",
            text: "2-3 minuty w bojach złożonych. Fosfokreatyna odbudowuje się w mięśniu w około 50% po 30 sekundach i w ~95% dopiero po 3-5 minutach - przy minucie wchodzisz w kolejną serię z częściowo pustym magazynem.",
            source: "schoenfeld2016rest",
          },
          {
            kind: "p",
            text: "Zasada praktyczna: odpoczywaj tyle, żeby utrzymać co najmniej 90% powtórzeń z pierwszej serii.",
          },
        ],
      },
      {
        title: "Zakres ruchu",
        blocks: [
          {
            kind: "p",
            text: "Przysiad pełny. Przy porównaniu 140° i 90° zgięcia kolana czworogłowe urosły podobnie, ale pośladkowy wielki +7% wobec +2%, a przywodziciele +6% wobec +3%.",
            source: "kubo2019",
          },
          {
            kind: "p",
            text: "W tym samym badaniu mięśnie kulszowo-goleniowe nie urosły w żadnej z grup. W przysiadzie kurczą się przy biodrze i rozciągają przy kolanie jednocześnie - długość praktycznie się nie zmienia. Bez rumuńskiego martwego ciągu i uginania nóg nie masz tylnej części uda.",
            source: "plotkin2023",
          },
        ],
      },
      {
        title: "Próg minimalny",
        blocks: [
          {
            kind: "p",
            text: "Dwa pierwsze ćwiczenia, po dwie serie, piętnaście minut. To liczy się jako trening odbyty i tak jest zapisywane. Powód jest behawioralny, nie fizjologiczny: jeśli jedyną definicją treningu jest pełna sesja, to w dniu z dwudziestoma wolnymi minutami nie idziesz wcale. A potem nie idziesz następnego.",
          },
        ],
      },
    ],
  },
  {
    id: "trzy-korekty",
    title: "Trzy korekty w planie",
    lead: "Dla tych trzech ćwiczeń istnieją badania porównawcze, a popularne plany często biorą gorsze warianty. Porównanie zostaje widoczne, żeby było jasne, skąd taki wybór.",
    sections: [
      {
        title: "Dwugłowe uda: uginanie siedząc zamiast leżąc",
        blocks: [
          {
            kind: "p",
            text: "Trzy z czterech głów mięśni kulszowo-goleniowych są dwustawowe. W pozycji siedzącej biodro jest zgięte, więc startują z większego rozciągnięcia.",
          },
          {
            kind: "p",
            text: "Dwanaście tygodni treningu: +14,1% siedząc wobec +9,3% leżąc. Głowa krótka, jednostawowa, urosła tak samo w obu wariantach - co potwierdza, że mechanizmem jest długość mięśnia.",
            source: "maeo2021",
          },
        ],
      },
      {
        title: "Triceps: wyciskanie zza głowy zamiast pushdownów",
        blocks: [
          {
            kind: "p",
            text: "Głowa długa tricepsa przyczepia się do łopatki, więc przechodzi przez staw barkowy. Przy prostowaniu z ramieniem przy tułowiu pozostaje krótka przez cały ruch.",
          },
          {
            kind: "p",
            text: "W badaniu, w którym każde ramię losowo dostało inny wariant, pozycja zza głowy dała większy przyrost także głowy przyśrodkowej i bocznej.",
            source: "maeo2023",
          },
        ],
      },
      {
        title: "Łydki: wspięcia stojąc zamiast siedząc",
        blocks: [
          {
            kind: "p",
            text: "Brzuchaty łydki przyczepia się nad kolanem, więc jest dwustawowy. Siedząc, ze zgiętym kolanem, jest skrócony i praktycznie wyłączony - pracuje głównie płaszczkowaty.",
            source: "kinoshita2023",
          },
          {
            kind: "p",
            text: "Wspięcia siedząc nie są bezużyteczne: trafiają w płaszczkowaty, który stojąc dostaje mniej. Ale nie mogą być jedynym wariantem.",
          },
        ],
      },
      {
        title: "Hip thrust - najsłabszy punkt planu",
        blocks: [
          {
            kind: "p",
            text: "Dziewięć tygodni, objętość zrównana, pomiar MRI: hip thrust i przysiad dały podobny przyrost pośladkowego wielkiego, ale grupa przysiadowa zyskała istotnie więcej masy czworogłowych i przywodzicieli. To samo badanie sprawdziło, czy amplituda EMG przewiduje przyrost masy - nie przewidywała.",
            source: "plotkin2023",
          },
          {
            kind: "p",
            text: "Czyli „czuję to bardziej, więc lepiej działa” nie jest argumentem. Jeśli masz wycinać cokolwiek przy braku czasu - hip thrust jako pierwszy.",
          },
        ],
      },
    ],
  },
  {
    id: "dieta",
    title: "Dieta",
    lead: "Zacznij od tego, że nie umiesz liczyć kalorii. Nikt nie umie - i to nie jest zaczepka.",
    sections: [
      {
        title: "Zaniżanie raportowania",
        blocks: [
          {
            kind: "p",
            text: "Osoby twierdzące, że jedzą około 1028 kcal dziennie i mimo to nie chudną, po pomiarze wodą podwójnie znakowaną przez 14 dni jadły 2081 kcal. Zaniżenie o 47%, metabolizm normalny u wszystkich. Badani nie kłamali: po dobie pamiętali o ~20% mniej jedzenia, niż zjedli.",
            source: "lichtman1992",
          },
          {
            kind: "p",
            text: "Każda metoda zaniża: dzienniczki o 11-41%, wywiady dobowe o 8-30%.",
            source: "burrows2019",
          },
        ],
      },
      {
        title: "Metoda zamiast wzoru",
        blocks: [
          {
            kind: "list",
            items: [
              "Tydzień 1-2: jedz normalnie, notuj wszystko, waż się rano po toalecie.",
              "Koniec tygodnia 2: średnia kalorii wobec zmiany średniej tygodniowej wagi - to jest realne zapotrzebowanie, zmierzone, nie oszacowane.",
              "Od tygodnia 3: −300 do −400 kcal (rekompozycja) albo +200 kcal (masa).",
              "Korekta co dwa tygodnie, o 200 kcal. Nie o 500. Nie codziennie.",
            ],
          },
        ],
      },
      {
        title: "Białko",
        blocks: [
          {
            kind: "p",
            text: "1,62 g/kg to punkt przegięcia, powyżej którego dodatkowe białko nie dokłada masy beztłuszczowej; górna granica przedziału ufności to 2,20 g/kg. Przy 80 kg wychodzi 130-176 g.",
            source: "morton2018",
          },
          {
            kind: "p",
            text: "Rozkład na cztery porcje po ~40 g, bo synteza jest wysycalna: pojedyncza porcja 20-40 g maksymalizuje odpowiedź, nadmiar idzie do utleniania.",
          },
        ],
      },
      {
        title: "Reszta talerza",
        blocks: [
          {
            kind: "list",
            items: [
              "Węglowodany zasilają trening - nie bój się ich.",
              "Tłuszcze minimum ~0,8 g/kg dla gospodarki hormonalnej.",
              "Błonnik 30 g dziennie: to on sprawia, że deficyt jest znośny - objętość bez kalorii.",
              "Woda 3 l. Odwodnienie obniża wydolność treningową.",
            ],
          },
          {
            kind: "p",
            text: "Deficyt tracisz nie w posiłkach, tylko w alkoholu, w płynnych kaloriach, w weekendzie i w jedzeniu w biegu: kęs tu, kęs tam, nigdy nie zapisane.",
          },
          {
            kind: "quote",
            text: "Jeśli liczenie zacznie zajmować Ci głowę bardziej, niż jest tego warte, robić się stresujące albo obsesyjne - przestań liczyć. Trzymaj wtedy tylko białko i regularność posiłków. To wciąż dowozi większość efektu, a zdrowa relacja z jedzeniem jest ważniejsza niż precyzja.",
          },
        ],
      },
    ],
  },
  {
    id: "sen",
    title: "Sen",
    lead: "Największa nietknięta rezerwa: 20-30% możliwego efektu. U wielu osób to najsłabsze ogniwo, dlatego dostaje osobny rozdział.",
    sections: [
      {
        title: "Cztery fakty",
        blocks: [
          {
            kind: "p",
            text: "Tydzień po pięć godzin snu obniżył dzienny testosteron o 10-15% u zdrowych młodych mężczyzn. Hormonalny odpowiednik postarzenia się o 10-15 lat, w tydzień.",
            source: "leproult2011",
          },
          {
            kind: "p",
            text: "Przy tej samej restrykcji kalorycznej krótki sen oznaczał mniej utraconego tłuszczu i więcej utraconej masy beztłuszczowej - dokładnie odwrotnie do celu.",
            source: "nedeltcheva2010",
          },
          {
            kind: "p",
            text: "Skrócenie snu obniżyło leptynę, podniosło grelinę i zwiększyło apetyt. Krótki sen nie tylko psuje efekt, ale utrudnia trzymanie diety.",
            source: "spiegel2004",
          },
          {
            kind: "p",
            text: "To działa też w drugą stronę: osoby, które dodały ~1,2 h snu, spontanicznie jadły o ~270 kcal mniej dziennie, bez zmiany wydatku energetycznego i bez instrukcji dietetycznych. To najtańszy deficyt, jaki możesz zrobić.",
            source: "tasali2022",
          },
        ],
      },
      {
        title: "Praktyka",
        blocks: [
          {
            kind: "list",
            items: [
              "Stała godzina pobudki, nie zaśnięcia - to ona kotwiczy rytm dobowy.",
              "Cel 7-9 h. Jeśli teraz śpisz 6, nie skacz na 8: dodaj 30 minut na dwa tygodnie.",
              "Ostatnia kawa 8 godzin przed snem (okres półtrwania kofeiny 5-6 h).",
              "Telefon poza zasięgiem ręki, nie „w trybie nocnym”.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "suplementy",
    title: "Suplementy",
    lead: "Tylko to, co ma dowody.",
    sections: [
      {
        title: "Kreatyna monohydrat",
        blocks: [
          {
            kind: "p",
            text: "5 g dziennie, bez fazy ładowania, również w dni bez treningu. Stanowisko ISSN: monohydrat to najskuteczniejszy suplement ergogeniczny w zakresie wydolności wysiłków o wysokiej intensywności i beztłuszczowej masy ciała; brak dowodów na szkodliwość przy stosowaniu do 30 g na dobę przez pięć lat u zdrowych osób. Nasycenie po ~4 tygodniach.",
            source: "kreider2017",
          },
          {
            kind: "p",
            text: "Nie kupuj kreatyny HCl ani innych form. Monohydrat jest najlepiej przebadany i najtańszy.",
          },
        ],
      },
      {
        title: "Reszta",
        blocks: [
          {
            kind: "list",
            items: [
              "Odżywka białkowa to nie suplement, tylko wygodne jedzenie. Sens ma, jeśli inaczej nie dowozisz białka.",
              "Witamina D: w Polsce od października do marca praktycznie nie syntetyzujesz jej ze słońca. 2000 IU dziennie w sezonie.",
              "Kofeina: 3-6 mg/kg przed treningiem. Przy treningu wieczorem patrz rozdział o śnie.",
            ],
          },
          {
            kind: "p",
            text: "Niewarte pieniędzy: spalacze, testo-boostery, BCAA (bezużyteczne przy wystarczającym białku), glutamina, tribulus, ZMA, „nocne białko”. To marketing.",
          },
        ],
      },
    ],
  },
  {
    id: "nawyki",
    title: "Nawyki",
    lead: "Najważniejszy rozdział. Bez niego reszta jest ciekawostką.",
    sections: [
      {
        title: "Jeden opuszczony trening nie resetuje niczego",
        blocks: [
          {
            kind: "p",
            text: "96 osób, 84 dni obserwacji, dopasowanie krzywej automatyzmu. Mediana czasu do 95% automatyzmu: 66 dni, zakres 18-254. Pominięcie jednej okazji do wykonania zachowania nie wpłynęło istotnie na proces.",
            source: "lally2010",
          },
          {
            kind: "p",
            text: "To, co łamie postęp, to porzucenie po opuszczonym treningu, a nie sam opuszczony trening. Do tego 66 dni to mediana dla zachowań prostych - trening 4× w tygodniu jest złożony, więc nastaw się na trzy miesiące, nie trzy tygodnie.",
          },
        ],
      },
      {
        title: "Plany jeśli-to",
        blocks: [
          {
            kind: "p",
            text: "Metaanaliza 94 niezależnych testów, ponad 8000 osób: efekt d = 0,65 na realizację celu, a osobno dla zapobiegania wykolejeniu się z rozpoczętego działania d = 0,77. Plany na porażkę działają mocniej niż plany na start.",
            source: "gollwitzer2006",
          },
          {
            kind: "p",
            text: "Mechanizm: intencja celu („chcę być w formie”) nie jest powiązana z żadnym bodźcem w otoczeniu. Plan jeśli-to przypina zachowanie do konkretnego wyzwalacza, więc uruchamia się bez udziału woli.",
          },
        ],
      },
      {
        title: "Zasada dwóch dni",
        blocks: [
          {
            kind: "p",
            text: "Nigdy dwa dni z rzędu bez zaplanowanego działania. Jeden opuszczony dzień to zdarzenie losowe, dwa z rzędu to początek nowego wzorca - mechanizm formowania nawyku działa w obie strony. To jedyna zasada, która musi być nienaruszalna.",
          },
        ],
      },
      {
        title: "Harmonogram dwunastu tygodni",
        blocks: [
          {
            kind: "table",
            head: ["Tygodnie", "Wprowadzasz"],
            rows: [
              ["1-2", "Tylko trening 4×/tydz. plus notowanie serii. Jedz jak zawsze."],
              ["3-4", "+ białko"],
              ["5-6", "+ stała godzina pobudki, kreatyna"],
              ["7-8", "+ pomiar kalorii, bez zmiany"],
              ["9-10", "+ korekta kalorii"],
              ["11-12", "+ kroki, NEAT, dopracowanie"],
            ],
          },
          {
            kind: "p",
            text: "Wprowadzając cztery zachowania naraz, konkurują one o ten sam ograniczony zasób uwagi i wszystkie są wykonywane gorzej. Jeśli w tygodniu 3 trening jeszcze nie idzie gładko - nie dodawaj białka. Harmonogram jest sugestią kolejności, nie terminarzem.",
          },
        ],
      },
    ],
  },
  {
    id: "motywacja",
    title: "Motywacja działa przeciwko Tobie",
    lead: "Cztery slogany z filmów motywacyjnych, sprawdzone jeden po drugim. Trzy są sprzeczne z badaniami, jeden to półprawda z odwróconą przyczynowością.",
    sections: [
      {
        title: "Cztery werdykty",
        blocks: [
          {
            kind: "verdict",
            claim: "Dyscyplina to robienie tego, czego nie chcesz, kiedy nie chcesz",
            verdict: "obalone",
            body: "Sześć badań, N = 2274. Osoby o wysokiej samokontroli raportują MNIEJ wysiłkowego hamowania w codziennym życiu, nie więcej. Mediatorem okazały się korzystne nawyki - automatyzm, nie zaciskanie zębów. Jeśli wierzysz, że trening ma boleć psychicznie, to gdy przestanie boleć, uznasz, że robisz za mało. A gdy zapas woli się skończy, nie masz nic pod spodem.",
            source: "galla2015",
          },
          {
            kind: "verdict",
            claim: "Im mocniej upadasz, tym mocniej wstajesz",
            verdict: "brak dowodów",
            body: "Porażka nie buduje automatycznie niczego. Prawdą jest co innego: pominięcie jednej okazji nie psuje procesu - ale to argument przeciwko katastrofizowaniu wpadki, a nie za tym, że wpadka jest wartościowa. Porażka jest produktywna tylko wtedy, gdy po niej zmieniasz plan.",
            source: "lally2010",
          },
          {
            kind: "verdict",
            claim: "Uwierz w siebie",
            verdict: "półprawda z odwróconą przyczynowością",
            body: "Oczekiwania oparte na dowodach pomagają, fantazje szkodzą - i idą w przeciwne strony w tych samych badaniach. Wysokie oczekiwania: więcej ofert pracy, mniejsza absencja, wyższe oceny. Wysokie fantazje: mniej ofert, większa absencja, niższe oceny. Wiara zbudowana na tym, że w zeszłym tygodniu wycisnąłeś o 2,5 kg więcej, działa. Wiara zbudowana na obejrzeniu filmiku - nie.",
            source: "kappes2011",
          },
          {
            kind: "verdict",
            claim: "Obrazy wyidealizowanej przyszłości",
            verdict: "aktywnie szkodzą",
            body: "Cztery badania: po wywołaniu pozytywnych fantazji uczestnicy mieli niższe skurczowe ciśnienie krwi - fizjologiczny wskaźnik mobilizacji energii - i w kolejnym tygodniu osiągnęli mniej. Mózg częściowo traktuje żywo wyobrażony cel jako już osiągnięty i przestaje mobilizować zasoby. Czujesz się świetnie i robisz mniej.",
            source: "kappes2011",
          },
        ],
      },
      {
        title: "Co działa zamiast: WOOP",
        blocks: [
          {
            kind: "list",
            items: [
              "Wish - życzenie konkretne i wymagające, ale realne.",
              "Outcome - najlepszy efekt, krótko, dwadzieścia sekund.",
              "Obstacle - co konkretnie, wewnątrz Ciebie, stanie na drodze. Nie „brak czasu”.",
              "Plan - plan jeśli-to na tę konkretną przeszkodę.",
            ],
          },
          {
            kind: "p",
            text: "Różnica względem filmiku jest taka, że WOOP każe skonfrontować fantazję z przeszkodą - co zamienia życzenie w zobowiązanie, zamiast dać poczucie, że już wygrałeś. Kreator WOOP jest w aplikacji, w ekranie „Plany”.",
          },
        ],
      },
    ],
  },
  {
    id: "modele",
    title: "Modele mentalne",
    lead: "Z pięciu książek przejrzanych pod kątem tego, czy faktycznie mają przełożenie. Karty modeli są na osobnym ekranie - tutaj werdykty o źródłach.",
    sections: [
      {
        title: "Werdykty o pięciu książkach",
        blocks: [
          {
            kind: "table",
            head: ["Książka", "Werdykt", "Dlaczego"],
            rows: [
              [
                "Housel - The Psychology of Money",
                "najlepsza z pięciu",
                "Teza „zachowanie ponad matematykę” zgodna z ekonomią behawioralną i bezpośrednio przekładalna. Zastrzeżenie: eseje, nie badania - anegdoty dobrane pod tezę.",
              ],
              [
                "Sun Tzu - The Art of War",
                "niska gęstość praktyczna",
                "Kilka trwałych idei o pozycji i przewadze. Na tyle aforystyczny, że ludzie wczytują w niego dowolną tezę. Jeden wieczór, trzy idee, odłóż.",
              ],
              [
                "Dobelli - The Art of Thinking Clearly",
                "ostrożnie",
                "Popularyzacja sprzed kryzysu replikacji: powtórzyło się 36% ze 97 eksperymentów. Kahneman w 2012 sam ostrzegał listem otwartym przed „katastrofą kolejową” w badaniach nad primingiem. Dobry jako indeks pojęć, zły jako źródło prawdy.",
              ],
              [
                "Peterson - 12 Rules for Life",
                "trzy różne warstwy",
                "Porady praktyczne częściowo pokrywają się z technikami klinicznymi. Warstwa jungowsko-mitologiczna jest nieweryfikowalna. Komentarz społeczno-polityczny sporny. Argument z homarami z Reguły 1 krytykowany przez biologów jako nadużycie.",
              ],
              [
                "King - Read People Like a Book",
                "obietnica sprzeczna z danymi",
                "Metaanaliza 206 prac i 24 483 sędziów: trafność w rozróżnianiu prawdy od kłamstwa to 54% przy 50% z przypadku. Eksperci 53,8%. Pewność siebie nie korelowała z trafnością.",
              ],
            ],
          },
          {
            kind: "p",
            text: "Dlaczego ostatnia pozycja jest aktywnie szkodliwa, a nie tylko bezużyteczna: taka lektura nie podnosi trafności, ale podnosi pewność. Wchodzisz na negocjacje przekonany, że kogoś przejrzałeś, i decydujesz na podstawie szumu. Co działa zamiast: referencje, portfolio, umowa, zaliczka, okres próbny.",
            source: "bond2006",
          },
        ],
      },
    ],
  },
  {
    id: "czego-nie-wiemy",
    title: "Czego nie wiemy",
    lead: "Dokument, który nie pokazuje granic własnej wiarygodności, nie daje się sprawdzić. To jest ta granica.",
    sections: [
      {
        title: "Sześć rzeczy bez rozstrzygnięcia",
        blocks: [
          {
            kind: "list",
            items: [
              "Sztanga wobec hantli - brak dowodów na przewagę. Sztanga wybrana, bo łatwiej progresować o 2,5 kg. Argument praktyczny, nie naukowy.",
              "Kolejność ćwiczeń w sesji - dowody słabe i mieszane. Złożone na początku to logika, nie metaanaliza.",
              "Przedziały powtórzeń - przy zrównanej bliskości upadku hipertrofia jest podobna w szerokim zakresie obciążeń. Zróżnicowanie w planie służy stawom i różnorodności.",
              "Deload co 6-8 tygodni - zalecenie z praktyki trenerskiej, nie wynik badania. Literatura uboga.",
              "Ograniczenia prób - duża część cytowanych prac to małe grupy (7-34 osoby), często osoby nietrenujące, przez 8-12 tygodni. To najlepsze, co mamy, ale to nie jest fizyka.",
              "Badania o pozycjach wydłużonych - efekty realne, ale nie tak pewne, jak sugeruje prezentacja w formie procentów.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "realne-oczekiwania",
    title: "Realne oczekiwania",
    lead: "Czego ta aplikacja nie obiecuje. Rozdział dostępny również z ekranu „Postęp”, bo tam trafiasz, gdy jesteś zniechęcony.",
    sections: [
      {
        title: "Co się kiedy dzieje",
        blocks: [
          {
            kind: "list",
            items: [
              "Miesiąc 1-2: rośnie siła i pewność techniki. Sylwetka prawie się nie zmienia. To normalne i to jest moment, w którym większość ludzi rezygnuje.",
              "Miesiąc 3-6: pierwsze widoczne zmiany. Ubrania inaczej leżą.",
              "Rok 1: realnie 4-7 kg masy mięśniowej przy dobrym prowadzeniu, mniej jeśli już trenowałeś. To górna granica fizjologii naturalnej, nie kwestia wysiłku.",
              "Docelowa sylwetka: 3-5 lat konsekwentnego treningu. Nie ma skrótu, który nie kończy się igłą.",
            ],
          },
          {
            kind: "p",
            text: "Największym zagrożeniem dla Twoich wyników nie jest zły dobór ćwiczeń. Jest nim to, że przestaniesz chodzić na siłownię w listopadzie, bo praca będzie się paliła. Plan realizowany w 80% bije idealny plan, który porzucisz.",
          },
        ],
      },
    ],
  },
];

/** Rozdział „Źródła” budowany jest z rejestru - nie ma sensu przepisywać go ręcznie. */
export const SOURCES_CHAPTER_ID = "zrodla";
