import type { PlanetDef, TheatreId } from '@/engine/data/vespator';
import { planetDef } from '@/engine/map';

/**
 * Prozedural gezeichnete Planeten (eigene Grafik): Farbpalette aus den Theatres des Planeten,
 * Details (Bänder, Krater, Ringe, Lichter) deterministisch aus der Planeten-ID.
 */

const PALETTE: Record<TheatreId, [string, string, string]> = {
  SPACEPORT: ['#6c7f95', '#3a4a5c', '#b9c7d6'],
  DESOLATE_WASTES: ['#b58a52', '#6e4f2a', '#e0c08a'],
  XENOFLORA_JUNGLE: ['#4f8a3c', '#244a1e', '#9fd07a'],
  RAD_ZONE: ['#9aa63a', '#4f5a16', '#e2ef6a'],
  FORGE_COMPLEX: ['#a3452a', '#4a1a10', '#ff9a4a'],
  HAB_SPRAWL: ['#7d7468', '#3b352e', '#c9bda8'],
  DELVESITE_FACILITY: ['#8a6a4e', '#44301f', '#c7a07a'],
  DEAD_LANDS: ['#8d8a84', '#44423e', '#c8c4bb'],
  TOMB_COMPLEX: ['#3c4a44', '#161f1b', '#5fe0a0'],
};

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Planeten mit Porträtbild (public/art/planets). Nur die unveränderte Vespator-Karte nutzt die Porträts:
 * eigene Karten und abgewandelte Vespator-Planeten (ID mit Suffix „.xxxx“, siehe forkMap) bleiben prozedural (N6).
 */
const PHOTO_PLANETS = new Set(['norallus', 'masnet', 'felgris-secundas', 'tarkad-vindix', 'jawardet', 'karabas', 'kryndaer', 'novamagnor', 'astarthem', 'caltus-novem', 'marvinius', 'vikus-decima', 'ikaron-prime']);

/** true, wenn es für genau diese Planeten-ID ein Porträtbild gibt */
export const hasPortrait = (planetId: string) => PHOTO_PLANETS.has(planetId);

/** Pfad des Porträtbilds (relativ zur Website) */
export const portraitSrc = (planetId: string) => `/art/planets/${planetId}.webp`;

/**
 * Planetengrafik. `planetImages` (Einstellung „Planetenbilder verwenden“) wählt zwischen Porträtbild und prozeduraler Grafik.
 * Ohne Angabe werden beide gerendert und CSS entscheidet über data-planet-art am <html>-Element (Rückfall).
 * `photo = false` erzwingt die prozedurale Grafik (Druck). Die SVG-IDs hängen nur vom Inhalt ab (ohne Hooks, auch serverseitig nutzbar).
 */
const NEUTRAL: [string, string, string] = ['#6b6f6c', '#2c302e', '#a9aea9'];

