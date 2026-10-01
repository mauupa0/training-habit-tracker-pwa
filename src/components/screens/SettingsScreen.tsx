"use client";

import { useState } from "react";
import { ModelCard } from "@/components/screens/KnowledgeScreen";
import { HIGHLIGHTED_MODEL } from "@/content/modele";
import { buildCsvFiles, buildExport, download, wipeLocalData } from "@/lib/db/export";
import { saveProgramState } from "@/lib/db/repo";
import { clampProteinPerKg } from "@/lib/domain/measure";
import { setWakeLockDisabled, wakeLockDisabled } from "@/lib/wakeLock";
import { todayIso } from "@/lib/day";
import type { LocalProgramState, ProgramState } from "@/types";

const WEIGHING: Array<[ProgramState["weighing_frequency"], string]> = [
  ["daily", "Ważę się codziennie"],
  ["weekly", "Ważę się raz w tygodniu"],
  ["never", "Nie ważę się wcale"],
];

const PROTOCOLS: Array<[string, string]> = [
  [
    "Bardzo długi dzień pracy",
    "Protokół minimum. 2 treningi w tygodniu, po 2 główne ćwiczenia. Białko trzymasz, kalorie olewasz.",
  ],
  [
    "Choroba",
    "Objawy od szyi w górę - trenuj lżej. Od szyi w dół (gorączka, kaszel, mięśnie) - nie trenuj. Wracasz od 70% ciężarów przez pierwszy tydzień.",
  ],
  [
    "Wyjazd bez siłowni",
    "3 serie pompek, przysiadów, przysiadów bułgarskich, plank. 15 minut. Liczy się jako zaliczone.",
  ],
  [
    "Impreza, weekend",
    "Nie nadrabiaj głodówką. Wracasz do normalnego jedzenia i treningu. Jeden weekend to około 1% roku.",
  ],
  [
    "Stagnacja 3+ tygodnie",
    "Sprawdź w tej kolejności: czy śpisz, czy realnie jesz tyle, ile myślisz, czy progresja jest zapisana i idzie w górę. W 90% przypadków odpowiedź jest w jednym z tych trzech, a nie w programie.",
  ],
];

