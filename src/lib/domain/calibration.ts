// Kalibracja RIR.
//
// Steele i wsp. (2017), n = 141: doświadczeni zaniżają odległość od upadku
// o 1-2 powtórzenia, mniej doświadczeni o 4-5. Bez korekty cała progresja stoi
// na zawyżonych deklaracjach - dlatego to nie jest gadżet, tylko pomiar błędu.
//
// Test robimy WYŁĄCZNIE na izolacjach: seria do faktycznego upadku
// w przysiadzie czy martwym ciągu to ryzyko kontuzji, nie pomiar.

const NEVER_CALIBRATE = new Set([
  "back_squat",
  "deadlift",
  "rdl",
  "bench_press",
  "ohp",
]);

const MIN_DAYS = 14;
const MAX_DAYS = 21;

export function shouldOfferCalibration(
  lastCalibrationAt: Date | null,
  exercise: { is_compound: boolean; slug: string },
  now: Date = new Date()
): boolean {
  if (exercise.is_compound) return false;
  if (NEVER_CALIBRATE.has(exercise.slug)) return false;
  if (!lastCalibrationAt) return true;

  const days = (now.getTime() - lastCalibrationAt.getTime()) / 86_400_000;
  return days >= MIN_DAYS;
}

/** Okno propozycji zamyka się po 21 dniach - dalej i tak proponujemy. */
export function calibrationOverdue(lastCalibrationAt: Date | null, now: Date = new Date()): boolean {
  if (!lastCalibrationAt) return false;
  return (now.getTime() - lastCalibrationAt.getTime()) / 86_400_000 > MAX_DAYS;
}

export type CalibrationTest = { predicted_reps: number; reps: number };

/**
 * Błąd systematyczny: ile powtórzeń realnie zostawało, gdy użytkownik
 * deklarował, że jest na wyczerpaniu. Liczymy dopiero z trzech testów -
 * pojedynczy pomiar to szum.
 */
export function rirBias(tests: CalibrationTest[]): number | null {
  if (tests.length < 3) return null;
  const sum = tests.reduce((acc, t) => acc + (t.reps - t.predicted_reps), 0);
  return Math.round((sum / tests.length) * 10) / 10;
}

export function biasMessage(bias: number, declaredRir = 2): string {
  const sign = bias > 0 ? `+${formatBias(bias)}` : formatBias(bias);
  const real = Math.round((declaredRir + bias) * 10) / 10;
  return `Twoja średnia pomyłka: ${sign} powtórzeń. Gdy myślisz, że masz ${declaredRir} w zapasie, realnie masz około ${formatBias(real)}.`;
}

function formatBias(value: number): string {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}
