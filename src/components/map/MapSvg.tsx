import { mapOf, planetDef, type MapDef } from '@/engine/map';
import { minPL } from '@/engine/board';
import type { CampaignState } from '@/engine/types';
import { TheatreGlyph } from './icons';
import { PlanetArt } from './PlanetArt';
import { GameIconG } from '@/components/icons/GameIcon';
import { INFRA_ICON } from '@/components/icons/registry';
import { DEFAULT_LOCALE, makeT, type Locale } from '@/i18n/core';
import { muted } from './color';

export const MAP_W = 1690;
export const MAP_H = 1188;

export interface MapArrow {
  from: string;
  to: string;
  color: string;
  label?: string;
  dashed?: boolean;
  /** abgeschwächt, weil eine andere Operation im Fokus steht */
  dim?: boolean;
  /** Kennung für Fokus-Pfeile aus den Panels (MapFocus) */
  id?: string;
}

export interface MapSvgProps {
  /** Sprache der Beschriftungen (N5.4); Standard Deutsch */
  locale?: Locale;
  state: CampaignState;
  selected?: string | null;
  highlight?: string[];
  highlightColor?: string;
  arrows?: MapArrow[];
  heat?: Record<string, number>;
  onPlanet?: (id: string) => void;
  print?: boolean;
  points?: Record<string, number> | null;
  viewBox?: string;
  className?: string;
  title?: string;
  /** full = Nachbau der Regelbuch-Karte (Druck/PNG), compact = gut lesbare Übersicht */
  variant?: 'full' | 'compact';
  /** Karteneinheiten pro Bildschirmpixel – steuert Schrift- und Symbolgrößen der Übersicht */
  unit?: number;
  /** Übersicht um 90° gedreht (Hochformat für Handys) */
  portrait?: boolean;
  /** Übersicht: Seitenverhältnis (Höhe/Breite) der Anzeigefläche – die Zeichenfläche und die Einpassung folgen ihm */
  aspect?: number;
  /** Übersicht: Eckflächen (Bildschirmpixel), die Planeten samt Beschriftung meiden – z. B. Kartenschmuck mit Kenndaten */
  reserve?: Reserve[];
  preserveAspectRatio?: string;
  /** Zeitraffer (N3.2): Flotten unterwegs zwischen zwei Planeten, t = 0…1 */
  fleetMotion?: { fleetId: string; from: string; to: string; t: number }[];
  /** Einstellung „Planetenbilder verwenden“ (N6); undefined = CSS entscheidet über data-planet-art */
  planetImages?: boolean;
  /** Übersicht: false = nur Name, Machtring und Flotten; Power-Level-Zahlen und Infrastruktur nur am gewählten Planeten (dichte Handykarte) */
  dense?: boolean;
  /** Übersicht: hebt die Obergrenzen der Marken- und Schriftgrößen an (Präsentation, Betrachtung aus Abstand) */
  markerScale?: number;
}

/** Klickbare Planeten: Rolle, Fokus und Tastatur (Enter/Leertaste) für Nutzer ohne Maus */
function planetA11y(onPlanet: MapSvgProps['onPlanet'], id: string, label: string) {
  if (!onPlanet) return {};
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: () => onPlanet(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPlanet(id);
      }
    },
    style: { cursor: 'pointer' },
  } as const;
}

/**
 * Präfix für SVG-IDs – ohne Hooks (der PNG-Export rendert außerhalb von React-Server-Komponenten)
 * und inhaltsabhängig: gleiche IDs auf einer Seite haben stets identische Definitionen.
 */
function svgId(variant: string, print?: boolean) {
  return `m-${variant}${print ? '-p' : ''}`;
}

const pos = (id: string) => {
  const p = planetDef(id)!;
  return { x: (p.x / 100) * MAP_W, y: (p.y / 100) * MAP_H };
};

/**
 * Reine SVG-Darstellung der Kampagnenkarte (ohne Hooks), nutzbar im Browser
 * und serverseitig für den PNG-Export.
 */
export function MapSvg(props: MapSvgProps) {
  if (props.variant === 'compact') return <CompactMap {...props} />;
  return <FullMap {...props} />;
}

/**
 * Enge Umrisse aller Inhalte der Detailkarte (Planeten samt PL-Raster, Schildern, Infrastruktur, Theatres, Flotten)
 * in Karteneinheiten – Grundlage für die eigene Einpassung des Detailmodus.
 */
export function fullContentBounds(state: CampaignState) {
  const map = mapOf(state);
  const cols = Math.max(state.alliances.length, 2);
  const gridW = cols * (FL.cellW + FL.cellGap);
  const levels = state.planets.some((p) => Object.values(p.power).some((v) => v > 4)) ? 6 : 5;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const def of map.planets) {
    const { x, y } = pos(def.id);
    const pw = plateWidth(def.name, FL.plateF);
    x0 = Math.min(x0, x - FL.gridRight - gridW - FL.digitPad, x - pw / 2, x - 90);
    x1 = Math.max(x1, x + FL.sideX - 8 + Math.max(def.slots * 38 + 8, def.theatres.length * 36 + 8, def.system.length * 11), x + pw / 2, x + 90);
    y0 = Math.min(y0, y + FL.plateY - FL.plateH / 2);
    y1 = Math.max(y1, y + 112, y + FL.gridTop + levels * (FL.cellH + FL.cellGap) + 18);
  }
  const m = 16;
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
}

/**
 * Maße der Detailkarte in Karteneinheiten (relativ zum Planetenmittelpunkt). Schild, PL-Raster und Globus bilden
 * einen engen Block: das Schild sitzt direkt über dem Raster, Infrastruktur und Theatres rechts neben dem Globus,
 * das System unter dem Globus. Schriftgrößen so, dass sie beim Startmaßstab (≈ 0,72 px je Einheit) lesbar bleiben.
 */
const FL = {
  R: 34,
  cellW: 36,
  cellH: 24,
  cellGap: 3,
  /** Abstand der rechten Rasterkante zum Planetenmittelpunkt */
  gridRight: 50,
  /** Platz links der Zellen für die PL-Ziffern */
  digitPad: 26,
  /** Oberkante des Rastergehäuses */
  gridTop: -78,
  plateY: -101,
  plateH: 38,
  plateF: 23,
  /** linke Kante von Infrastruktur und Theatres */
  sideX: 54,
} as const;

/** Breite eines Messingschilds für einen Planetennamen (Cinzel, grob geschätzt) */
const plateWidth = (name: string, f: number) => Math.max(150, Math.round(name.length * f * 0.78 + 44));

/** Schriftgröße der Detailkarte: nach der SVG-Skalierung mindestens 14 Bildschirm-px, höchstens 1,6-fach vergrößert */
export const detailFont = (n: number, unit?: number) => (unit ? r2(Math.min(n * 1.6, Math.max(n, 14 * unit))) : n);

/**
 * Belegte Flächen der Detailkarte je Planet (Karteneinheiten): Namensschild, PL-Raster, Globus, Infrastruktur,
 * Theatres, Systemname und Flotten. Routen laufen unter diesen Blöcken, Routenschilder weichen ihnen aus.
 */
export function detailBlocks(state: CampaignState, unit?: number): Map<string, Box[]> {
  const map = mapOf(state);
  const cols = Math.max(state.alliances.length, 2);
  const gridW = cols * (FL.cellW + FL.cellGap);
  const levels = state.planets.some((p) => Object.values(p.power).some((v) => v > 4)) ? 6 : 5;
  const sysF = detailFont(15, unit);
  const out = new Map<string, Box[]>();
  for (const def of map.planets) {
    const { x, y } = pos(def.id);
    const pw = plateWidth(def.name, FL.plateF);
    const gx = x - FL.gridRight - gridW;
    const gy = y + FL.gridTop;
    const nFleets = state.fleets.filter((f) => f.planetId === def.id).length;
    const fleetHalf = nFleets ? Math.sin(((nFleets - 1) / 2) * 0.32) * 80 + 14 : 0;
    const boxes: Box[] = [
      { x0: x - pw / 2, x1: x + pw / 2, y0: y + FL.plateY - FL.plateH / 2, y1: y + FL.plateY + FL.plateH / 2 },
      { x0: gx - FL.digitPad, x1: gx + gridW + 5, y0: gy, y1: gy + levels * (FL.cellH + 3) + 18 },
      { x0: x - FL.R - 8, x1: x + FL.R + 8, y0: y - FL.R - 8, y1: y + FL.R + 8 },
      { x0: x + FL.sideX - 8, x1: x + FL.sideX + def.slots * 38, y0: y - 64, y1: y - 24 },
      { x0: x + FL.sideX - 8, x1: x + FL.sideX + def.theatres.length * 36, y0: y, y1: y + 40 },
      { x0: x + FL.sideX - 10, x1: x + FL.sideX - 6 + def.system.length * sysF * 0.55, y0: y + 62 - sysF * 0.85, y1: y + 62 + sysF * 0.3 },
    ];
    if (nFleets) boxes.push({ x0: x - fleetHalf, x1: x + fleetHalf, y0: y + 64, y1: y + 94 + detailFont(15, unit) });
    out.set(def.id, boxes);
  }
  return out;
}

