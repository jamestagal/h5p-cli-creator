/** Compares two strings by UTF-16 code unit, for deterministic, locale-independent sort order. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