export function SettingsScreen({
  state,
  onChanged,
  onBack,
}: {
  state: LocalProgramState;
  onChanged: (next: LocalProgramState) => void;
  onBack: () => void;
}) {
  const [screenOff, setScreenOff] = useState(wakeLockDisabled());
  const [exported, setExported] = useState<"json" | "csv" | null>(null);
  const [wipeStage, setWipeStage] = useState(0);

  async function exportJson() {
    const bundle = await buildExport();
    download(`system-${bundle.exported_at.slice(0, 10)}.json`, JSON.stringify(bundle, null, 1));
    setExported("json");
  }

  async function exportCsv() {
    for (const file of await buildCsvFiles()) {
      download(`system-${file.name}`, file.content, "text/csv");
    }
    setExported("csv");
  }


  /**
   * Wyłączenie ważenia jest ostateczne w jedną stronę: aplikacja nigdy sama nie
   * zaproponuje powrotu (R7). Wrócić można tylko stąd, świadomym kliknięciem.
   */
  async function setWeighing(value: ProgramState["weighing_frequency"]) {
    if (value === state.weighing_frequency) return;
    onChanged(await saveProgramState({ weighing_frequency: value }));
  }

  /**
   * R7: wyłączenie liczenia kalorii jest natychmiastowe - bez potwierdzenia, bez pytania
   * o powód i bez próby odzyskania użytkownika. Włączyć da się wyłącznie stąd, ręcznie:
   * aplikacja sama nigdy tego nie proponuje.
   */
  async function toggleCalories() {
    onChanged(await saveProgramState({ calorie_tracking_off: !state.calorie_tracking_off }));
  }

  async function setSessionTime(value: string | null) {
    onChanged(await saveProgramState({ session_time: value }));
  }

  async function setProtein(value: number) {
    const next = clampProteinPerKg(Math.round(value * 10) / 10);
    if (next === state.protein_per_kg) return;
    onChanged(await saveProgramState({ protein_per_kg: next }));
  }

  async function toggleEmergency() {
    const on = !state.emergency_mode;
    onChanged(
      await saveProgramState({
        emergency_mode: on,
        emergency_started_on: on ? todayIso() : null,
      })
    );
  }

  return (
    <main className="sy-screen sy-with-nav">
      <header className="sy-head">
        <h1 className="sy-title">Ustawienia</h1>
        <button
          type="button"
          className="sy-list__meta"
          style={{ background: "none", border: 0, cursor: "pointer", minHeight: 44 }}
          onClick={onBack}
        >
          wróć
        </button>
      </header>

      <section className="sy-section">
        <h2 className="sy-section__title">Okres</h2>
        <button type="button" className="sy-module" onClick={() => void toggleEmergency()}>
          <span>Tryb minimum - mam teraz ciężki okres</span>
          <span className="sy-module__note">{state.emergency_mode ? "włączony" : "wyłączony"}</span>
        </button>
        <p style={{ color: "var(--ink-2)", fontSize: 15, marginTop: 10 }}>
          Plan schodzi do dwóch sesji w tygodniu, zostają trening i białko, a cel 28-dniowy
          przelicza się na <span className="num">8</span>. Nie przypominamy o powrocie.
        </p>
      </section>

      <section className="sy-section">
        <h2 className="sy-section__title">Pomiar</h2>
        {WEIGHING.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="sy-module"
            aria-pressed={state.weighing_frequency === value}
            onClick={() => void setWeighing(value)}
          >
            <span>{label}</span>
            <span className="sy-module__note">
              {state.weighing_frequency === value ? "wybrane" : ""}
            </span>
          </button>
        ))}
        <p style={{ color: "var(--ink-2)", fontSize: 15, marginTop: 10 }}>
          Codzienne ważenie daje najdokładniejszą średnią. Jeśli zauważysz, że wpływa na Twój
          nastrój - zmień na raz w tygodniu albo wyłącz. Obwody i zdjęcia wystarczą do śledzenia
          postępu.
        </p>

        <div className="sy-mod" style={{ marginTop: 12 }}>
          <div className="sy-mod__head">
            <span className="sy-mod__name">Kalorie</span>
            <span className="sy-mod__note">
              {state.calorie_tracking_off ? "wyłączone" : "włączone"}
            </span>
          </div>
          {/* R7: jedno kliknięcie, bez dialogu „na pewno?”, bez pytania o powód. */}
          <div className="sy-mod__row">
            <button type="button" className="sy-toggle" onClick={() => void toggleCalories()}>
              {state.calorie_tracking_off ? "Włącz liczenie kalorii" : "Wyłącz liczenie kalorii"}
            </button>
          </div>
          <p className="sy-sub">
            {state.calorie_tracking_off
              ? "Wyłączone. Białko i regularność posiłków dowożą większość efektu."
              : "Po wyłączeniu aplikacja działa w pełni: trening, białko, sen, kreatyna i pomiary zostają."}
          </p>
        </div>

        <div className="sy-mod" style={{ marginTop: 12 }}>
          <div className="sy-mod__head">
            <span className="sy-mod__name">Białko</span>
            <span className="sy-mod__note num">{state.protein_per_kg} g/kg</span>
          </div>
          <div className="sy-mod__row">
            <button
              type="button"
              className="sy-toggle"
              aria-label="Mniej białka na kilogram"
              onClick={() => void setProtein(state.protein_per_kg - 0.1)}
            >
              −0,1
            </button>
            <button
              type="button"
              className="sy-toggle"
              aria-label="Więcej białka na kilogram"
              onClick={() => void setProtein(state.protein_per_kg + 0.1)}
            >
              +0,1
            </button>
          </div>
          <p className="sy-sub">
            Zakres <span className="num">1,6-2,2</span> g/kg pochodzi z metaanalizy: 1,62 to próg,
            powyżej którego dodatkowe białko nie dokłada masy beztłuszczowej, 2,20 to górna granica
            przedziału ufności.
          </p>
        </div>
      </section>

      <section className="sy-section">
        <h2 className="sy-section__title">Sesja</h2>

        {/* Plan „jeśli wybije 18:00, to zakładam buty" potrzebuje godziny, żeby w ogóle
            być planem. Wyzwalacz przypięty do pory uruchamia się bez udziału woli. */}
        <div className="sy-mod">
          <div className="sy-mod__head">
            <span className="sy-mod__name">Pora treningu</span>
            <span className="sy-mod__note num">{state.session_time?.slice(0, 5) ?? "nieustalona"}</span>
          </div>
          <div className="sy-mod__row">
            <input
              className="sy-input num"
              type="time"
              aria-label="Zaplanowana pora treningu"
              value={state.session_time?.slice(0, 5) ?? ""}
              onChange={(e) => void setSessionTime(e.target.value || null)}
            />
            {state.session_time && (
              <button type="button" className="sy-btn sy-btn--ghost" onClick={() => void setSessionTime(null)}>
                Wyczyść
              </button>
            )}
          </div>
          <p className="sy-sub">
            Ekran „Dziś" pokaże tę porę w dni treningowe. Aplikacja nie wyśle powiadomienia,
            gdy jest zamknięta - porę trzyma po to, żeby plan jeśli-to miał konkretny wyzwalacz.
          </p>
        </div>

        <button
          type="button"
          className="sy-module"
          onClick={() => {
            const next = !screenOff;
            setScreenOff(next);
            setWakeLockDisabled(next);
          }}
        >
          <span>Ekran gaśnie w trakcie treningu</span>
          <span className="sy-module__note">{screenOff ? "tak" : "nie"}</span>
        </button>
      </section>

      <section className="sy-section">
        <h2 className="sy-section__title">Twoje dane</h2>
        <p className="sy-sub">
          Wszystko, co zapisała aplikacja, możesz zabrać ze sobą w każdej chwili. Eksport działa
          bez połączenia - czyta wyłącznie pamięć urządzenia.
        </p>
        <div className="sy-mod__row">
          <button type="button" className="sy-btn" onClick={() => void exportJson()}>
            {exported === "json" ? "Pobrane" : "Eksportuj JSON"}
          </button>
          <button type="button" className="sy-btn sy-btn--ghost" onClick={() => void exportCsv()}>
            {exported === "csv" ? "Pobrane" : "Eksportuj CSV"}
          </button>
        </div>

        {/* Jedyne miejsce w aplikacji z podwójnym potwierdzeniem - bo jako jedyne
            jest nieodwracalne po stronie urządzenia. */}
        <button
          type="button"
          className="sy-module"
          onClick={() => (wipeStage === 0 ? setWipeStage(1) : void wipeLocalData())}
        >
          <span>{wipeStage === 0 ? "Usuń wszystkie dane z tego urządzenia" : "Na pewno? Kliknij raz jeszcze"}</span>
          <span className="sy-module__note">{wipeStage === 0 ? "" : "nieodwracalne"}</span>
        </button>
        {wipeStage === 1 && (
          <p className="sy-sub">
            Usuwa dane z tego urządzenia. Kopia na serwerze zostaje - po zalogowaniu wrócą.
            Jeśli chcesz je skasować także tam, powiedz to wprost, to inna operacja.
          </p>
        )}
      </section>

      <section className="sy-section">
        <h2 className="sy-section__title">Zanim to zoptymalizujesz</h2>
        {/* Karta 12 z modeli mentalnych - zabezpieczenie przed resztą aplikacji, więc
            stoi tam, gdzie użytkownik zmienia ustawienia, a nie tylko w module wiedzy. */}
        <ModelCard model={HIGHLIGHTED_MODEL} />
      </section>

      <section className="sy-section">
        <h2 className="sy-section__title">Protokoły awaryjne</h2>
        <ul className="sy-list">
          {PROTOCOLS.map(([situation, protocol]) => (
            <li key={situation} className="sy-list__row" style={{ display: "block" }}>
              <span className="sy-list__name" style={{ display: "block", marginBottom: 4 }}>
                {situation}
              </span>
              <span style={{ color: "var(--ink-2)", fontSize: 15 }}>{protocol}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
