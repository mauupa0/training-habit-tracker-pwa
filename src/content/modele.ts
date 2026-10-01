// Trzynaście modeli mentalnych. Każdy jako osobna karta: nazwa, definicja jednym zdaniem
// i zastosowanie w treningu i nawykach - bez tego ostatniego byłby to zbiór cytatów.

import type { SourceKey } from "@/lib/sources/registry";

export type MentalModel = {
  id: string;
  name: string;
  definition: string;
  application: string;
  source?: SourceKey;
  /** Karta 12 jest zabezpieczeniem przed resztą aplikacji, więc wyróżnia się wizualnie. */
  highlighted?: boolean;
};

export const MENTAL_MODELS: MentalModel[] = [
  {
    id: "rozsadne-bije-optymalne",
    name: "Rozsądne bije optymalne",
    definition: "Plan gorszy matematycznie, ale taki, przy którym wytrwasz, bije plan optymalny, który porzucisz.",
    application:
      "Plan 4-dniowy wykonany w 85% przez rok bije 6-dniowy wykonany w 40% przez dwa miesiące. Przy wyborze „lepszy program, którego nie dowiozę” wobec „gorszy, który dowiozę” - bierz drugi. Za każdym razem.",
  },
  {
    id: "procent-skladany",
    name: "Procent składany",
    definition: "Małe przyrosty nakładają się na siebie w skali, której nie widać z bliska.",
    application:
      "2,5 kg dołożone do ławki co 6 tygodni wygląda na nic. Przez dwa lata to 40 kg. Pytanie „jak wycisnąć więcej z tego miesiąca” jest gorsze niż „jak sprawić, żeby za 24 miesiące dalej to robić”.",
  },
  {
    id: "zdobywanie-utrzymywanie",
    name: "Zdobywanie ≠ utrzymywanie",
    definition: "Zdobywanie wymaga ryzyka i optymizmu, utrzymywanie ostrożności i paranoi. To przeciwstawne cechy.",
    application:
      "Budowanie masy wymaga agresywnej progresji, utrzymanie jej - cierpliwości i unikania kontuzji.",
  },
  {
    id: "wygrywaj-przed-walka",
    name: "Wygrywaj zanim zaczniesz walczyć",
    definition: "Przewaga bierze się z pozycji, nie z wysiłku w momencie starcia.",
    application:
      "Nie wygrywasz treningu siłą woli tuż przed wyjściem. Wygrywasz go, pakując torbę dzień wcześniej i wybierając siłownię, która jest po drodze, a nie w drugą stronę.",
    source: "galla2015",
  },
  {
    id: "blad-przezywalnosci",
    name: "Błąd przeżywalności",
    definition: "Widzisz tylko tych, którym się udało - nie widzisz identycznych decyzji, które się nie udały.",
    application:
      "Influencer twierdzący, że jego program zbudował mu sylwetkę, jest przykładem jednej osoby z genetyką, wiekiem i historią treningową, których nie znasz - często z farmakologią, o której nie mówi. Program nie był przyczyną, był tłem.",
  },
  {
    id: "koszty-utopione",
    name: "Koszty utopione",
    definition: "Pieniądze i czas już wydane nie powinny wpływać na decyzję o tym, co zrobić dalej.",
    application:
      "Jeśli po trzech miesiącach widzisz, że program nie pasuje do grafiku, zmiana nie jest „zmarnowaniem tych trzech miesięcy”. One i tak są wydane. To samo dotyczy funkcji, na którą poszły dwa tygodnie i której nikt nie używa.",
  },
  {
    id: "porownanie-do-siebie",
    name: "Porównuj się do siebie sprzed roku",
    definition: "Jedyne porównanie, które niesie informację, to Twój wynik dzisiaj wobec Twojego wyniku wcześniej.",
    application:
      "Porównanie z gościem obok na siłowni nie niesie żadnej: nie znasz jego stażu, genetyki ani tego, co bierze. Dziennik treningowy jest narzędziem właściwego porównania.",
  },
  {
    id: "margines-bledu",
    name: "Margines błędu",
    definition: "Najważniejszą częścią każdego planu jest to, co się dzieje, gdy plan nie wychodzi.",
    application:
      "Protokoły awaryjne nie są przyznaniem się do słabości - są tym, co odróżnia system od postanowienia. Definiujesz je zanim ich potrzebujesz, bo w kryzysie nie masz zasobów na projektowanie.",
  },
  {
    id: "ogony",
    name: "Ogony napędzają wszystko",
    definition: "Niewielka liczba zdarzeń odpowiada za większość wyniku.",
    application:
      "Nie chodzi o to, że jeden magiczny trening Cię zbuduje - chodzi o to, że większość rocznego postępu bierze się z tego, że po prostu byłeś tam 180 razy. Optymalizuj liczbę treningów, nie pojedynczy trening.",
  },
  {
    id: "paradoks-samochodu",
    name: "Paradoks człowieka w samochodzie",
    definition: "Nikt nie podziwia właściciela - wszyscy wyobrażają sobie siebie na jego miejscu.",
    application:
      "Na siłowni nikt nie patrzy na Ciebie tyle, ile Ci się wydaje. A nawet gdyby - nikt nie będzie pamiętał Twojej techniki za tydzień.",
  },
  {
    id: "dlugie-kampanie",
    name: "Nie prowadź długich kampanii",
    definition: "Wyczerpujący wysiłek prowadzony miesiącami to nie twardzielstwo, tylko zaciąganie długu.",
    application:
      "Agresywny deficyt przez miesiące wyczerpuje regenerację, obniża wyniki i kończy się odbiciem. Kilkumiesięczny sprint w pracy bez odpoczynku działa tak samo - dług i tak spłacisz.",
  },
  {
    id: "traktuj-siebie",
    name: "Traktuj siebie jak kogoś, za kogo odpowiadasz",
    definition: "Ludzie potrafią sumiennie podać lekarstwo psu, a zapomnieć wziąć własne.",
    application:
      "Jeśli bliska osoba powiedziałaby Ci, że śpi po 5 godzin, pracuje ponad siły i właśnie zaczyna agresywny deficyt - co byś jej odpowiedział? To jest właściwa odpowiedź także dla Ciebie. System optymalizacyjny łatwo zamienia się w narzędzie do bicia samego siebie. Jeśli zaczniesz go tak używać, to znak, że coś poszło nie tak, a nie że jesteś wystarczająco zdyscyplinowany.",
    highlighted: true,
  },
  {
    id: "czytanie-ludzi",
    name: "Nie umiesz czytać ludzi",
    definition: "Trafność w rozróżnianiu prawdy od kłamstwa to 54% przy 50% z przypadku; u ekspertów 53,8%.",
    application:
      "Pewność siebie nie korelowała z trafnością, a lektura o „czytaniu ludzi” podnosi pewność, nie trafność. Zamiast tego: referencje, portfolio, umowa, zaliczka, okres próbny.",
    source: "bond2006",
  },
];

export const HIGHLIGHTED_MODEL = MENTAL_MODELS.find((m) => m.highlighted) as MentalModel;
