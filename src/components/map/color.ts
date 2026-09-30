/** Farbhilfen für Karte und Statistik (rein, ohne DOM) */

const parse = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/**
 * Mischt `color` mit `base` (Anteil `t` von `color`, 0…1) und liefert #rrggbb. Unbekannte Formate bleiben unverändert,
 * damit frei gewählte Allianzfarben (z. B. benannte CSS-Farben) weiterhin funktionieren.
 */
export function mixHex(color: string, base: string, t: number): string {
  const a = parse(color);
  const b = parse(base);
  if (!a || !b) return color;
  const k = Math.min(1, Math.max(0, t));
  return `#${a
    .map((v, i) =>
      Math.round(b[i] + (v - b[i]) * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Gedeckte Allianzfarbe für ruhende Karten- und Diagrammflächen (volle Sättigung nur für Hervorhebungen) */
export const muted = (color: string, t = 0.55) => mixHex(color, '#141817', t);