/** Punkt liegt in einer der Flächen (mit Rand m) */
const inAny = (x: number, y: number, boxes: Box[], m: number) => boxes.some((b) => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m);

/**
 * Sichtbarer Abschnitt einer Route von (sx,sy) nach (ex,ey): Anfang und Ende rücken aus den Blöcken des Start- bzw.
 * Zielplaneten heraus, damit Linie und Pfeilspitze nie auf Raster, Symbolgruppen oder Systemnamen liegen.
 * Reicht der Platz nicht, bleibt die Route unverkürzt (sie läuft dann unter den Blöcken).
 */
export function clipRoute(sx: number, sy: number, ex: number, ey: number, fromBlocks: Box[], toBlocks: Box[], m: number, tail = 0) {
  const len = Math.hypot(ex - sx, ey - sy);
  if (len < 1) return { sx, sy, ex, ey };
  const ux = (ex - sx) / len;
  const uy = (ey - sy) / len;
  const step = 4;
  const room = len * 0.42;
  let a = 0;
  while (a < room && inAny(sx + ux * a, sy + uy * a, fromBlocks, m)) a += step;
  let b = 0;
  // Die Pfeilspitze ragt um `tail` über das Linienende hinaus – auch sie bleibt frei
  while (b < room && (inAny(ex - ux * b, ey - uy * b, toBlocks, m) || inAny(ex - ux * (b - tail), ey - uy * (b - tail), toBlocks, m))) b += step;
  if (a >= room || b >= room) return { sx, sy, ex, ey };
  return { sx: r2(sx + ux * a), sy: r2(sy + uy * a), ex: r2(ex - ux * b), ey: r2(ey - uy * b) };
}

/**
 * Lage eines Routenschilds (Breite w, Höhe h) entlang des Abschnitts: probiert Stellen auf und seitlich der Route und
 * wählt die mit der geringsten Überdeckung von belegten Flächen und bereits gesetzten Schildern.
 */
export function placePlaque(sx: number, sy: number, ex: number, ey: number, w: number, h: number, occupied: Box[]): { x: number; y: number; box: Box } {
  const len = Math.max(1, Math.hypot(ex - sx, ey - sy));
  const nx = -(ey - sy) / len;
  const ny = (ex - sx) / len;
  const ks = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78];
  const sides = [0, -1, 1];
  let best = { x: (sx + ex) / 2, y: (sy + ey) / 2 };
  let bestCost = Infinity;
  ks.forEach((k, ki) =>
    sides.forEach((s, si) => {
      const d = s * (h * 0.5 + Math.abs(nx) * w * 0.5 + 4);
      const x = sx + (ex - sx) * k + nx * d;
      const y = sy + (ey - sy) * k + ny * d;
      const b = { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
      let cost = (ki + si * 1.5) * w * h * 0.01;
      for (const o of occupied) cost += overlap(b, o);
      if (cost < bestCost) {
        bestCost = cost;
        best = { x, y };
      }
    }),
  );
  return { ...best, box: { x0: best.x - w / 2, x1: best.x + w / 2, y0: best.y - h / 2, y1: best.y + h / 2 } };
}

/** Dunkles Routenschild (Übersicht und Detailkarte): Allianzfarbe nur als Kontur, Schrift in Elfenbein */
function RoutePlaque({ x, y, w, h, f, color, label, sw, print }: { x: number; y: number; w: number; h: number; f: number; color: string; label: string; sw: number; print?: boolean }) {
  return (
    <g transform={`translate(${r2(x)} ${r2(y)})`}>
      <rect x={r2(-w / 2)} y={r2(-h / 2)} width={r2(w)} height={r2(h)} rx={r2(h * 0.15)} fill={print ? '#fff' : '#070a09'} fillOpacity={print ? 1 : 0.92} stroke={color} strokeOpacity={0.75} strokeWidth={r2(sw)} />
      <text y={r2(f * 0.34)} textAnchor="middle" fontSize={r2(f)} fontWeight={700} fill={print ? '#000' : '#efe4c8'} style={{ fontFamily: 'var(--font-body), sans-serif' }}>
        {label}
      </text>
    </g>
  );
}

/**
 * Detailkarte (Regelbuch-Stil) in der Sprache des taktischen Schirms: transparenter Grund (Raster und Weltraum
 * liefert der `.screen`-Container), türkise Kartenlinien, Messingschilder je Planet, PL-Raster in dunklem Stahl.
 * `print`: schwarz auf weiß, gut lesbar.
 */
