// Progresywne odblokowywanie modułów (R5) i awans tygodnia.
//
// Każde nowe zachowanie zużywa uwagę, dopóki nie stanie się automatyczne.
// Wprowadzone naraz konkurują o ten sam zasób i wszystkie wychodzą gorzej -
// dlatego harmonogram, a nie „włącz wszystko na starcie".

export type ModuleKey =
  | "training"
  | "protein"
  | "sleep"
  | "creatine"
  | "calories_measure"
  | "calories_goal"
  | "steps";

export const UNLOCK_SCHEDULE: Record<number, ModuleKey[]> = {
  1: ["training"],
  3: ["protein"],
  5: ["sleep", "creatine"],
  7: ["calories_measure"],
  9: ["calories_goal"],
  11: ["steps"],
};

export const MODULE_LABEL: Record<ModuleKey, string> = {
  training: "Trening",
  protein: "Białko",
  sleep: "Sen",
  creatine: "Kreatyna",
  calories_measure: "Kalorie - pomiar",
  calories_goal: "Kalorie - cel",
  steps: "Kroki",
};

/** W trybie awaryjnym zostaje trening i białko; reszta znika z ekranu. */
const EMERGENCY_ALLOWED: ModuleKey[] = ["training", "protein"];

export function unlockWeekOf(module: ModuleKey): number {
  for (const [week, modules] of Object.entries(UNLOCK_SCHEDULE)) {
    if (modules.includes(module)) return Number(week);
  }
  return 1;
}

export function modulesForWeek(week: number): ModuleKey[] {
  return Object.entries(UNLOCK_SCHEDULE)
    .filter(([w]) => Number(w) <= week)
    .flatMap(([, modules]) => modules);
}

/** Co realnie widać: harmonogram + ręczne odblokowania, przycięte trybem awaryjnym. */
export function activeModules(
  week: number,
  manualUnlocks: ModuleKey[],
  emergencyMode: boolean
): ModuleKey[] {
  const all = [...new Set([...modulesForWeek(week), ...manualUnlocks])];
  return emergencyMode ? all.filter((m) => EMERGENCY_ALLOWED.includes(m)) : all;
}

export function isUnlocked(
  module: ModuleKey,
  week: number,
  manualUnlocks: ModuleKey[],
  emergencyMode = false
): boolean {
  return activeModules(week, manualUnlocks, emergencyMode).includes(module);
}

export function lockedMessage(module: ModuleKey): string {
  return `Odblokowuje się w tygodniu ${unlockWeekOf(module)}. Teraz skup się na treningu.`;
}

export type WeekSession = { status: "in_progress" | "full" | "minimal" | "abandoned" };

/**
 * Awans tylko przy min. 3 z 4 sesji w poprzednim tygodniu.
 * Brak awansu nie jest karą i nie dostaje komentarza poza suchym stwierdzeniem.
 */
export function shouldAdvanceWeek(sessionsLastWeek: WeekSession[]): boolean {
  return sessionsLastWeek.filter((s) => s.status === "full" || s.status === "minimal").length >= 3;
}

export function weekAdvanceMessage(newWeek: number): string {
  const arriving = UNLOCK_SCHEDULE[newWeek];
  const closed = `Tydzień ${newWeek - 1} zamknięty.`;
  if (!arriving?.length) return closed;
  return `${closed} Od jutra dochodzi ${arriving.map((m) => MODULE_LABEL[m].toLowerCase()).join(" i ")}.`;
}

export function weekHoldMessage(week: number): string {
  return `Zostajemy w tygodniu ${week}.`;
}

/** Tryb awaryjny: pytamy o powrót raz na 4 tygodnie i nigdy z własnej inicjatywy wcześniej. */
export function shouldAskAboutEmergency(
  startedOn: string | null,
  lastAskedIso: string | null,
  now: Date = new Date()
): boolean {
  if (!startedOn) return false;
  const since = lastAskedIso ?? startedOn;
  const days = (now.getTime() - new Date(since).getTime()) / 86_400_000;
  return days >= 28;
}
