/**
 * Klangteppich im Präsentationsmodus (NTH2 4.4): reine Entscheidungshilfen ohne Web-Audio,
 * damit sie ohne Browser testbar sind.
 */

/** Neue Meldungen im Laufband: Schlüssel, die vorher nicht da waren. Beim ersten Stand (prev = null) keine. */
export function newMessageKeys(prev: readonly string[] | null, next: readonly string[]): string[] {
  if (!prev) return [];
  const seen = new Set(prev);
  return next.filter((k) => !seen.has(k));
}

/** Ton bei neuer Meldung: nur mit Ton an, nicht bei „reduzierter Bewegung“ und nur bei wirklich neuen Einträgen */
export function shouldChime(prev: readonly string[] | null, next: readonly string[], opts: { on: boolean; reducedMotion: boolean }): boolean {
  if (!opts.on || opts.reducedMotion) return false;
  return newMessageKeys(prev, next).length > 0;
}

/** Lautstärke 0–100 → Verstärkung; bewusst leise (höchstens 0,35) und quadratisch für ein natürliches Gefühl */
export function volumeGain(v: number): number {
  const x = Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0)) / 100;
  return Math.round(x * x * 0.35 * 1000) / 1000;
}
