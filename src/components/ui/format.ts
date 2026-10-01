/** Aplikacja jest polska: użytkownik pisze 62,5 i chce widzieć 62,5. */

export function toPl(n: number, decimals = 2): string {
  const rounded = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return String(rounded).replace('.', ',');
}

export function fromPl(raw: string): number {
  return parseFloat(String(raw).replace(',', '.'));
}

/** m:ss - format odczytu timera przerwy. */
export function clock(seconds: number): string {
  if (seconds <= 0) return '-:-';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
