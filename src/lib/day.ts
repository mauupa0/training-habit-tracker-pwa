import type { IsoDate } from "@/types";

/**
 * Dzień w strefie urządzenia.
 *
 * `new Date().toISOString()` liczy w UTC, więc w Polsce między północą a 2:00
 * oddawał datę wczorajszą - sesja zaczęta o 00:30 lądowała w poprzedniej dobie,
 * a onboarding podpowiadał wczorajszą datę startu. Dziennik treningowy jest
 * zapisywany także po północy, więc doba musi być lokalna.
 */
export function todayIso(now: Date = new Date()): IsoDate {
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10) as IsoDate;
}
