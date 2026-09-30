import { IMPERIAL, SEAL_TEXT } from '@/flavor';

/**
 * Eigene Embleme (keine Kopien fremder Grafiken). Das Motiv im Siegel hängt vom Build-Flavor ab (`src/flavor.ts`):
 * imperial = Schädel, neutral = Kompassstern.
 */

const SKULL =
  'M12 2C7.03 2 3.5 5.6 3.5 10.2c0 2.6 1.1 4.6 2.8 5.8V19c0 .8.6 1.4 1.4 1.4h1.1v1.1c0 .3.2.5.5.5h.9c.3 0 .5-.2.5-.5v-1.1h1.2v1.1c0 .3.2.5.5.5h.9c.3 0 .5-.2.5-.5v-1.1h1.1c.8 0 1.4-.6 1.4-1.4v-3c1.7-1.2 2.8-3.2 2.8-5.8C20.5 5.6 16.97 2 12 2Zm-3.6 12.2a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Zm3.6 2.3-1.1-2h2.2l-1.1 2Zm3.6-2.3a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Z';

/** Achtstrahliger Kompassstern um (0,0): lange Haupt-, kurze Nebenstrahlen */
const COMPASS = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 4 === 0 ? 11 : i % 2 === 0 ? 6.5 : 2.6;
    pts.push(`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

/** Wachssiegel mit zwei Pergamentstreifen; `text` = Aufschrift der Streifen (Standard je Flavor) */
export function WaxSeal({ size = 58, className = '', text = SEAL_TEXT.login }: { size?: number; className?: string; text?: [string, string] | string[] }) {
  return (
    <svg width={size} height={size * 1.55} viewBox="0 0 60 93" aria-hidden className={`pointer-events-none ${className}`}>
      <defs>
        <radialGradient id="wax" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#c0392b" />
          <stop offset="0.6" stopColor="#7a1612" />
          <stop offset="1" stopColor="#3d0806" />
        </radialGradient>
        <linearGradient id="parch" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9c9a0" />
          <stop offset="0.5" stopColor="#efe3c8" />
          <stop offset="1" stopColor="#cbb88c" />
        </linearGradient>
      </defs>
      <path d="M17 34 L13 90 L19 84 L24 91 L27 36 Z" fill="url(#parch)" stroke="#8a7550" strokeWidth="0.6" />
      <path d="M33 36 L36 89 L41 83 L47 90 L43 34 Z" fill="url(#parch)" stroke="#8a7550" strokeWidth="0.6" />
      {text.map((t, i) => (
        <text key={t} x={i === 0 ? 20 : 40} y={50} fontSize="4.4" fill="#3b2a14" fontFamily="var(--font-cinzel), serif" transform={`rotate(${i === 0 ? 94 : 86} ${i === 0 ? 20 : 40} 50)`} letterSpacing="0.6">
          {t}
        </text>
      ))}
      <path
        d="M30 3 C38 2 44 6 49 11 C55 17 57 24 55 31 C53 39 47 45 39 47 C31 50 22 48 15 43 C8 38 4 30 6 22 C8 13 20 4 30 3 Z"
        fill="url(#wax)"
        stroke="#3d0806"
        strokeWidth="1"
      />
      <circle cx="30" cy="25" r="14" fill="none" stroke="#e07a6a" strokeOpacity="0.35" strokeWidth="1.2" />
      {IMPERIAL ? (
        <g transform="translate(20.5 15) scale(0.8)">
          <path fill="#4a0b08" opacity="0.85" d={SKULL} />
        </g>
      ) : (
        <g transform="translate(30 25)" fill="#4a0b08" opacity="0.85">
          <path d={COMPASS} />
          <circle r="1.3" fill="#e07a6a" fillOpacity="0.45" />
        </g>
      )}
    </svg>
  );
}