function FullMap({ state, selected, highlight = [], highlightColor = '#dda94d', arrows = [], heat, onPlanet, print, points, viewBox, className, title, preserveAspectRatio, locale, planetImages, unit }: MapSvgProps) {
  const t = makeT(locale ?? DEFAULT_LOCALE);
  // Lesepflichtige Nebenschriften (System, Skalen, Flottennummer, Routen) halten nach der SVG-Skalierung etwa 14 px
  const fs = (n: number) => detailFont(n, unit);
  const sid = svgId('full', print);
  const C = print
    ? {
        line: '#555',
        orbit: '#777',
        text: '#000',
        dim: '#333',
        cell: '#f1f1f1',
        cellStroke: '#777',
        panel: '#fff',
        panelStroke: '#555',
        plate: '#fff',
        plateStroke: '#000',
        plateText: '#000',
        slot: '#fff',
        slotStroke: '#555',
        halo: '#fff',
      }
    : {
        line: '#37685b',
        orbit: '#4f8a78',
        text: '#e8dfc9',
        dim: '#b7ae98',
        cell: '#222724',
        cellStroke: '#050707',
        panel: 'rgba(17,21,20,0.9)',
        panelStroke: '#665333',
        plate: `url(#${sid}-brass)`,
        plateStroke: '#2a2010',
        plateText: '#1d1608',
        slot: '#0b1110',
        slotStroke: '#8c7443',
        halo: '#050807',
      };
  const map = mapOf(state);
  const alliances = [...state.alliances].sort((a, b) => a.order - b.order);
  const cols = Math.max(alliances.length, 2);
  const { cellW, cellH, R } = FL;
  const gridW = cols * (cellW + FL.cellGap);
  const maxHeat = heat ? Math.max(1, ...Object.values(heat)) : 1;
  const pts = points ?? null;
  // Hausregel F-17: PL 5 möglich – dann eine Zeile mehr im Raster
  const levels = state.planets.some((p) => Object.values(p.power).some((v) => v > 4)) ? [5, 4, 3, 2, 1, 0] : [4, 3, 2, 1, 0];
  const cinzel = { fontFamily: 'var(--font-cinzel), "Cinzel", serif' };

  // Datenblöcke je Planet: Routen laufen darunter, Schilder weichen ihnen aus
  const blocks = detailBlocks(state, unit);
  const allBlocks = [...blocks.values()].flat();
  const routes = byFocus(arrows).map(([a, i]) => {
    const p = pos(a.from);
    const q = pos(a.to);
    if (a.from === a.to) return { a, i, same: true, sx: p.x, sy: p.y, ex: p.x, ey: p.y };
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const off = ((i % 3) - 1) * 10;
    const seg = clipRoute(p.x + ux * (R + 4) - uy * off, p.y + uy * (R + 4) + ux * off, q.x - ux * (R + 12) - uy * off, q.y - uy * (R + 12) + ux * off, blocks.get(a.from) ?? [], blocks.get(a.to) ?? [], 4, 4);
    return { a, i, same: false, ...seg };
  });
  const plaqueF = fs(18);
  const plaqueH = r2(plaqueF * 1.35);
  const placedPlaques: Box[] = [];
  // Fokussierte Operationen zuerst: sie bekommen die freiesten Stellen
  const plaques = [...routes]
    .reverse()
    .filter((r) => r.a.label && !r.a.dim)
    .map((r) => {
      const label = t(r.a.label!);
      const w = r2(label.length * plaqueF * 0.52 + plaqueF * 0.9);
      // Operation am eigenen Planeten: Schild auf einer Linie unter dem Globus, seitlich ausweichend
      const spot = r.same
        ? placePlaque(r.sx - 150, r.sy + R + 46, r.sx + 150, r.sy + R + 46, w, plaqueH, [...allBlocks, ...placedPlaques])
        : placePlaque(r.sx, r.sy, r.ex, r.ey, w, plaqueH, [...allBlocks, ...placedPlaques]);
      placedPlaques.push({ x0: spot.box.x0 - 4, x1: spot.box.x1 + 4, y0: spot.box.y0 - 4, y1: spot.box.y1 + 4 });
      return { i: r.i, x: spot.x, y: spot.y, w, label, color: r.a.color };
    });

  return (
    <svg
      viewBox={viewBox ?? `0 0 ${MAP_W} ${MAP_H}`}
      preserveAspectRatio={preserveAspectRatio}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={onPlanet ? 'group' : 'img'}
      aria-label={title ?? t('Kampagnenkarte {name}', { name: state.meta.name })}
      style={{ fontFamily: 'var(--font-techmono), "Share Tech Mono", monospace' }}
    >
      <defs>
        <pattern id={`${sid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={print ? '#999' : '#b3975f'} strokeWidth="2" />
        </pattern>
        <marker id={`${sid}-arrowhead`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
        </marker>
        <radialGradient id={`${sid}-glow`}>
          <stop offset="0%" stopColor="#ec6454" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ec6454" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${sid}-halo`}>
          <stop offset="55%" stopColor="#8fd0b8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#8fd0b8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${sid}-brass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2cb94" />
          <stop offset="45%" stopColor="#b3975f" />
          <stop offset="100%" stopColor="#7b653c" />
        </linearGradient>
        <linearGradient id={`${sid}-steel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d2220" />
          <stop offset="100%" stopColor="#111413" />
        </linearGradient>
      </defs>
      {print ? <rect width={MAP_W} height={MAP_H} fill="#fff" /> : map.background ? <rect width={MAP_W} height={MAP_H} fill={map.background} /> : null}

      {/* Punkteleiste (Points Tracker) */}
      <g transform="translate(24 16)">
        <text x={0} y={12} fontSize={fs(16)} fill={C.dim}>
          {t('Kampagnenpunkte')}
        </text>
        {Array.from({ length: 55 }, (_, i) => {
          const major = (i + 1) % 5 === 0 || i === 0;
          return (
            <g key={i} transform={`translate(${i * 17} 18)`}>
              <rect width={15} height={18} fill={print ? 'none' : '#151918'} stroke={major && !print ? '#b3975f' : C.panelStroke} strokeWidth={major ? 1.2 : 1} />
              {major ? (
                <text x={7.5} y={r2(20 + fs(13))} fontSize={fs(13)} textAnchor="middle" fill={C.dim}>
                  {i + 1}
                </text>
              ) : null}
            </g>
          );
        })}
        {pts &&
          alliances.map((a, k) => {
            const v = pts[a.id] ?? 0;
            const idx = Math.min(55, Math.max(1, v)) - 1;
            return (
              <g key={a.id} transform={`translate(${idx * 17 + 7.5} ${27 + (k - (alliances.length - 1) / 2) * 5})`}>
                <circle r={5} fill={a.color} stroke={print ? '#000' : '#050807'} strokeWidth={1} />
                {v > 55 && (
                  <text x={8} y={4} fontSize="11" fill={print ? '#000' : a.color}>
                    {v}
                  </text>
                )}
              </g>
            );
          })}
      </g>

      {/* Verbindungen */}
      <g stroke={C.line} strokeWidth={2.2} strokeDasharray="8 7" opacity={print ? 0.75 : 0.9}>
        {map.connections.map(([a, b]) => {
          const p = pos(a);
          const q = pos(b);
          return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
        })}
      </g>

      {/* Heatmap */}
      {heat &&
        Object.entries(heat).map(([id, n]) => {
          const p = pos(id);
          return n > 0 ? <circle key={id} cx={p.x} cy={p.y} r={40 + (n / maxHeat) * 90} fill={`url(#${sid}-glow)`} /> : null;
        })}

      {/* Routen unter den Datenblöcken – abgeschwächte zuerst, damit die fokussierte Operation obenauf liegt.
          Anfang und Ende rücken aus den Blöcken von Start- und Zielplanet heraus. */}
      {routes.map((r) =>
        r.same ? (
          <circle
            key={r.i}
            opacity={r.a.dim ? DIM : undefined}
            pointerEvents="none"
            cx={r.sx}
            cy={r.sy}
            r={R + 4 + (r.i % 3) * 5}
            fill="none"
            stroke={r.a.color}
            strokeWidth={3}
            strokeDasharray={r.a.dashed ? '5 4' : undefined}
          />
        ) : (
          <g key={r.i} opacity={r.a.dim ? DIM : undefined} pointerEvents="none">
            {!print && <line x1={r.sx} y1={r.sy} x2={r.ex} y2={r.ey} stroke="#050807" strokeWidth={7.5} opacity={0.6} strokeLinecap="round" />}
            <line x1={r.sx} y1={r.sy} x2={r.ex} y2={r.ey} stroke={r.a.color} strokeWidth={4.5} markerEnd={`url(#${sid}-arrowhead)`} strokeDasharray={r.a.dashed ? '10 6' : undefined} opacity={0.92} />
          </g>
        ),
      )}

      {/* Planeten */}
      {map.planets.map((def) => {
        const ps = state.planets.find((x) => x.id === def.id)!;
        const { x, y } = pos(def.id);
        const isSel = selected === def.id;
        const isHi = highlight.includes(def.id);
        const fleets = state.fleets.filter((f) => f.planetId === def.id);
        // Zellen beginnen bei gx; das Rastergehäuse reicht links um digitPad weiter (PL-Ziffern)
        const gx = x - FL.gridRight - gridW;
        const gy = y + FL.gridTop + 8;
        // PL-Zellen ruhend in gedeckter Allianzfarbe (wie die Ringe der Übersicht); volle Farbe bei Auswahl/Hervorhebung,
        // bei Zeiger und Tastaturfokus blendet .pl-full die volle Farbe ein
        const full = print || isSel || isHi;
        return (
          <g key={def.id} {...planetA11y(onPlanet, def.id, ps.destroyed ? `${def.name} (${t('zerstört')})` : def.name)} data-planet={def.id}>
            {onPlanet && <circle className="focus-ring" cx={x} cy={y} r={88} fill="none" stroke="#dda94d" strokeWidth={6} />}
            {/* Orbit */}
            <circle cx={x} cy={y} r={78} fill="none" stroke={isHi ? highlightColor : C.orbit} strokeWidth={isHi ? 3 : 1.2} strokeDasharray={isHi ? undefined : '6 6'} opacity={isHi ? 0.95 : 0.6} />
            <circle cx={x} cy={y} r={R + 8} fill="none" stroke={C.orbit} strokeWidth={1} opacity={0.55} />
            {!print && <circle cx={x} cy={y} r={R + 16} fill={`url(#${sid}-halo)`} />}
            {/* Zielringe für den ausgewählten Planeten */}
            {isSel && (
              <g className="target-ring" style={{ transformOrigin: `${x}px ${y}px`, animation: 'target-in 260ms ease-out' }}>
                <circle cx={x} cy={y} r={R + 12} fill="none" stroke={print ? '#000' : '#f3c768'} strokeWidth={3.5} style={print ? undefined : { filter: 'drop-shadow(0 0 6px rgba(243,199,104,0.8))' }} />
                <circle cx={x} cy={y} r={R + 22} fill="none" stroke={print ? '#000' : '#dda94d'} strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray="5 6" />
                {[
                  [90, R + 24, R + 36],
                  [270, R + 24, R + 36],
                  [0, R + 13, R + 17],
                  [180, R + 13, R + 17],
                ].map(([deg, r0, r1]) => {
                  const a = (deg * Math.PI) / 180;
                  return <line key={deg} x1={r2(x + r0 * Math.cos(a))} y1={r2(y + r0 * Math.sin(a))} x2={r2(x + r1 * Math.cos(a))} y2={r2(y + r1 * Math.sin(a))} stroke={print ? '#000' : '#f3c768'} strokeWidth={3} />;
                })}
              </g>
            )}
            {/* Globus */}
            <PlanetArt planetId={def.id} cx={x} cy={y} r={R} destroyed={ps.destroyed} photo={!print} planetImages={planetImages} image={ps.portrait} />
            {/* System rechts unter den Theatres (frei von Raster und Flotten) */}
            <text x={x + FL.sideX - 8} y={y + 62} textAnchor="start" fontSize={fs(15)} fill={C.dim} stroke={print ? undefined : C.halo} strokeWidth={print ? undefined : 3.5} paintOrder="stroke">
              {def.system}
            </text>
            {/* Power Levels */}
            <g transform={`translate(${gx} ${gy})`}>
              <rect
                x={-FL.digitPad}
                y={-8}
                width={gridW + FL.digitPad + 5}
                height={levels.length * (cellH + 3) + 18}
                fill={print ? C.panel : `url(#${sid}-steel)`}
                fillOpacity={print ? 1 : 0.94}
                stroke={C.panelStroke}
                strokeWidth={1.2}
              />
              {levels.map((lvl, row) => (
                <g key={lvl}>
                  <text x={-FL.digitPad / 2 - 1} y={row * (cellH + 3) + cellH / 2 + 6} fontSize={Math.min(fs(17), 22)} fontWeight="bold" textAnchor="middle" fill={print ? C.dim : '#d8cdb2'}>
                    {lvl}
                  </text>
                  {Array.from({ length: cols }, (_, c) => {
                    const a = alliances[c];
                    const v = a ? ps.power[a.id] : undefined;
                    const fl = a ? ps.slots.filter((s) => !s.destroyed && s.infra?.type === 'FORTIFICATION_LINE' && s.infra.allianceId === a.id).length : 0;
                    const min = a ? minPL(state, a.id, def.id) : 0;
                    const filled = a && v === lvl;
                    const hatched = a && fl > 0 && lvl < min && lvl >= 1;
                    return (
                      <g key={c} transform={`translate(${c * (cellW + 3)} ${row * (cellH + 3)})`}>
                        <rect width={cellW} height={cellH} fill={filled ? (full ? a!.color : muted(a!.color, 0.6)) : C.cell} stroke={filled && !print ? '#050807' : C.cellStroke} strokeWidth={0.8} />
                        {filled && !full && <rect className="pl-full" width={cellW} height={cellH} fill={a!.color} stroke="#050807" strokeWidth={0.8} />}
                        {!filled && !print && <rect x={1} y={1} width={cellW - 2} height={1} fill="#e8dfc9" opacity={0.06} />}
                        {filled && !print && <rect width={cellW} height={cellH} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={1} />}
                        {hatched && <rect width={cellW} height={cellH} fill={`url(#${sid}-hatch)`} opacity={0.7} />}
                        {filled && print && (
                          <text x={cellW / 2} y={cellH / 2 + 4.5} textAnchor="middle" fontSize="12" fill="#000" fontWeight="bold">
                            {a!.name.slice(0, 3).toUpperCase()}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
              {/* Allianzfarbe je Spalte */}
              {alliances.map((a, c) => (
                <rect key={a.id} x={c * (cellW + 3)} y={levels.length * (cellH + 3) + 1} width={cellW} height={3} fill={a.color} opacity={0.85} />
              ))}
            </g>
            {/* Infrastructure Locations */}
            <g transform={`translate(${x + FL.sideX} ${y - 44})`}>
              <rect x={-8} y={-20} width={def.slots * 38 + 8} height={40} fill={print ? C.panel : `url(#${sid}-steel)`} fillOpacity={print ? 1 : 0.94} stroke={C.panelStroke} strokeWidth={1.2} />
              {ps.slots.map((s, i) => {
                const al = s.infra ? state.alliances.find((a) => a.id === s.infra!.allianceId) : null;
                return (
                  <g key={i} transform={`translate(${i * 38 + 15} 0)`}>
                    <circle r={16} fill={s.destroyed ? '#3a1512' : al ? al.color : C.slot} stroke={s.destroyed ? '#ec6454' : al ? '#050807' : C.slotStroke} strokeWidth={1.3} />
                    {s.destroyed && <path d="M-9 -9 L9 9 M9 -9 L-9 9" stroke="#ec6454" strokeWidth={2.2} />}
                    {s.infra && <GameIconG name={INFRA_ICON[s.infra.type]} size={24} fill="#16110b" />}
                  </g>
                );
              })}
            </g>
            {/* Theatres */}
            <g transform={`translate(${x + FL.sideX} ${y + 20})`}>
              <rect x={-8} y={-20} width={def.theatres.length * 36 + 8} height={40} fill={print ? C.panel : `url(#${sid}-steel)`} fillOpacity={print ? 1 : 0.94} stroke={C.panelStroke} strokeWidth={1.2} />
              {def.theatres.map((th, i) => (
                <g key={th} transform={`translate(${i * 36 + 14} 0)`}>
                  <TheatreGlyph id={th} r={15} />
                </g>
              ))}
            </g>
            {/* Flotten im Orbit */}
            {fleets.map((f, i) => {
              const al = state.alliances.find((a) => a.id === f.allianceId);
              const ang = Math.PI / 2 + (i - (fleets.length - 1) / 2) * 0.32;
              const fx = Math.round((x + Math.cos(ang) * 80) * 100) / 100;
              const fy = Math.round((y + Math.sin(ang) * 80) * 100) / 100;
              const num = state.fleets.filter((g) => g.allianceId === f.allianceId).findIndex((g) => g.id === f.id) + 1;
              return (
                <g key={f.id} transform={`translate(${fx} ${fy})`}>
                  <title>{f.name}</title>
                  <circle r={13} fill={print ? '#fff' : '#0a0e0d'} stroke={al?.color ?? '#fff'} strokeWidth={1.8} />
                  <GameIconG name="ui_FLEET" size={20} fill={print ? '#000' : (al?.color ?? '#fff')} />
                  <text y={29} textAnchor="middle" fontSize={fs(15)} fontWeight="bold" fill={C.text} stroke={print ? undefined : C.halo} strokeWidth={print ? undefined : 3} paintOrder="stroke">
                    {num}
                  </text>
                </g>
              );
            })}
            {ps.destroyed && (
              <g transform={`translate(${x} ${y})`}>
                <circle r={60} fill="#ec6454" opacity={0.12} />
                <text
                  textAnchor="middle"
                  y={-26}
                  fontSize="16"
                  fill={print ? '#000' : '#ec6454'}
                  fontWeight="bold"
                  transform="rotate(-12)"
                  stroke={print ? undefined : C.halo}
                  strokeWidth={print ? undefined : 3}
                  paintOrder="stroke"
                >
                  {t('zerstört')}
                </text>
              </g>
            )}
            {/* Klickfläche */}
            {onPlanet && <circle cx={x} cy={y} r={80} fill="transparent" />}
          </g>
        );
      })}

      {/* Routenschilder über den Datenblöcken, aber auf freien Stellen (weichen Rastern, Symbolgruppen, Systemnamen,
          Schildern und einander aus); abgeschwächte Operationen ohne Schild */}
      <g pointerEvents="none">
        {plaques.map((q) => (
          <RoutePlaque key={q.i} x={q.x} y={q.y} w={q.w} h={plaqueH} f={plaqueF} color={q.color} label={q.label} sw={1.4} print={print} />
        ))}
      </g>

      {/* Namensschilder zuletzt: Routen und Pfeile laufen unter den Schildern hindurch */}
      <g aria-hidden>
        {map.planets.map((def) => {
          const ps = state.planets.find((x) => x.id === def.id)!;
          const { x, y } = pos(def.id);
          const isSel = selected === def.id;
          const pw = plateWidth(def.name, FL.plateF);
          const ph = FL.plateH / 2;
          return (
            <g key={def.id} onClick={onPlanet ? () => onPlanet(def.id) : undefined} style={onPlanet ? { cursor: 'pointer' } : undefined}>
              <g transform={`translate(${x} ${y + FL.plateY})`}>
                <path
                  d={`M${-pw / 2 + 10} ${-ph} H${pw / 2 - 10} L${pw / 2} 0 L${pw / 2 - 10} ${ph} H${-pw / 2 + 10} L${-pw / 2} 0 Z`}
                  fill={C.plate}
                  stroke={isSel ? (print ? '#000' : '#f3c768') : C.plateStroke}
                  strokeWidth={isSel ? 2.5 : 1.2}
                  style={isSel && !print ? { filter: 'drop-shadow(0 0 6px rgba(243,199,104,0.7))' } : undefined}
                />
                {!print && (
                  <>
                    <path d={`M${-pw / 2 + 11} ${-ph + 2} H${pw / 2 - 11}`} stroke="#fff3cf" strokeOpacity={0.55} strokeWidth={1} />
                    <circle cx={-pw / 2 + 14} cy={0} r={3} fill="#f3e2b4" stroke="#3a2c14" strokeWidth={0.8} />
                    <circle cx={pw / 2 - 14} cy={0} r={3} fill="#f3e2b4" stroke="#3a2c14" strokeWidth={0.8} />
                  </>
                )}
                <text textAnchor="middle" y={FL.plateF * 0.36} fontSize={FL.plateF} fill={ps.destroyed && !print ? '#5a1a14' : C.plateText} fontWeight="bold" letterSpacing="0.5" style={cinzel}>
                  {def.name}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Deckkraft abgeschwächter Routen */
const DIM = 0.22;
/** Pfeile mit ursprünglichem Index (für stabile Versätze), abgeschwächte zuerst */
const byFocus = (arrows: MapArrow[]) => arrows.map((a, i) => [a, i] as const).sort(([a], [b]) => Number(!!b.dim) - Number(!!a.dim));

export type Box = { x0: number; y0: number; x1: number; y1: number };
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
export type LabelSpot = { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
export interface LabelInput {
  id: string;
  x: number;
  y: number;
  name: string;
  /** belegte Flächen dieses Planeten (Globus/Ring, PL-Zahlen, Infrastruktur, Flotten) */
  marks: Box[];
  /** Grundlinie über dem Globus */
  top: number;
  /** Grundlinie unter den PL-Zahlen */
  bottom: number;
  /** Beginn rechts neben der Infrastruktur */
  right: number;
  /** Ende links neben den Flotten */
  left: number;
}

/** Fläche eines Namens der Übersicht (Grundlinie `s.y`, Breite `w`, Schriftgröße `f`) */
export function labelBox(s: LabelSpot, w: number, f: number): Box {
  const x0 = s.anchor === 'middle' ? s.x - w / 2 : s.anchor === 'start' ? s.x : s.x - w;
  return { x0, x1: x0 + w, y0: s.y - f * 0.8, y1: s.y + f * 0.22 };
}

/**
 * Einfache Kollisionsvermeidung für Planetennamen der Übersicht: je Planet werden einige Lagen probiert
 * (über dem Globus mittig, nach rechts/links versetzt, höher, rechts, links, unter den PL-Zahlen). Gewählt wird die
 * Lage mit der geringsten Überdeckung von Marken aller Planeten, bereits gesetzten Namen und dem Kartenrand;
 * eine kleine Strafe je Rang sorgt dafür, dass ohne Konflikt die Standardlage gewinnt.
 */
export function placeLabels(planets: LabelInput[], nameF: number, W: number, H: number): Record<string, LabelSpot> {
  // Marken der Nachbarn mit etwas Luft, damit Namen nicht knapp an deren Zahlen oder Ringen kleben;
  // der eigene Ring zählt nicht (die Lagen sind um ihn herum gebaut)
  const pad = nameF * 0.25;
  const marks = planets.flatMap((p) => p.marks.map((b, k) => ({ id: p.id, own: k === 0, b, g: { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad } })));
  const placed: Box[] = [];
  const out: Record<string, LabelSpot> = {};
  const boxOf = (s: LabelSpot, w: number) => labelBox(s, w, nameF);
  for (const p of planets) {
    const w = p.name.length * nameF * 0.66;
    const mid = p.y + nameF * 0.3;
    const cands: LabelSpot[] = [
      { x: p.x, y: p.top, anchor: 'middle' },
      { x: p.x + w * 0.3, y: p.top, anchor: 'middle' },
      { x: p.x - w * 0.3, y: p.top, anchor: 'middle' },
      { x: p.x, y: p.top - nameF * 0.6, anchor: 'middle' },
      { x: p.right, y: mid, anchor: 'start' },
      { x: p.left, y: mid, anchor: 'end' },
      { x: p.x, y: p.bottom, anchor: 'middle' },
      // Schräglagen für dichte Karten (Handy): oben/unten seitlich neben dem Globus
      { x: p.right, y: p.top + nameF * 0.4, anchor: 'start' },
      { x: p.left, y: p.top + nameF * 0.4, anchor: 'end' },
      { x: p.right, y: p.bottom - nameF * 0.2, anchor: 'start' },
      { x: p.left, y: p.bottom - nameF * 0.2, anchor: 'end' },
      { x: p.x, y: p.bottom + nameF * 0.7, anchor: 'middle' },
    ];
    let best = cands[0];
    let bestCost = Infinity;
    cands.forEach((c, k) => {
      const b = boxOf(c, w);
      let cost = k * w * nameF * 0.02;
      for (const m of marks)
        if (m.id !== p.id) cost += overlap(b, m.g);
        else if (!m.own) cost += overlap(b, m.b);
      // übereinanderliegende Namen sind unlesbar: deutlich teurer als eine berührte Marke
      for (const q of placed) cost += overlap(b, q) * 6;
      cost += (Math.max(0, -b.x0) + Math.max(0, b.x1 - W)) * nameF * 2 + (Math.max(0, -b.y0) + Math.max(0, b.y1 - H)) * w * 2;
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    });
    const pb = boxOf(best, w);
    placed.push({ x0: pb.x0 - pad * 1.5, y0: pb.y0 - pad * 1.5, x1: pb.x1 + pad * 1.5, y1: pb.y1 + pad * 1.5 });
    out[p.id] = best;
  }
  return out;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Grenzen des Seitenverhältnisses (Höhe/Breite) der Übersicht */
const ASPECT_MIN = 0.45;
const ASPECT_MAX = 2.4;

/**
 * Abmessungen der Übersichtskarte je nach Ausrichtung. `aspect` (Höhe/Breite der Anzeigefläche) passt die Höhe der
 * Zeichenfläche an die Anzeige an, damit das Planetennetz die verfügbare Höhe nutzt, statt mittig zu schweben.
 */
export function compactSize(portrait: boolean, aspect?: number) {
  const w = portrait ? MAP_H : MAP_W;
  const h = portrait ? MAP_W : MAP_H;
  if (!aspect || !Number.isFinite(aspect)) return { w, h };
  return { w, h: Math.round(w * clampN(aspect, ASPECT_MIN, ASPECT_MAX)) };
}

/** Ausdehnung der Planetenmarken samt Namen um den Mittelpunkt (links, rechts, oben, unten) in Karteneinheiten */
export type Extent = { l: number; r: number; t: number; b: number };
/** Freizuhaltende Ecke der Zeichenfläche (Breite/Höhe in der Einheit des Aufrufers) */
export type Reserve = { corner: 'tl' | 'tr' | 'bl' | 'br'; w: number; h: number };

/**
 * Einpassung der Übersicht: Weltkoordinaten (Prozent der Karte; im Hochformat im Uhrzeigersinn gedreht) werden je
 * Achse linear so skaliert, dass alle Planeten samt Namen, Ringen, Zahlen und Flotten in die Fläche W×H passen und
 * sie möglichst ganz ausfüllen. Reihenfolge und Orientierung bleiben erhalten; die Streckung einer Achse gegenüber der
 * anderen ist auf `maxStretch` begrenzt, damit das Netz nicht verzerrt wirkt.
 */
export function compactLayout(planets: { id: string; x: number; y: number }[], portrait: boolean, W: number, H: number, ext: (id: string) => Extent, maxStretch = 1.5, pad = 12, reserve: Reserve[] = []) {
  const raw = planets.map((p) => ({ id: p.id, ...(portrait ? { x: ((100 - p.y) / 100) * MAP_H, y: (p.x / 100) * MAP_W } : { x: (p.x / 100) * MAP_W, y: (p.y / 100) * MAP_H }), e: ext(p.id) }));
  // größtmöglicher Maßstab einer Achse: jedes Paar (vorn/hinten) muss samt Ausdehnung in die Fläche passen
  const scaleOf = (v: number[], lo: number[], hi: number[], size: number) => {
    let s = Infinity;
    for (let i = 0; i < v.length; i++) for (let j = 0; j < v.length; j++) if (v[j] > v[i]) s = Math.min(s, (size - 2 * pad - lo[i] - hi[j]) / (v[j] - v[i]));
    return s;
  };
  // Versatz: Mitte des zulässigen Bereichs, damit freie Ränder gleich verteilt sind
  const offsetOf = (v: number[], lo: number[], hi: number[], size: number, s: number) => {
    let a = -Infinity;
    let b = Infinity;
    for (let i = 0; i < v.length; i++) {
      a = Math.max(a, pad + lo[i] - s * v[i]);
      b = Math.min(b, size - pad - hi[i] - s * v[i]);
    }
    return (a + b) / 2;
  };
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const L = raw.map((p) => p.e.l);
  const R = raw.map((p) => p.e.r);
  const T = raw.map((p) => p.e.t);
  const B = raw.map((p) => p.e.b);
  let sx = scaleOf(xs, L, R, W);
  let sy = scaleOf(ys, T, B, H);
  if (!Number.isFinite(sx) && !Number.isFinite(sy)) sx = sy = 1;
  else if (!Number.isFinite(sx)) sx = sy;
  else if (!Number.isFinite(sy)) sy = sx;
  sx = Math.max(0.05, Math.min(sx, sy * maxStretch));
  sy = Math.max(0.05, Math.min(sy, sx * maxStretch));
  const ox = raw.length ? offsetOf(xs, L, R, W, sx) : 0;
  // Freizuhaltende Ecken: Planeten, deren waagrechte Ausdehnung in eine Ecke reicht, halten dort zusätzlich deren Höhe frei
  if (reserve.length) {
    raw.forEach((p, i) => {
      const x = ox + p.x * sx;
      for (const c of reserve) {
        const left = c.corner[1] === 'l';
        const hit = left ? x - L[i] < c.w : x + R[i] > W - c.w;
        if (!hit) continue;
        if (c.corner[0] === 't') T[i] += c.h;
        else B[i] += c.h;
      }
    });
    const sy2 = scaleOf(ys, T, B, H);
    if (Number.isFinite(sy2)) sy = Math.max(0.05, Math.min(sy, sy2));
  }
  const oy = raw.length ? offsetOf(ys, T, B, H, sy) : 0;
  return new Map(raw.map((p) => [p.id, { x: ox + p.x * sx, y: oy + p.y * sy }]));
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = { x: r2(cx + r * Math.cos(a0)), y: r2(cy + r * Math.sin(a0)) };
  const p1 = { x: r2(cx + r * Math.cos(a1)), y: r2(cy + r * Math.sin(a1)) };
  return `M${p0.x} ${p0.y} A${r2(r)} ${r2(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p1.x} ${p1.y}`;
}

const inBox = (x: number, y: number, b: Box, m: number) => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m;

/**
 * Übersichtskarte: große Namen, Power Level als Zahlen, Machtring je Allianz.
 * Alle Größen richten sich nach `unit` (Karteneinheiten je Bildschirmpixel), damit die Karte ohne Zoomen lesbar
 * bleibt; Schriften halten eine Mindestgröße auf dem Bildschirm. Zeichenreihenfolge: Netz, Planeten, Operationen,
 * zuletzt die Namen mit dunkler Kontur – so laufen Routen nie über Planetennamen.
 */
/** Einfache Flottensilhouette (kräftige Pfeilspitze, Einheitsgröße um 0/0): bleibt in kleinen Kartenmarken (~15 px) lesbar */
export const FLEET_WEDGE = 'M0 -0.47 L0.4 0.45 L0 0.23 L-0.4 0.45 Z';

/** Flottenzeichen: ab etwa 24 Bildschirm-px das feine Schiffssymbol, darunter die Pfeilspitze */
function FleetMark({ size, fill, simple }: { size: number; fill: string; simple: boolean }) {
  if (!simple) return <GameIconG name="ui_FLEET" size={size} fill={fill} />;
  return <path d={FLEET_WEDGE} transform={`scale(${r2(size)})`} fill={fill} />;
}

function CompactMap({
  state,
  selected,
  highlight = [],
  highlightColor = '#dda94d',
  arrows = [],
  heat,
  onPlanet,
  viewBox,
  className,
  title,
  unit = 1.7,
  portrait = false,
  aspect,
  preserveAspectRatio,
  fleetMotion = [],
  locale,
  planetImages,
  dense = true,
  markerScale = 1,
  reserve,
}: MapSvgProps) {
  const t = makeT(locale ?? DEFAULT_LOCALE);
  const sid = svgId('compact');
  const moving = new Set(fleetMotion.map((m) => m.fleetId));
  const u = unit;
  const { w: W, h: H } = compactSize(portrait, aspect);
  const map: MapDef = mapOf(state);
  const alliances = [...state.alliances].sort((a, b) => a.order - b.order);
  // Hochformat (Handy): Karte dichter, daher kleinere Obergrenzen
  const pf = (portrait ? 0.8 : 1) * markerScale;
  // Mindestgröße auf dem Bildschirm (px) nach der SVG-Skalierung – gilt auch, wenn die Obergrenze greift
  const minPx = (v: number, px: number) => Math.max(v, px * u);
  const nameF = minPx(clampN(15 * u, 22, 50 * pf), 12.5);
  const globeR = clampN(18.5 * u, 30, 56 * pf);
  const ringW = clampN(3.2 * u, 4, 12 * pf);
  const ringR = globeR + ringW / 2 + clampN(2 * u, 3, 7);
  const chipF = minPx(clampN(13 * u, 18, 34 * pf), 12);
  const chipH = Math.max(clampN(16 * u, 24, 42 * pf), chipF * 1.25);
  const chipW = chipH * 1.2;
  const chipGap = clampN(2 * u, 3, 6);
  const slotR = clampN(6 * u, 9, 17 * pf);
  // Flottenmarken: Kreis ≈ 1,24 × fleetS – im Hochformat (Handy) mindestens etwa 15 sichtbare Pixel
  const fleetS = minPx(clampN(10 * u, 16, 30 * pf), portrait ? 12.5 : 10);
  // Kleine Flottenmarken (Handy, Zeitraffer): einfache Silhouette statt des fein gezeichneten Symbols
  const fleetSimple = fleetS / u < 24;
  // Operationsnamen: mindestens 13,5 Bildschirm-px (lesepflichtig wie die Planetennamen)
  const lf = minPx(clampN(10 * u, 15, 30), 13.5);
  const sw = clampN(2.2 * u, 3, 8);
  const maxHeat = heat ? Math.max(1, ...Object.values(heat)) : 1;
  const line = '#4f8a78';
  const chipsW = alliances.length * chipW + (alliances.length - 1) * chipGap;
  const chipsDy = ringR + ringW / 2 + clampN(4 * u, 6, 14);
  const outerR = ringR + ringW + 5;
  const selR = ringR + ringW + 9;
  const nameW = (name: string) => name.length * nameF * 0.66;

  // Einpassung: Ausdehnung je Planet unabhängig vom Spielstand (stabile Lage über alle Stände des Zeitraffers)
  const layout = compactLayout(
    map.planets,
    portrait,
    W,
    H,
    (id) => {
      const nw = nameW(map.planets.find((p) => p.id === id)?.name ?? '') / 2;
      return {
        l: Math.max(nw, outerR + fleetS * 1.3),
        r: Math.max(nw, outerR + (dense ? slotR * 2 + 6 : 0)),
        t: ringR + ringW + nameF * 1.1,
        b: dense ? chipsDy + chipH + 6 : outerR + 6,
      };
    },
    1.5,
    12,
    // Ecken in Bildschirmpixeln → Karteneinheiten
    (reserve ?? []).map((c) => ({ ...c, w: c.w * u, h: c.h * u })),
  );
  const cp = (id: string) => layout.get(id) ?? { x: W / 2, y: H / 2 };

  // Namen: Lage je Planet anhand der Nachbarmarken wählen (einfache Kollisionsvermeidung)
  const labels = placeLabels(
    map.planets.map((def): LabelInput => {
      const ps = state.planets.find((x) => x.id === def.id)!;
      const { x, y } = cp(def.id);
      const detail = dense || selected === def.id;
      // Auswahlring (stark) liegt außerhalb des Machtrings – der Name hält davon Abstand
      const ring = selected === def.id ? selR + nameF * 0.1 : ringR + ringW;
      const nFleets = state.fleets.filter((f) => f.planetId === def.id && !moving.has(f.id)).length;
      const slotsH = (ps.slots.length - 1) * (slotR * 2 + 3) + slotR * 2;
      const fleetsH = nFleets ? (nFleets - 1) * (fleetS + 4) + fleetS * 1.24 : 0;
      const fx = x - ringR - ringW - fleetS * 0.75;
      const sx = x + ringR + ringW + 4;
      const marks: Box[] = [{ x0: x - outerR, y0: y - outerR, x1: x + outerR, y1: y + outerR }];
      if (detail && !ps.destroyed) marks.push({ x0: x - chipsW / 2, y0: y + chipsDy, x1: x + chipsW / 2, y1: y + chipsDy + chipH });
      if (detail) marks.push({ x0: sx, y0: y - slotsH / 2, x1: sx + slotR * 2, y1: y + slotsH / 2 });
      if (nFleets) marks.push({ x0: fx - fleetS * 0.62, y0: y - fleetsH / 2, x1: fx + fleetS * 0.62, y1: y + fleetsH / 2 });
      return {
        id: def.id,
        x,
        y,
        name: def.name,
        marks,
        top: y - ring - nameF * 0.35,
        bottom: y + (detail && !ps.destroyed ? chipsDy + chipH : outerR) + nameF * 0.95,
        right: (detail ? sx + slotR * 2 : x + outerR) + nameF * 0.4,
        left: (nFleets ? fx - fleetS * 0.62 : x - outerR) - nameF * 0.4,
      };
    }),
    nameF,
    W,
    H,
  );
  // belegte Namensflächen: Routen enden davor, Routenschilder weichen aus
  const nameBoxes = map.planets.map((def) => labelBox(labels[def.id], nameW(def.name), nameF));
  const clear = (x: number, y: number, m: number) => !nameBoxes.some((b) => inBox(x, y, b, m));
  // Volle Allianzfarbe am Ring nur bei Auswahl, Hervorhebung oder fokussierter Operation; sonst gedeckt
  const focusOps = arrows.some((a) => a.dim);
  const hot = new Set(focusOps ? arrows.filter((a) => !a.dim).flatMap((a) => [a.from, a.to]) : []);
  // Routenschilder: ohne Fokus (keine gedimmte Route) gilt die Übersicht – auf schmalen Schirmen ausgeblendet
  const overviewPlaques = !focusOps;
  const globeBoxes: Box[] = map.planets.map((def) => {
    const p = cp(def.id);
    return { x0: p.x - outerR, y0: p.y - outerR, x1: p.x + outerR, y1: p.y + outerR };
  });
  const plaques: Box[] = [];
  // Trefferfläche je Planet: höchstens halber Abstand zum nächsten Nachbarn (keine überlappenden Tippflächen)
  const hitR = (id: string) => {
    const p = cp(id);
    const near = Math.min(...map.planets.filter((d) => d.id !== id).map((d) => Math.hypot(cp(d.id).x - p.x, cp(d.id).y - p.y)));
    // mindestens 44 Bildschirm-px Durchmesser (u Karteneinheiten je px), auch wenn sich Flächen dann berühren
    return Math.max(outerR, 23 * u, Math.min(Math.max(ringR + 40, 110), near / 2));
  };

  return (
    <svg
      viewBox={viewBox ?? `0 0 ${W} ${H}`}
      preserveAspectRatio={preserveAspectRatio}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={onPlanet ? 'group' : 'img'}
      aria-label={title ?? t('Kampagnenkarte {name}', { name: state.meta.name })}
      style={{ fontFamily: 'var(--font-body), sans-serif' }}
    >
      <defs>
        <marker id={`${sid}-arrowhead`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
        </marker>
        <radialGradient id={`${sid}-glow`}>
          <stop offset="0%" stopColor="#ec6454" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ec6454" stopOpacity="0" />
        </radialGradient>
      </defs>
      {map.background && <rect width={W} height={H} fill={map.background} />}

      <g stroke={line} strokeWidth={r2(clampN(1.1 * u, 1.4, 3.5))} strokeDasharray={`${r2(4 * u)} ${r2(5 * u)}`} opacity={0.7}>
        {map.connections.map(([a, b]) => {
          const p = cp(a);
          const q = cp(b);
          return <line key={`${a}-${b}`} x1={r2(p.x)} y1={r2(p.y)} x2={r2(q.x)} y2={r2(q.y)} />;
        })}
      </g>

      {heat &&
        Object.entries(heat).map(([id, n]) => {
          const p = cp(id);
          return n > 0 ? <circle key={id} cx={r2(p.x)} cy={r2(p.y)} r={r2(globeR * 2 + (n / maxHeat) * globeR * 2.5)} fill={`url(#${sid}-glow)`} /> : null;
        })}

      {map.planets.map((def) => {
        const ps = state.planets.find((x) => x.id === def.id)!;
        const { x: rx, y: ry } = cp(def.id);
        const x = r2(rx);
        const y = r2(ry);
        const isSel = selected === def.id;
        const isHi = highlight.includes(def.id);
        const full = isSel || isHi || hot.has(def.id);
        const fleets = state.fleets.filter((f) => f.planetId === def.id && !moving.has(f.id));
        const n = Math.max(1, alliances.length);
        const seg = (Math.PI * 2) / n;
        const gap = n > 1 ? 0.18 : 0;
        const chipsY = y + chipsDy;
        const detail = dense || isSel;
        const lab = labels[def.id];
        // Seite des Namens: dort entfällt die Zielmarke des Auswahlrings
        const labelDeg = lab.anchor === 'middle' ? (lab.y < y ? 270 : 90) : lab.anchor === 'start' ? 0 : 180;
        return (
          <g key={def.id} {...planetA11y(onPlanet, def.id, ps.destroyed ? `${def.name} (${t('zerstört')})` : def.name)} data-planet={def.id}>
            {onPlanet && <circle className="focus-ring" cx={x} cy={y} r={r2(ringR + ringW + 26)} fill="none" stroke="#dda94d" strokeWidth={r2(clampN(2.6 * u, 4, 9))} />}
            {/* Ortungsring um jeden Planeten */}
            <circle cx={x} cy={y} r={r2(ringR + ringW + 5)} fill="none" stroke="#4f8a78" strokeOpacity={0.45} strokeWidth={r2(clampN(0.7 * u, 1, 2))} />
            {isHi && !isSel && <circle cx={x} cy={y} r={r2(ringR + ringW + 10)} fill="none" stroke={highlightColor} strokeWidth={r2(clampN(1.4 * u, 2, 5))} strokeDasharray={`${r2(4 * u)} ${r2(3 * u)}`} />}
            {/* Zielringe für den ausgewählten Planeten (ohne Marke auf der Namensseite) */}
            {isSel && (
              <g className="target-ring" style={{ transformOrigin: `${x}px ${y}px`, animation: 'target-in 260ms ease-out' }}>
                <circle cx={x} cy={y} r={r2(selR)} fill="none" stroke="#f3c768" strokeWidth={r2(clampN(1.8 * u, 2.5, 6))} style={{ filter: 'drop-shadow(0 0 6px rgba(243,199,104,0.8))' }} />
                <circle cx={x} cy={y} r={r2(ringR + ringW + 18)} fill="none" stroke="#dda94d" strokeOpacity={0.7} strokeWidth={r2(clampN(0.8 * u, 1, 3))} strokeDasharray={`${r2(3 * u)} ${r2(4 * u)}`} />
                {[0, 90, 180, 270]
                  .filter((deg) => deg !== labelDeg)
                  .map((deg) => {
                    const a = (deg * Math.PI) / 180;
                    const r0 = ringR + ringW + 20;
                    const r1 = r0 + clampN(8 * u, 10, 22);
                    return (
                      <line key={deg} x1={r2(x + r0 * Math.cos(a))} y1={r2(y + r0 * Math.sin(a))} x2={r2(x + r1 * Math.cos(a))} y2={r2(y + r1 * Math.sin(a))} stroke="#f3c768" strokeWidth={r2(clampN(1.4 * u, 2, 5))} />
                    );
                  })}
              </g>
            )}
            <PlanetArt planetId={def.id} cx={x} cy={y} r={r2(globeR)} destroyed={ps.destroyed} planetImages={planetImages} image={ps.portrait} />
            {/* Machtring: je Allianz ein Bogen, Dicke nach Power Level; gedeckt, volle Farbe nur bei Hervorhebung */}
            {!ps.destroyed &&
              alliances.map((a, i) => {
                const pl = ps.power[a.id] ?? 0;
                const a0 = -Math.PI / 2 + i * seg + gap / 2;
                const a1 = a0 + seg - gap;
                return (
                  <path
                    key={a.id}
                    d={arcPath(x, y, ringR, a0, a1)}
                    fill="none"
                    stroke={full ? a.color : muted(a.color, 0.6)}
                    strokeWidth={r2(pl === 0 ? ringW * 0.22 : ringW * (full ? 0.35 + pl * 0.16 : 0.28 + pl * 0.12))}
                    strokeLinecap="round"
                    opacity={pl === 0 ? 0.3 : full ? 1 : 0.92}
                  />
                );
              })}
            {ps.destroyed && (
              <path
                d={`M${x - globeR} ${y - globeR} L${x + globeR} ${y + globeR} M${x + globeR} ${y - globeR} L${x - globeR} ${y + globeR}`}
                stroke="#ec6454"
                strokeWidth={r2(ringW * 0.8)}
                strokeLinecap="round"
                opacity={0.85}
              />
            )}
            {/* Power Level als Zahlen: dunkle Plaketten, Allianzfarbe nur als schmale Markierung unten */}
            {!ps.destroyed && detail && (
              <g transform={`translate(${r2(x - chipsW / 2)} ${r2(chipsY)})`}>
                {alliances.map((a, i) => {
                  const pl = Math.round(ps.power[a.id] ?? 0);
                  const mark = r2(Math.max(2, chipH * 0.14));
                  return (
                    <g key={a.id} transform={`translate(${r2(i * (chipW + chipGap))} 0)`}>
                      <title>{`${a.name}: ${pl}`}</title>
                      <rect width={r2(chipW)} height={r2(chipH)} rx={r2(chipH * 0.08)} fill="#0c100f" fillOpacity={0.94} stroke="#665333" strokeWidth={r2(clampN(0.7 * u, 1, 2))} />
                      <rect x={r2(chipW * 0.12)} y={r2(chipH - mark - chipH * 0.08)} width={r2(chipW * 0.76)} height={mark} fill={a.color} opacity={pl > 0 ? 0.85 : 0.3} />
                      <text
                        x={r2(chipW / 2)}
                        y={r2(chipH / 2 + chipF * 0.3)}
                        textAnchor="middle"
                        fontSize={r2(chipF)}
                        fontWeight={700}
                        fill={pl > 0 ? '#efe4c8' : '#8a846f'}
                        style={{ fontFamily: 'var(--font-techmono), monospace' }}
                      >
                        {pl}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
            {/* Infrastruktur rechts vom Globus */}
            {detail && (
              <g transform={`translate(${r2(x + ringR + ringW + slotR + 4)} ${r2(y - ((ps.slots.length - 1) * (slotR * 2 + 3)) / 2)})`}>
                {ps.slots.map((s, i) => {
                  const al = s.infra ? state.alliances.find((a) => a.id === s.infra!.allianceId) : null;
                  return (
                    <g key={i} transform={`translate(0 ${r2(i * (slotR * 2 + 3))})`}>
                      <title>{s.destroyed ? t('zerstört') : s.infra ? `${s.infra.type} · ${al?.name ?? ''}` : t('frei')}</title>
                      <circle
                        r={r2(slotR)}
                        fill={s.destroyed ? '#3a1512' : '#0b1110'}
                        stroke={s.destroyed ? '#e2685c' : al ? al.color : '#665333'}
                        strokeWidth={r2(clampN((al ? 1.1 : 0.8) * u, 1.2, 2.8))}
                        strokeOpacity={al ? 0.95 : 0.8}
                      />
                      {s.destroyed && (
                        <path d={`M${-slotR * 0.5} ${-slotR * 0.5} L${slotR * 0.5} ${slotR * 0.5} M${slotR * 0.5} ${-slotR * 0.5} L${-slotR * 0.5} ${slotR * 0.5}`} stroke="#ec6454" strokeWidth={r2(slotR * 0.2)} />
                      )}
                      {s.infra && slotR >= 10 && <GameIconG name={INFRA_ICON[s.infra.type]} size={r2(slotR * 1.3)} fill={al?.color ?? '#b3975f'} />}
                      {s.infra && slotR < 10 && <circle r={r2(slotR * 0.45)} fill={al?.color ?? '#b3975f'} />}
                    </g>
                  );
                })}
              </g>
            )}
            {/* Flotten links vom Globus */}
            <g transform={`translate(${r2(x - ringR - ringW - fleetS * 0.75)} ${r2(y - ((fleets.length - 1) * (fleetS + 4)) / 2)})`}>
              {fleets.map((f, i) => {
                const al = state.alliances.find((a) => a.id === f.allianceId);
                return (
                  <g key={f.id} transform={`translate(0 ${r2(i * (fleetS + 4))})`}>
                    <title>{f.name}</title>
                    <circle r={r2(fleetS * 0.62)} fill="#0a0806" stroke={al?.color ?? '#fff'} strokeWidth={r2(clampN(0.8 * u, 1, 2.5))} />
                    <FleetMark size={r2(fleetSimple ? fleetS * 1.05 : fleetS * 0.9)} fill={al?.color ?? '#fff'} simple={fleetSimple} />
                  </g>
                );
              })}
            </g>
            {onPlanet && <circle cx={x} cy={y} r={r2(hitR(def.id))} fill="transparent" />}
          </g>
        );
      })}

      {fleetMotion.map((m) => {
        const f = state.fleets.find((x) => x.id === m.fleetId);
        const al = state.alliances.find((a) => a.id === f?.allianceId);
        const p = cp(m.from);
        const q = cp(m.to);
        const e = m.t < 0.5 ? 2 * m.t * m.t : 1 - (-2 * m.t + 2) ** 2 / 2;
        return (
          <g key={m.fleetId} transform={`translate(${r2(p.x + (q.x - p.x) * e)} ${r2(p.y + (q.y - p.y) * e)})`}>
            <circle r={r2(fleetS * 0.7)} fill="#0a0806" stroke={al?.color ?? '#fff'} strokeWidth={r2(clampN(0.8 * u, 1, 2.5))} />
            <FleetMark size={r2(fleetSimple ? fleetS * 1.15 : fleetS)} fill={al?.color ?? '#fff'} simple={fleetSimple} />
          </g>
        );
      })}

      {/* Operationen: unter den Namen; Endpunkte außerhalb der Namensflächen, Schilder weichen Namen aus */}
      {byFocus(arrows).map(([a, i]) => {
        const p = cp(a.from);
        const q = cp(a.to);
        if (a.from === a.to) {
          return (
            <circle
              key={i}
              opacity={a.dim ? DIM : undefined}
              pointerEvents="none"
              cx={r2(p.x)}
              cy={r2(p.y)}
              r={r2(ringR + ringW + 14 + (i % 3) * sw * 2)}
              fill="none"
              stroke={a.color}
              strokeWidth={r2(sw)}
              strokeDasharray={a.dashed ? `${r2(sw * 2)} ${r2(sw * 1.5)}` : undefined}
            />
          );
        }
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const off = ((i % 3) - 1) * sw * 2.5;
        // Pfeile beginnen und enden außerhalb der Planetenmarken (Ring, Infrastruktur, Flotten) …
        const pad = Math.min(len * 0.3, ringR + ringW + Math.max(slotR * 2, fleetS) + 8);
        const bx = p.x + ux * pad - uy * off;
        const by = p.y + uy * pad + ux * off;
        const cx = q.x - ux * (pad + sw) - uy * off;
        const cy = q.y - uy * (pad + sw) + ux * off;
        // … und außerhalb der Namensflächen (die Pfeilspitze ragt etwa 1,5 Strichbreiten über den Endpunkt)
        const room = Math.max(0, (len - 2 * pad - sw * 8) / 2);
        let ts = 0;
        while (ts < room && !clear(bx + ux * ts, by + uy * ts, sw)) ts += sw;
        let te = 0;
        while (te < room && !clear(cx - ux * te, cy - uy * te, sw * 2)) te += sw;
        const sx = r2(bx + ux * ts);
        const sy = r2(by + uy * ts);
        const ex = r2(cx - ux * te);
        const ey = r2(cy - uy * te);
        const label = a.label ? t(a.label) : '';
        // Beschriftung auf dem freien Mittelstück, dunkel hinterlegt; bei Überdeckung eines Namens entlang der Route verschoben
        const lw = r2(label.length * lf * 0.52 + lf * 1.1);
        const lh = r2(lf * 1.45);
        const spotAt = (k: number) => ({ x: sx + (ex - sx) * k, y: sy + (ey - sy) * k });
        const boxAt = (k: number) => {
          const c = spotAt(k);
          return { x0: c.x - lw / 2, x1: c.x + lw / 2, y0: c.y - lh / 2, y1: c.y + lh / 2 };
        };
        // frei von Namen, Globen und bereits gesetzten Routenschildern (sonst liegen Schilder übereinander)
        const free = (k: number) => {
          const b = boxAt(k);
          return nameBoxes.every((n) => overlap(b, n) === 0) && globeBoxes.every((n) => overlap(b, n) === 0) && plaques.every((n) => overlap(b, n) === 0);
        };
        const k = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75].find(free) ?? [0.5, 0.4, 0.6].find((v) => plaques.every((n) => overlap(boxAt(v), n) === 0)) ?? 0.5;
        const spot = spotAt(k);
        if (label && !a.dim) plaques.push(boxAt(k));
        const lx = r2(spot.x);
        const ly = r2(spot.y);
        // Pfeile fangen keine Klicks ab – darunterliegende Planeten bleiben wählbar
        return (
          <g key={i} opacity={a.dim ? DIM : undefined} pointerEvents="none">
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#050807" strokeWidth={r2(sw + 3)} opacity={0.6} strokeLinecap="round" />
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={a.color} strokeWidth={r2(sw)} markerEnd={`url(#${sid}-arrowhead)`} strokeDasharray={a.dashed ? `${r2(sw * 3)} ${r2(sw * 2)}` : undefined} opacity={0.95} />
            {/* Übersicht ohne Auswahl: Schilder erst ab 1440 px Breite (globals.css, Block „UI/UX und Barrierefreiheit“) – sonst nur die des gewählten Planeten */}
            {label && !a.dim && (
              <g className={overviewPlaques ? 'route-plaque route-overview' : 'route-plaque'}>
                <RoutePlaque x={lx} y={ly} w={lw} h={lh} f={lf} color={a.color} label={label} sw={clampN(0.6 * u, 1, 2)} />
              </g>
            )}
          </g>
        );
      })}

      {/* Namen zuletzt, mit dunkler Kontur: nichts überdeckt sie. Klick wählt den Planeten (Tastatur: Planetengruppe) */}
      <g aria-hidden>
        {map.planets.map((def) => {
          const ps = state.planets.find((x) => x.id === def.id)!;
          const lab = labels[def.id];
          const isSel = selected === def.id;
          return (
            <text
              key={def.id}
              x={r2(lab.x)}
              y={r2(lab.y)}
              textAnchor={lab.anchor}
              fontSize={r2(nameF)}
              fontWeight={700}
              fill={ps.destroyed ? '#9a927f' : isSel ? '#fff3d6' : '#e8dfc9'}
              stroke="#050807"
              strokeWidth={r2(nameF * 0.22)}
              paintOrder="stroke"
              onClick={onPlanet ? () => onPlanet(def.id) : undefined}
              style={{ fontFamily: 'var(--font-cinzel), "Cinzel", serif', cursor: onPlanet ? 'pointer' : undefined }}
            >
              {def.name}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