export function PlanetArt({
  planetId,
  r = 22,
  destroyed = false,
  cx = 0,
  cy = 0,
  photo = true,
  planetImages,
  def: given,
  image,
}: {
  planetId: string;
  r?: number;
  destroyed?: boolean;
  cx?: number;
  cy?: number;
  photo?: boolean;
  planetImages?: boolean;
  def?: PlanetDef;
  /** eigenes Porträt (Upload-ID, NTH2 4.2) – hat Vorrang vor Porträtbild und prozeduraler Grafik */
  image?: string | null;
}) {
  // Entwürfe im Karteneditor sind noch nicht registriert und reichen ihre Stammdaten direkt durch
  if (image && photo) return <UploadedGlobe image={image} r={r} cx={cx} cy={cy} destroyed={destroyed} />;
  const def = given ?? planetDef(planetId);
  if (!def) return null;
  const rand = rng(planetId);
  // Entwürfe im Karteneditor dürfen (noch) ohne Theatre sein – dann neutrale Grautöne
  const first = PALETTE[def.theatres[0]] ?? NEUTRAL;
  const [base, dark, light] = first;
  const accent = (PALETTE[def.theatres[1]] ?? first)[2];
  // inhaltsabhängige ID ohne Hook: gleiche ID ⇒ identische Definition (Globus und Porträt unterscheiden sich im Radius)
  const id = `pl-${planetId}-${r}-${cx}-${cy}-${destroyed ? 1 : 0}-${planetImages === undefined ? 'c' : planetImages ? 1 : 0}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const portrait = photo && planetImages !== false && hasPortrait(planetId);
  const showProc = !portrait || planetImages === undefined;
  const bands = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => ({ y: r2((rand() * 1.6 - 0.8) * r), h: r2((0.08 + rand() * 0.18) * r), o: r2(0.18 + rand() * 0.3), c: rand() > 0.5 ? dark : light }));
  const craters = Array.from({ length: 2 + Math.floor(rand() * 5) }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r * 0.75;
    return { x: r2(Math.cos(a) * d), y: r2(Math.sin(a) * d), s: r2((0.06 + rand() * 0.12) * r) };
  });
  const ring = rand() > 0.62;
  const tilt = r2(-25 + rand() * 50);
  const hasLights = def.theatres.includes('HAB_SPRAWL') || def.theatres.includes('FORGE_COMPLEX') || def.theatres.includes('SPACEPORT');
  const lights = hasLights ? Array.from({ length: 7 }, () => ({ x: r2(r * (0.05 + rand() * 0.6)), y: r2((rand() * 1.4 - 0.7) * r) })) : [];
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <defs>
        <radialGradient id={`${id}-g`} cx="35%" cy="32%" r="75%">
          <stop offset="0%" stopColor={light} />
          <stop offset="45%" stopColor={base} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <radialGradient id={`${id}-sh`} cx="30%" cy="30%" r="95%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id={`${id}-atm`} r="50%">
          <stop offset="80%" stopColor={accent} stopOpacity="0" />
          <stop offset="92%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-c`}>
          <circle r={r} />
        </clipPath>
      </defs>
      {showProc && (
        <g className={portrait ? 'proc-art' : undefined}>
          <circle r={r * 1.25} fill={`url(#${id}-atm)`} />
          {ring && <ellipse rx={r * 1.75} ry={r * 0.42} fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth={r * 0.12} transform={`rotate(${tilt})`} />}
          <circle r={r} fill={`url(#${id}-g)`} />
          <g clipPath={`url(#${id}-c)`}>
            <g transform={`rotate(${tilt})`}>
              {bands.map((b, i) => (
                <rect key={i} x={-r} y={b.y} width={r * 2} height={b.h} fill={b.c} opacity={b.o} />
              ))}
            </g>
            {craters.map((c, i) => (
              <g key={i}>
                <circle cx={c.x} cy={c.y} r={c.s} fill={dark} opacity="0.55" />
                <circle cx={r2(c.x - c.s * 0.25)} cy={r2(c.y - c.s * 0.25)} r={r2(c.s * 0.7)} fill={light} opacity="0.18" />
              </g>
            ))}
            {lights.map((l, i) => (
              <circle key={i} cx={l.x} cy={l.y} r={r2(r * 0.035)} fill="#ffd27a" opacity="0.9" />
            ))}
            <circle r={r} fill={`url(#${id}-sh)`} />
            {destroyed && (
              <g stroke="#ff5a3a" strokeWidth={r * 0.06} fill="none" opacity="0.9">
                <path d={`M${-r * 0.7} ${-r * 0.2} L${-r * 0.1} ${r * 0.1} L${r * 0.3} ${-r * 0.4} M${-r * 0.1} ${r * 0.1} L${r * 0.2} ${r * 0.7}`} />
              </g>
            )}
          </g>
          {ring && <path d={`M${-r * 1.75} 0 A${r * 1.75} ${r * 0.42} 0 0 0 ${r * 1.75} 0`} fill="none" stroke={accent} strokeOpacity="0.7" strokeWidth={r * 0.12} transform={`rotate(${tilt})`} />}
          <circle r={r} fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth={1} />
        </g>
      )}
      {portrait && (
        <g className={planetImages === undefined ? 'planet-art' : undefined}>
          <image
            href={portraitSrc(planetId)}
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#${id}-c)`}
            preserveAspectRatio="xMidYMid slice"
            style={destroyed ? { filter: 'grayscale(0.8) brightness(0.55) sepia(0.4)' } : undefined}
          />
          {destroyed && (
            <g stroke="#ff5a3a" strokeWidth={r * 0.07} fill="none" opacity="0.95" strokeLinecap="round">
              <path d={`M${-r * 0.7} ${-r * 0.2} L${-r * 0.1} ${r * 0.1} L${r * 0.3} ${-r * 0.4} M${-r * 0.1} ${r * 0.1} L${r * 0.2} ${r * 0.7}`} />
            </g>
          )}
        </g>
      )}
    </g>
  );
}

/** Hochgeladenes Planetenporträt als Globus (Kreisausschnitt, Rand, Schatten; zerstört: entsättigt mit Riss) */
function UploadedGlobe({ image, r, cx, cy, destroyed }: { image: string; r: number; cx: number; cy: number; destroyed: boolean }) {
  const id = `up-${image}-${r}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <defs>
        <clipPath id={`${id}-c`}>
          <circle r={r} />
        </clipPath>
        <radialGradient id={`${id}-sh`} cx="30%" cy="30%" r="95%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.7" />
        </radialGradient>
      </defs>
      <image
        href={`/api/uploads/${image}?thumb=1`}
        x={-r}
        y={-r}
        width={r * 2}
        height={r * 2}
        clipPath={`url(#${id}-c)`}
        preserveAspectRatio="xMidYMid slice"
        style={destroyed ? { filter: 'grayscale(0.8) brightness(0.55) sepia(0.4)' } : undefined}
      />
      <circle r={r} fill={`url(#${id}-sh)`} />
      <circle r={r} fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth={1} />
      {destroyed && (
        <g stroke="#ff5a3a" strokeWidth={r * 0.07} fill="none" opacity="0.95" strokeLinecap="round">
          <path d={`M${-r * 0.7} ${-r * 0.2} L${-r * 0.1} ${r * 0.1} L${r * 0.3} ${-r * 0.4} M${-r * 0.1} ${r * 0.1} L${r * 0.2} ${r * 0.7}`} />
        </g>
      )}
    </g>
  );
}

/** Eigenständiges SVG für Detailseiten und Listen */
export function PlanetPortrait({ planetId, size = 120, destroyed = false, planetImages, image, def }: { planetId: string; size?: number; destroyed?: boolean; planetImages?: boolean; image?: string | null; def?: PlanetDef }) {
  return (
    <svg viewBox="-60 -60 120 120" width={size} height={size} aria-hidden className="inline-block shrink-0">
      <PlanetArt planetId={planetId} r={34} destroyed={destroyed} planetImages={planetImages} image={image} def={def} />
    </svg>
  );
}
