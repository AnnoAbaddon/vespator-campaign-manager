#!/usr/bin/env node
/**
 * Neutrales Bildpaket – deterministisch erzeugte Dekorationsbilder ohne Warhammer-40k-Motive.
 *
 * Erzeugt die Dekorations- und Planetenbilder (public/ui, public/ui/land, public/art/planets, public/icons und das
 * Favicon src/app/icon.svg) mit identischen Dateinamen und Maßen: prozedurale Geometrie, Rauschen und Verläufe
 * (sharp + resvg). Motive: Kompassstern und Lorbeerkranz, runde Sensor-Drohne, schlichtes Wachssiegel mit Bändern,
 * Stahlhalle und Observatorium, prozedurale Planeten und Landschaften (Paletten aus src/components/map/PlanetArt.tsx,
 * Theatres aus src/engine/modules/vespator/data.ts).
 *
 * Ziel: Gibt es einen Ordner public-pack/, landen die Dateien dort (public-pack/<pfad> spiegelt public/<pfad>,
 * public-pack/_src/app/icon.svg das Favicon). Ohne public-pack/ schreibt das Skript direkt nach public/ bzw.
 * src/app/icon.svg und ersetzt die vorhandenen Dateien.
 *
 * Aufruf: node scripts/neutral-assets.mjs            (alle Bilder)
 *         node scripts/neutral-assets.mjs ui/land     (nur Pfade, die mit dem Präfix beginnen)
 * Gleiche Eingaben ergeben byte-gleiche Dateien (fester Seed, keine Zeit- oder Zufallsquellen).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACK = path.join(ROOT, 'public-pack');
/** Ohne public-pack/ (z. B. im veröffentlichten Repository) direkt nach public/ schreiben */
const IN_PLACE = !fs.existsSync(PACK);
const OUT = IN_PLACE ? path.join(ROOT, 'public') : PACK;
/** Zielpfad einer Paketdatei; _src/… liegt ohne Paketordner unter src/… */
const outFile = (rel) => (IN_PLACE && rel.startsWith('_src/') ? path.join(ROOT, rel.slice(1)) : path.join(OUT, rel));
const ONLY = process.argv[2] ?? '';

// ─── Zufall und Rauschen ─────────────────────────────────────────────────────

/** gleicher Generator wie PlanetArt.tsx (FNV-1a + Mischfunktion) */
function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const seedInt = (s) => Math.floor(rng(s)() * 4294967296) | 0;

/** Wertrauschen 2D/3D; mit Periode px/py kachelbar */
function makeNoise(seed) {
  const s = seedInt(seed);
  const h = (x, y, z) => {
    let n = s ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1);
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  return (x, y, z = 0, px = 0, py = 0) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = sm(x - x0);
    const fy = sm(y - y0);
    const fz = sm(z - z0);
    const wx = (i) => (px ? ((i % px) + px) % px : i);
    const wy = (i) => (py ? ((i % py) + py) % py : i);
    const X0 = wx(x0);
    const X1 = wx(x0 + 1);
    const Y0 = wy(y0);
    const Y1 = wy(y0 + 1);
    const plane = (zz) => lerp(lerp(h(X0, Y0, zz), h(X1, Y0, zz), fx), lerp(h(X0, Y1, zz), h(X1, Y1, zz), fx), fy);
    return lerp(plane(z0), plane(z0 + 1), fz);
  };
}
function fbm(n, x, y, z, oct, px = 0, py = 0) {
  let a = 0.5;
  let f = 1;
  let s = 0;
  let t = 0;
  for (let i = 0; i < oct; i++) {
    s += a * n(x * f, y * f, z * f, px * f, py * f);
    t += a;
    a *= 0.5;
    f *= 2;
  }
  return s / t;
}

// ─── Farben ──────────────────────────────────────────────────────────────────

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** RGBA-Puffer mit Hilfen */
function canvas(w, h, fill = [0, 0, 0], alpha = 255) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = fill[0];
    d[i * 4 + 1] = fill[1];
    d[i * 4 + 2] = fill[2];
    d[i * 4 + 3] = alpha;
  }
  return {
    w,
    h,
    d,
    set(x, y, c, a = 255) {
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = a;
    },
    /** additiv (Lichter, Sterne) */
    glow(x, y, c, k) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      d[i] += c[0] * k;
      d[i + 1] += c[1] * k;
      d[i + 2] += c[2] * k;
    },
    raw() {
      return sharp(Buffer.from(d.buffer), { raw: { width: w, height: h, channels: 4 } });
    },
  };
}

/** Sternfeld (additiv): kleine Punkte, wenige mit Hof */
function stars(cv, seed, count, maxY = cv.h, bright = 1) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(r() * cv.w);
    const y = Math.floor(r() * maxY);
    const b = Math.pow(r(), 3) * bright;
    const tint = r() > 0.8 ? [255, 214, 160] : r() > 0.6 ? [180, 220, 255] : [235, 235, 225];
    cv.glow(x, y, tint, 0.35 + b * 0.65);
    if (b > 0.45) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cv.glow(x + dx, y + dy, tint, b * 0.3);
  }
}

// ─── Stammdaten aus dem Quellcode (bleibt synchron mit Karte und Paletten) ───

const planetArtSrc = fs.readFileSync(path.join(ROOT, 'src/components/map/PlanetArt.tsx'), 'utf8');
const PALETTE = Object.fromEntries([...planetArtSrc.matchAll(/^\s+([A-Z_]+): \['(#[0-9a-f]{6})', '(#[0-9a-f]{6})', '(#[0-9a-f]{6})'\]/gm)].map((m) => [m[1], [hex(m[2]), hex(m[3]), hex(m[4])]]));
const dataSrc = fs.readFileSync(path.join(ROOT, 'src/engine/modules/vespator/data.ts'), 'utf8');
const PLANETS = [...dataSrc.matchAll(/\{ id: '([^']+)'[^\n]*?theatres: \[([^\]]*)\]/g)].map((m) => ({ id: m[1], theatres: [...m[2].matchAll(/'([A-Z_]+)'/g)].map((t) => t[1]) }));
if (Object.keys(PALETTE).length < 9 || PLANETS.length < 13) throw new Error('Paletten oder Planeten nicht gefunden (PlanetArt.tsx / vespator/data.ts geändert?)');

// ─── Ausgabe ─────────────────────────────────────────────────────────────────

const written = [];
/** Schreibt eine Datei; bei vorhandenem Original in public/ müssen die Maße übereinstimmen */
async function save(rel, img, { quality = 78, png = false } = {}) {
  const file = outFile(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = png ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.webp({ quality, alphaQuality: 85, effort: 6 }).toBuffer();
  const meta = await sharp(buf).metadata();
  const orig = path.join(ROOT, 'public', rel);
  if (fs.existsSync(orig)) {
    const o = await sharp(orig).metadata();
    if (o.width !== meta.width || o.height !== meta.height) throw new Error(`${rel}: ${meta.width}x${meta.height} statt ${o.width}x${o.height}`);
  }
  fs.writeFileSync(file, buf);
  written.push(`${rel.padEnd(34)} ${meta.width}x${meta.height}  ${(buf.length / 1024).toFixed(1)} KB`);
}
/** SVG → sharp (PNG mit Alpha) in genau w×h */
function svg(markup, w, h) {
  const png = new Resvg(markup, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: false } }).render().asPng();
  return sharp(png).resize(w, h, { fit: 'fill' });
}
const wanted = (rel) => !ONLY || rel.startsWith(ONLY);

// ─── SVG-Bausteine: Messing, Kompassstern, Lorbeer ───────────────────────────

const DEFS = `
  <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1dfae"/><stop offset=".42" stop-color="#c29d57"/><stop offset="1" stop-color="#5e4520"/></linearGradient>
  <linearGradient id="brassH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b4f25"/><stop offset=".3" stop-color="#d8bb7a"/><stop offset=".55" stop-color="#b08a48"/><stop offset="1" stop-color="#4f3a1a"/></linearGradient>
  <radialGradient id="brassBoss" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fbeec6"/><stop offset=".35" stop-color="#c9a35c"/><stop offset=".8" stop-color="#6e5328"/><stop offset="1" stop-color="#3a2a12"/></radialGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f4b"/><stop offset=".5" stop-color="#262a28"/><stop offset="1" stop-color="#121514"/></linearGradient>
  <linearGradient id="steelH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#141716"/><stop offset=".35" stop-color="#3b403c"/><stop offset=".6" stop-color="#262a28"/><stop offset="1" stop-color="#0e1110"/></linearGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".75"/></filter>`;

const P = (a, r, cx, cy) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
const f2 = (v) => Math.round(v * 100) / 100;

/** Achtstrahliger Kompassstern mit Facetten (helle/dunkle Hälfte je Strahl) */
function compassStar(cx, cy, R, { light = '#f6e7bd', dark = '#8a6a33', edge = '#2a1f10', inner = 0.2, diag = 0.6 } = {}) {
  let out = '';
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 4;
    const L = k % 2 === 0 ? R : R * diag;
    const tip = P(a, L, cx, cy);
    const l = P(a - Math.PI / 8, R * inner, cx, cy);
    const r = P(a + Math.PI / 8, R * inner, cx, cy);
    // diagonale Strahlen zuerst (liegen unten)
    const body = `<path d="M${f2(cx)} ${f2(cy)} L${f2(tip[0])} ${f2(tip[1])} L${f2(l[0])} ${f2(l[1])}Z" fill="${light}"/><path d="M${f2(cx)} ${f2(cy)} L${f2(tip[0])} ${f2(tip[1])} L${f2(r[0])} ${f2(r[1])}Z" fill="${dark}"/><path d="M${f2(l[0])} ${f2(l[1])} L${f2(tip[0])} ${f2(tip[1])} L${f2(r[0])} ${f2(r[1])}" fill="none" stroke="${edge}" stroke-width="${f2(Math.max(0.6, R * 0.025))}" stroke-linejoin="round"/>`;
    out = k % 2 === 0 ? out + body : body + out;
  }
  return `<g>${out}<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(R * 0.07)}" fill="${edge}"/></g>`;
}

/** Spitzes Blatt entlang Winkel a */
function leaf(x, y, a, len, wid, fill = 'url(#brass)', edge = '#2a1f10') {
  const tip = P(a, len, x, y);
  const m = P(a, len * 0.5, x, y);
  const n1 = P(a + Math.PI / 2, wid, m[0], m[1]);
  const n2 = P(a - Math.PI / 2, wid, m[0], m[1]);
  return `<path d="M${f2(x)} ${f2(y)} Q${f2(n1[0])} ${f2(n1[1])} ${f2(tip[0])} ${f2(tip[1])} Q${f2(n2[0])} ${f2(n2[1])} ${f2(x)} ${f2(y)}Z" fill="${fill}" stroke="${edge}" stroke-width="${f2(Math.max(0.6, wid * 0.18))}"/>`;
}

/** Lorbeerkranz (zwei Zweige, unten gebunden) */
function laurelRing(cx, cy, R, size = R * 0.26) {
  let out = '';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const ang = Math.PI / 2 + side * (0.35 + t * 2.35); // von unten nach oben
      const [x, y] = P(ang, R, cx, cy);
      const tang = ang + side * (Math.PI / 2);
      const s = size * (1 - t * 0.35);
      out += leaf(x, y, tang - side * 0.55, s, s * 0.32);
      out += leaf(x, y, tang + side * 0.35, s * 0.9, s * 0.3);
    }
  }
  const bow = P(Math.PI / 2, R, cx, cy);
  return `<g>${out}<circle cx="${f2(bow[0])}" cy="${f2(bow[1])}" r="${f2(size * 0.28)}" fill="url(#brassBoss)" stroke="#2a1f10" stroke-width="1"/></g>`;
}

/** Medaillon: Messingring + Kompassstern (+ optional Lorbeer) */
function medallion(cx, cy, R, laurel = true) {
  return `<g filter="url(#shadow)">${laurel ? laurelRing(cx, cy, R * 1.12, R * 0.34) : ''}
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="#1a1510" stroke="url(#brass)" stroke-width="${f2(R * 0.14)}"/>
    <circle cx="${cx}" cy="${cy}" r="${f2(R * 0.86)}" fill="none" stroke="#2a1f10" stroke-width="${f2(R * 0.03)}"/>
    ${compassStar(cx, cy, R * 0.8)}</g>`;
}

// ─── UI-Grafiken ─────────────────────────────────────────────────────────────

/** Banner: Stange, rotes Tuch mit Falten, Messingkante, Kompass-Medaillon */
async function banner() {
  const W = 220;
  const H = 413;
  const cloth = `M34 26 H186 V350 L110 318 L34 350 Z`;
  const trim = `M42 30 H178 V336 L110 307 L42 336 Z`;
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}
    <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3e0d11"/><stop offset=".12" stop-color="#7a1f25"/><stop offset=".28" stop-color="#5b151a"/><stop offset=".45" stop-color="#8a262c"/>
      <stop offset=".62" stop-color="#5a1419"/><stop offset=".8" stop-color="#7d2026"/><stop offset="1" stop-color="#360a0e"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".15" stop-color="#000" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>
    </defs>
    <g filter="url(#shadow)">
      <path d="${cloth}" fill="url(#cloth)"/><path d="${cloth}" fill="url(#shade)"/>
      <path d="${trim}" fill="none" stroke="url(#brass)" stroke-width="3"/>
      <path d="M34 350 L110 318 L186 350" fill="none" stroke="#2a0a0c" stroke-width="2"/>
      ${medallion(110, 150, 44)}
      ${compassStar(110, 262, 18, { inner: 0.22 })}
      <rect x="10" y="12" width="200" height="12" rx="6" fill="url(#brass)" stroke="#2a1f10" stroke-width="1.2"/>
      <circle cx="10" cy="18" r="9" fill="url(#brassBoss)" stroke="#2a1f10"/><circle cx="210" cy="18" r="9" fill="url(#brassBoss)" stroke="#2a1f10"/>
      <path d="M52 24 v18 M168 24 v18" stroke="#2a1f10" stroke-width="3"/>
      <path d="M26 24 q-4 30 2 58 M194 24 q4 30 -2 58" stroke="#b08a48" stroke-width="2.4" fill="none"/>
      <path d="M22 80 h12 l-2 22 h-8 z M186 80 h12 l-2 22 h-8 z" fill="url(#brass)" stroke="#2a1f10"/>
    </g></svg>`;
  await save('ui/banner-emblem.webp', svg(m, W, H));
}

/** Breites Emblem (ersetzt geflügelten Schädel): Kompass-Medaillon mit ausgebreiteten Lorbeerzweigen */
async function wingedEmblem() {
  const W = 720;
  const H = 268;
  const cx = 360;
  const cy = 128;
  let branches = '';
  for (const side of [-1, 1]) {
    // Stiel als flache Kurve nach außen und leicht nach oben
    const pts = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      pts.push([cx + side * (70 + t * 270), cy + 18 - Math.sin(t * Math.PI * 0.85) * 64 + t * 10]);
    }
    branches += `<path d="M${pts.map((p) => `${f2(p[0])} ${f2(p[1])}`).join(' L')}" fill="none" stroke="#5e4520" stroke-width="5" stroke-linecap="round"/>`;
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      const a = Math.atan2(y - py, x - px);
      const s = 50 * (1 - (i / pts.length) * 0.55);
      // Federn: nach oben lang, nach unten kurz – liest sich als Schwinge, bleibt aber Lorbeer
      branches += leaf(x, y, a - side * 1.05, s, s * 0.22);
      branches += leaf(x, y, a + side * 0.9, s * 0.62, s * 0.2);
    }
  }
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}</defs>
    <g filter="url(#shadow)">${branches}</g>
    ${medallion(cx, cy, 74, false)}
    <path d="M${cx} ${cy + 86} l-12 34 h24 z" fill="url(#brass)" stroke="#2a1f10" stroke-width="1.5"/>
    <path d="M${cx} ${cy - 86} l-10 -30 h20 z" fill="url(#brass)" stroke="#2a1f10" stroke-width="1.5"/></svg>`;
  await save('ui/emblem-winged.webp', svg(m, W, H));
}

/** Siegel (ersetzt Reinheitssiegel): rotes Wachssiegel mit Stern, zwei Messing-Bänder mit Schwalbenschwanz */
async function seal() {
  const W = 200;
  const H = 473;
  const cx = 100;
  const cy = 96;
  let wax = '';
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 74 + Math.sin(i * 1.7) * 3 + Math.cos(i * 0.9) * 2.5;
    const [x, y] = P(a, r, cx, cy);
    wax += `${i ? 'L' : 'M'}${f2(x)} ${f2(y)}`;
  }
  const ribbon = (x0, x1) => `M${x0 - 17} 140 L${x0 + 17} 140 L${x1 + 17} 458 L${x1} 438 L${x1 - 17} 458 Z`;
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}
    <radialGradient id="wax" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#b8434a"/><stop offset=".45" stop-color="#7c1d24"/><stop offset="1" stop-color="#3a0a0e"/></radialGradient>
    <linearGradient id="rib" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4e3a1a"/><stop offset=".35" stop-color="#b8975a"/><stop offset=".65" stop-color="#8d6c36"/><stop offset="1" stop-color="#3e2d12"/></linearGradient></defs>
    <g filter="url(#shadow)">
      <path d="${ribbon(82, 60)}" fill="url(#rib)" stroke="#2a1f10" stroke-width="1.5"/>
      <path d="${ribbon(118, 140)}" fill="url(#rib)" stroke="#2a1f10" stroke-width="1.5"/>
      <path d="M68 150 L52 440 M132 150 L148 440" stroke="#2a1f10" stroke-width="1" opacity=".5"/>
      <path d="${wax}Z" fill="url(#wax)" stroke="#2a080b" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="#4a0f14" stroke-width="5"/>
      <circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="#c0555c" stroke-width="1.2" opacity=".6" transform="translate(-1.5 -1.5)"/>
      ${compassStar(cx, cy, 44, { light: '#b9474e', dark: '#4d1016', edge: '#2a080b' })}
    </g></svg>`;
  await save('ui/seal-ribbon.webp', svg(m, W, H));
}

/** Sensor-Drohne (ersetzt Servo-Schädel): Stahlkugel mit Messinggürtel, Bernsteinlinse, Antenne, Flossen */
async function drone() {
  const W = 220;
  const H = 357;
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}
    <radialGradient id="hull" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#8f958f"/><stop offset=".4" stop-color="#4a504c"/><stop offset=".85" stop-color="#1b1f1d"/><stop offset="1" stop-color="#0c0e0d"/></radialGradient>
    <radialGradient id="lens" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#fff2c0"/><stop offset=".25" stop-color="#ffb347"/><stop offset=".6" stop-color="#a34a10"/><stop offset="1" stop-color="#2a0e04"/></radialGradient>
    <radialGradient id="lglow" r=".5"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
    <g filter="url(#shadow)">
      <path d="M128 72 L150 12" stroke="#2a1f10" stroke-width="5"/><path d="M128 72 L150 12" stroke="#b08a48" stroke-width="2.5"/>
      <circle cx="150" cy="12" r="6" fill="url(#brassBoss)" stroke="#2a1f10"/>
      <path d="M34 150 L6 128 L10 176 Z M186 150 L214 128 L210 176 Z" fill="url(#steel)" stroke="#0a0c0b" stroke-width="1.5"/>
      <path d="M34 150 L6 128 L10 176 Z M186 150 L214 128 L210 176 Z" fill="none" stroke="#b08a48" stroke-width="1" opacity=".7"/>
      <path d="M110 232 L110 300" stroke="#1a1d1c" stroke-width="6"/><path d="M110 232 L110 300" stroke="#6b716c" stroke-width="2"/>
      <path d="M96 300 h28 l-6 30 h-16 z" fill="url(#brass)" stroke="#2a1f10" stroke-width="1.2"/>
      <circle cx="110" cy="338" r="7" fill="url(#lens)" stroke="#2a1f10"/>
      <circle cx="110" cy="152" r="84" fill="url(#hull)" stroke="#070908" stroke-width="2"/>
      <path d="M28 150 A82 26 0 0 0 192 150" fill="none" stroke="url(#brassH)" stroke-width="11"/>
      <path d="M28 150 A82 26 0 0 0 192 150" fill="none" stroke="#2a1f10" stroke-width="1" transform="translate(0 6)"/>
      <g fill="#f0dcaa">${Array.from({ length: 7 }, (_, i) => {
        const a = Math.PI * (0.15 + i * 0.117);
        return `<circle cx="${f2(110 - Math.cos(a) * 82)}" cy="${f2(150 + Math.sin(a) * 26)}" r="2.2"/>`;
      }).join('')}</g>
      <circle cx="110" cy="138" r="60" fill="url(#lglow)"/>
      <circle cx="110" cy="138" r="37" fill="#0b0c0b" stroke="url(#brass)" stroke-width="7"/>
      <circle cx="110" cy="138" r="27" fill="url(#lens)"/>
      <circle cx="101" cy="129" r="6" fill="#fff8e0" opacity=".85"/>
      <circle cx="152" cy="96" r="9" fill="#1a0d06" stroke="#b08a48" stroke-width="2.5"/><circle cx="152" cy="96" r="4" fill="#ff6a3a"/>
      <path d="M58 92 q18 -30 52 -34" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>
    </g></svg>`;
  await save('ui/sentinel.webp', svg(m, W, H));
}

/** Eckbeschlag (ersetzt Ecken mit Schädel): L-Winkel aus Stahl mit Messingkante, Nieten, Boss mit Stern */
async function corners() {
  const S = 160;
  const B = 44;
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><defs>${DEFS}
    <linearGradient id="barH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d423e"/><stop offset=".5" stop-color="#222624"/><stop offset="1" stop-color="#111413"/></linearGradient>
    <linearGradient id="barV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3d423e"/><stop offset=".5" stop-color="#222624"/><stop offset="1" stop-color="#111413"/></linearGradient></defs>
    <g filter="url(#shadow)">
      <path d="M2 2 H${S - 4} V${B} H${B} V${S - 4} H2 Z" fill="#080a09"/>
      <path d="M6 6 H${S - 8} V${B - 4} H${B - 4} V${S - 8} H6 Z" fill="url(#barH)" stroke="url(#brass)" stroke-width="4" stroke-linejoin="round"/>
      <path d="M${B - 4} ${B - 4} V${S - 8}" stroke="url(#barV)" stroke-width="0"/>
      <path d="M14 ${B / 2 + 2} H${S - 20} M${B / 2 + 2} 14 V${S - 20}" stroke="#050707" stroke-width="2" opacity=".6"/>
      ${[[S - 26, B / 2 + 2], [B / 2 + 2, S - 26], [S - 62, B / 2 + 2], [B / 2 + 2, S - 62]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="url(#brassBoss)" stroke="#1a1208" stroke-width="1.2"/>`).join('')}
      <circle cx="36" cy="36" r="30" fill="#14100b" stroke="url(#brass)" stroke-width="6"/>
      <circle cx="36" cy="36" r="23" fill="none" stroke="#2a1f10" stroke-width="1.5"/>
      ${compassStar(36, 36, 21, { diag: 0.5 })}
    </g></svg>`;
  const base = svg(m, S, S);
  const png = await base.png().toBuffer();
  await save('ui/corner-tl.webp', sharp(png));
  await save('ui/corner-tr.webp', sharp(png).flop());
  await save('ui/corner-bl.webp', sharp(png).flip());
  await save('ui/corner-br.webp', sharp(png).flip().flop());
}

/** Kopfband (ersetzt gotischen Architrav): horizontal kachelbare Arkade mit Lampen, Gebälk und Nieten */
async function headerBand() {
  const W = 1536;
  const H = 192;
  const U = 192; // Kachelbreite, 1536 = 8 × 192 → nahtlos bei repeat-x
  let units = '';
  for (let i = 0; i < W / U; i++) {
    const x = i * U;
    units += `<g transform="translate(${x} 0)">
      <rect x="0" y="48" width="${U}" height="104" fill="url(#wall)"/>
      <path d="M40 152 V104 A56 56 0 0 1 152 104 V152 Z" fill="url(#niche)" stroke="#050707" stroke-width="3"/>
      <path d="M40 152 V104 A56 56 0 0 1 152 104 V152" fill="none" stroke="url(#brass)" stroke-width="3" opacity=".75"/>
      <ellipse cx="96" cy="140" rx="36" ry="22" fill="url(#lamp)"/>
      <rect x="90" y="120" width="12" height="24" rx="2" fill="#2a2016" stroke="#6b5230" stroke-width="1"/>
      <circle cx="96" cy="116" r="4" fill="#ffd27a"/>
      <circle cx="96" cy="58" r="7" fill="url(#brassBoss)" stroke="#2a1f10"/>
      ${compassStar(96, 58, 12, { diag: 0.5 })}
    </g>`;
  }
  // Pfeiler auf den Kachelgrenzen (auch bei x = 0 und x = W, jeweils halb) – so stoßen die Kacheln nahtlos
  let piers = '';
  for (let i = 0; i <= W / U; i++) {
    const x = i * U;
    piers += `<g transform="translate(${x} 0)">
      <rect x="-15" y="40" width="30" height="112" fill="url(#pier)" stroke="#050707" stroke-width="2"/>
      <rect x="-19" y="60" width="38" height="8" fill="url(#brass)" stroke="#2a1f10"/>
      <rect x="-19" y="142" width="38" height="8" fill="url(#brass)" stroke="#2a1f10"/>
      <path d="M-10 26 L0 8 L10 26 Z" fill="url(#brass)" stroke="#2a1f10"/>
      <circle cx="0" cy="30" r="7" fill="url(#brassBoss)" stroke="#2a1f10"/>
    </g>`;
  }
  let rivets = '';
  for (let x = 12; x < W; x += 24) rivets += `<circle cx="${x}" cy="170" r="2.6" fill="url(#brassBoss)"/>`;
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f1d"/><stop offset="1" stop-color="#0c0f0e"/></linearGradient>
    <linearGradient id="niche" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040505"/><stop offset=".7" stop-color="#0d0c09"/><stop offset="1" stop-color="#2a1d0e"/></linearGradient>
    <linearGradient id="pier" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0f1211"/><stop offset=".4" stop-color="#3a3f3b"/><stop offset=".6" stop-color="#262a28"/><stop offset="1" stop-color="#0b0d0c"/></linearGradient>
    <radialGradient id="lamp" r=".5"><stop offset="0" stop-color="#ffb347" stop-opacity=".5"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
    ${units}
    <rect x="0" y="36" width="${W}" height="10" fill="url(#brass)" opacity=".85"/><rect x="0" y="46" width="${W}" height="3" fill="#050707"/>
    ${piers}
    <rect x="0" y="152" width="${W}" height="6" fill="url(#brass)"/>
    <rect x="0" y="158" width="${W}" height="24" fill="url(#steel)"/>
    ${rivets}
    <rect x="0" y="182" width="${W}" height="4" fill="url(#brass)" opacity=".8"/><rect x="0" y="186" width="${W}" height="6" fill="#050707"/></svg>`;
  await save('ui/header-band.webp', svg(m, W, H), { quality: 80 });
}

/** Nische in der Kopfleiste (ersetzt gotische Nische): Bullauge mit Sternen und Planetenrand */
async function headerNiche() {
  const W = 296;
  const H = 176;
  const cv = canvas(W, H, [3, 6, 6]);
  stars(cv, 'niche', 140, H, 1);
  const bg = await cv.raw().png().toBuffer();
  let bolts = '';
  for (let i = 0; i < 12; i++) {
    const [x, y] = P((i / 12) * Math.PI * 2, 74, 148, 96);
    bolts += `<circle cx="${f2(x)}" cy="${f2(y)}" r="3.4" fill="url(#brassBoss)" stroke="#1a1208"/>`;
  }
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}
    <radialGradient id="pl" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#6c8f86"/><stop offset=".5" stop-color="#244a42"/><stop offset="1" stop-color="#03100d"/></radialGradient>
    <mask id="hole"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="148" cy="96" r="62" fill="#000"/></mask>
    <clipPath id="win"><circle cx="148" cy="96" r="62"/></clipPath></defs>
    <g clip-path="url(#win)"><circle cx="220" cy="190" r="110" fill="url(#pl)"/><circle cx="220" cy="190" r="111" fill="none" stroke="#9fd0c0" stroke-opacity=".35" stroke-width="3"/></g>
    <rect width="${W}" height="${H}" fill="url(#steel)" mask="url(#hole)"/>
    <circle cx="148" cy="96" r="80" fill="none" stroke="#050707" stroke-width="4"/>
    <circle cx="148" cy="96" r="70" fill="none" stroke="url(#brass)" stroke-width="16"/>
    <circle cx="148" cy="96" r="62" fill="none" stroke="#050707" stroke-width="3"/>
    ${bolts}</svg>`;
  const over = await svg(m, W, H).png().toBuffer();
  await save('ui/header-niches-l.webp', sharp(bg).composite([{ input: over }]));
}

/** Metallkachel (nahtlos): dunkler Stahl, Flecken, Schliff, Korn */
async function metalTile() {
  const S = 512;
  const cv = canvas(S, S);
  const n = makeNoise('metal');
  const g = makeNoise('metal-grain');
  const base = [30, 33, 32];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const mottle = fbm(n, u * 4, v * 4, 0, 5, 4, 4) - 0.5;
      const brush = n(u * 2, v * 128, 7, 2, 128) - 0.5;
      const grain = g(x, y, 3, S, S) - 0.5;
      const wear = smooth(0.62, 0.75, fbm(n, u * 8, v * 8, 11, 3, 8, 8));
      const k = 1 + mottle * 0.55 + brush * 0.18 + grain * 0.3 + wear * 0.22;
      cv.set(x, y, mul(base, k));
    }
  await save('ui/metal-tile.webp', cv.raw(), { quality: 82 });
}

/** Weltraum für die Kartenfläche: grünlicher Nebel, dunkle Staubbahnen, Sterne */
async function spaceBg() {
  const S = 1254;
  const cv = canvas(S, S);
  const n = makeNoise('space');
  const base = [4, 14, 13];
  const neb = [22, 70, 62];
  const warm = [70, 58, 34];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const a = fbm(n, u * 3, v * 3, 0, 6);
      const b = fbm(n, u * 5 + 9, v * 5, 3, 5);
      const cloud = smooth(0.45, 0.8, a) * (1 - smooth(0.55, 0.75, b) * 0.7);
      let c = add(base, neb, cloud * 0.9);
      c = add(c, warm, smooth(0.62, 0.85, fbm(n, u * 2, v * 2, 9, 4)) * 0.35);
      cv.set(x, y, c);
    }
  stars(cv, 'space-stars', 1400, S, 1);
  await save('ui/space-bg.webp', cv.raw(), { quality: 74 });
}

/** Kulisse hinter allen Gehäusen (ersetzt Kathedralen-Innenraum): Halle mit Stahlpfeilern, Rundbögen, Lampen */
async function backdrop() {
  const W = 1920;
  const H = 1081;
  const cv = canvas(W, H);
  const n = makeNoise('backdrop');
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = 0.8 + fbm(n, x / 180, y / 180, 0, 4) * 0.5;
      cv.set(x, y, mul([12, 15, 14], k));
    }
  const bg = await cv.raw().png().toBuffer();
  const cols = [];
  for (let i = -4; i <= 4; i++) cols.push(960 + i * 250);
  let arches = '';
  let piers = '';
  let lamps = '';
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i] + 36;
    const b = cols[i + 1] - 36;
    const r = (b - a) / 2;
    const spring = 360;
    arches += `<path d="M${a} ${H} V${spring} A${r} ${r} 0 0 1 ${b} ${spring} V${H} Z" fill="url(#bay)"/>
      <path d="M${a} ${H} V${spring} A${r} ${r} 0 0 1 ${b} ${spring} V${H}" fill="none" stroke="#3a3f3b" stroke-width="6" opacity=".7"/>
      <path d="M${a + 18} ${H} V${spring + 10} A${r - 18} ${r - 18} 0 0 1 ${b - 18} ${spring + 10} V${H}" fill="none" stroke="#050707" stroke-width="3"/>`;
    for (let k = 1; k < 4; k++) arches += `<rect x="${a + 30}" y="${spring + 120 * k}" width="${b - a - 60}" height="3" fill="#050707" opacity=".6"/>`;
  }
  for (const c of cols) {
    piers += `<rect x="${c - 36}" y="0" width="72" height="${H}" fill="url(#pier)"/>
      <rect x="${c - 44}" y="300" width="88" height="16" fill="url(#brass)" opacity=".45"/>
      <rect x="${c - 44}" y="${H - 120}" width="88" height="16" fill="url(#brass)" opacity=".35"/>`;
    lamps += `<circle cx="${c}" cy="560" r="90" fill="url(#lampGlow)"/><rect x="${c - 7}" y="540" width="14" height="30" rx="3" fill="#2a2016" stroke="#8a6a3a"/><circle cx="${c}" cy="548" r="5" fill="#ffd27a"/>`;
  }
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${DEFS}
    <linearGradient id="bay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050707"/><stop offset=".6" stop-color="#0a0d0c"/><stop offset="1" stop-color="#15120d"/></linearGradient>
    <linearGradient id="pier" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#070909"/><stop offset=".35" stop-color="#2a2f2c"/><stop offset=".55" stop-color="#1b1f1d"/><stop offset="1" stop-color="#060808"/></linearGradient>
    <radialGradient id="lampGlow" r=".5"><stop offset="0" stop-color="#ffb347" stop-opacity=".35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c211f" stop-opacity="0"/><stop offset="1" stop-color="#1c211f" stop-opacity=".7"/></linearGradient></defs>
    <g opacity=".92">${arches}</g>${piers}
    <rect x="0" y="0" width="${W}" height="70" fill="url(#steel)"/><rect x="0" y="70" width="${W}" height="6" fill="url(#brass)" opacity=".4"/>
    ${lamps}
    <rect x="0" y="${H - 300}" width="${W}" height="300" fill="url(#fog)"/></svg>`;
  const over = await svg(m, W, H).png().toBuffer();
  await save('ui/backdrop.webp', sharp(bg).composite([{ input: over }]), { quality: 72 });
}

// ─── Planeten (Pixel-Renderer, Paletten wie PlanetArt.tsx) ──────────────────

function planetLook(theatres) {
  const first = PALETTE[theatres[0]];
  const second = PALETTE[theatres[1]] ?? first;
  const has = (t) => theatres.includes(t);
  return {
    first,
    second,
    lights: has('HAB_SPRAWL') || has('FORGE_COMPLEX') || has('SPACEPORT'),
    lava: has('FORGE_COMPLEX'),
    rad: has('RAD_ZONE'),
    tomb: has('TOMB_COMPLEX'),
    clouds: has('XENOFLORA_JUNGLE') || has('SPACEPORT') || has('HAB_SPRAWL'),
    dunes: has('DESOLATE_WASTES'),
  };
}

/** Zeichnet eine beleuchtete Kugel additiv/deckend in einen Puffer */
function drawPlanet(cv, { cx, cy, R, seed, theatres, light = [-0.55, -0.45, 0.7], halo = true }) {
  const look = planetLook(theatres);
  const [base, dark, lite] = look.first;
  const [b2, d2, l2] = look.second;
  const n = makeNoise(`planet-${seed}`);
  const r = rng(`planet-${seed}`);
  const tilt = (r() - 0.5) * 0.9;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const ll = Math.hypot(...light);
  const L = light.map((v) => v / ll);
  const off = r() * 50;
  const x0 = Math.max(0, Math.floor(cx - R * 1.12));
  const x1 = Math.min(cv.w - 1, Math.ceil(cx + R * 1.12));
  const y0 = Math.max(0, Math.floor(cy - R * 1.12));
  const y1 = Math.min(cv.h - 1, Math.ceil(cy + R * 1.12));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / R;
      const dy = (y + 0.5 - cy) / R;
      const d = Math.hypot(dx, dy);
      const i = (y * cv.w + x) * 4;
      if (d > 1) {
        if (!halo) continue;
        // Atmosphärensaum
        const t = 1 - smooth(1, 1.1, d);
        const side = smooth(-0.6, 0.6, -(dx * L[0] + dy * L[1]) / d);
        const k = t * t * 0.55 * (0.25 + side * 0.75);
        cv.d[i] += lite[0] * k;
        cv.d[i + 1] += lite[1] * k;
        cv.d[i + 2] += lite[2] * k;
        continue;
      }
      const nz = Math.sqrt(1 - d * d);
      // gekippte Achse für Bänder
      const px = dx * ct - dy * st;
      const py = dx * st + dy * ct;
      const h = fbm(n, px * 2.1 + off, py * 2.1, nz * 2.1, 6);
      const hh = clamp((h - 0.28) / 0.44);
      let c = hh < 0.5 ? mix(dark, base, hh * 2) : mix(base, lite, (hh - 0.5) * 2);
      // Zweites Theatre als Regionen
      const reg = smooth(0.52, 0.62, fbm(n, px * 1.2, py * 1.2 + off, nz * 1.2 + 7, 4));
      c = mix(c, hh < 0.5 ? mix(d2, b2, hh * 2) : mix(b2, l2, (hh - 0.5) * 2), reg * 0.75);
      // Bänder (Dünen/Wolkenstreifen)
      const band = Math.sin((py * (look.dunes ? 14 : 7) + h * 3) * Math.PI);
      c = mul(c, 1 + band * (look.dunes ? 0.07 : 0.04));
      let emit = [0, 0, 0];
      if (look.lava) {
        const rid = 1 - Math.abs(2 * fbm(n, px * 3.4, py * 3.4, nz * 3.4 + 21, 5) - 1);
        emit = add(emit, [255, 120, 40], smooth(0.95, 0.99, rid) * 0.55);
      }
      if (look.tomb) {
        const rid = 1 - Math.abs(2 * fbm(n, px * 4, py * 4, nz * 4 + 33, 4) - 1);
        emit = add(emit, [90, 230, 160], smooth(0.965, 0.995, rid) * 0.4);
      }
      if (look.rad) c = mix(c, [190, 205, 70], smooth(0.6, 0.75, fbm(n, px * 2.6, py * 2.6, nz * 2.6 + 44, 4)) * 0.35);
      if (look.clouds) {
        const cl = smooth(0.55, 0.72, fbm(n, px * 2.8 + 5, py * 5.2, nz * 2.8, 5));
        c = mix(c, [226, 230, 224], cl * 0.55);
      }
      const lam = dx * L[0] + dy * L[1] + nz * L[2];
      const lit = smooth(-0.12, 0.75, lam) * 0.95 + 0.04;
      c = mul(c, lit * (0.65 + nz * 0.35));
      if (look.lights && lit < 0.35) {
        const city = smooth(0.66, 0.74, fbm(n, px * 9, py * 9, nz * 9 + 55, 3));
        c = add(c, [255, 200, 110], city * (0.35 - lit) * 2.2);
      }
      c = add(c, emit, 0.6 + (1 - lit) * 0.4);
      // Randlicht (Atmosphäre auf der Tagseite)
      const rim = Math.pow(1 - nz, 3) * smooth(-0.3, 0.6, lam);
      c = add(c, lite, rim * 0.6);
      // Kante weich
      const cov = clamp((1 - d) * R + 0.5);
      for (let k = 0; k < 3; k++) cv.d[i + k] = cv.d[i + k] * (1 - cov) + c[k] * cov;
    }
}

async function planetPortraits() {
  for (const p of PLANETS) {
    const rel = `art/planets/${p.id}.webp`;
    if (!wanted(rel)) continue;
    const S = 384;
    const cv = canvas(S, S, [2, 3, 4]);
    stars(cv, `pp-${p.id}`, 120, S, 0.7);
    drawPlanet(cv, { cx: S / 2, cy: S / 2, R: S / 2 - 3, seed: p.id, theatres: p.theatres, halo: false });
    await save(rel, cv.raw(), { quality: 80 });
  }
}

// ─── Landschaften ────────────────────────────────────────────────────────────

async function landscapes() {
  const W = 880;
  const H = 495;
  for (const p of PLANETS) {
    const rel = `ui/land/${p.id}.webp`;
    if (!wanted(rel)) continue;
    const look = planetLook(p.theatres);
    const [base, dark, lite] = look.first;
    const [b2, d2] = look.second;
    const n = makeNoise(`land-${p.id}`);
    const r = rng(`land-${p.id}`);
    const skyTop = [5, 8, 10];
    let horizon = mix(mix(dark, lite, 0.35), [40, 44, 42], 0.35);
    if (look.rad) horizon = mix(horizon, [150, 160, 60], 0.35);
    if (look.lava) horizon = mix(horizon, [150, 60, 25], 0.35);
    if (look.tomb) horizon = mix(horizon, [40, 110, 80], 0.25);
    const cv = canvas(W, H);
    // Himmel
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = Math.pow(y / (H * 0.62), 1.6);
        let c = mix(skyTop, horizon, clamp(t));
        const cloud = smooth(0.5, 0.8, fbm(n, x / 220, y / 70, 1, 5));
        c = mix(c, mix(horizon, lite, 0.25), cloud * 0.35 * clamp(t + 0.2));
        cv.set(x, y, c);
      }
    stars(cv, `ls-${p.id}`, 160, H * 0.4, 0.6);
    // Mond/Nachbarplanet am Himmel
    const moonTheatres = [['DEAD_LANDS'], ['SPACEPORT'], ['DESOLATE_WASTES'], [p.theatres[1] ?? 'DEAD_LANDS']][Math.floor(r() * 4)];
    const mR = 34 + r() * 60;
    drawPlanet(cv, { cx: W * (0.15 + r() * 0.7), cy: H * (0.12 + r() * 0.18), R: mR, seed: `${p.id}-moon`, theatres: moonTheatres, light: [0.6, -0.2, 0.6] });
    // Bergketten: 4 Lagen von hinten nach vorn
    const layers = 4;
    const ridge = [];
    for (let l = 0; l < layers; l++) {
      const row = new Float32Array(W);
      const baseY = H * (0.5 + l * 0.1);
      const amp = H * (0.16 - l * 0.025) * (look.dunes && !look.lava ? 0.6 : 1);
      for (let x = 0; x < W; x++) {
        let v = fbm(n, x / (look.dunes ? 260 : 140) + l * 17, l * 3.1, 2, 5);
        if (!look.dunes) v = 0.6 * v + 0.4 * (1 - Math.abs(2 * fbm(n, x / 90 + l * 5, l, 4, 4) - 1));
        row[x] = baseY - (v - 0.35) * amp * 2;
      }
      ridge.push(row);
    }
    /** Lagen from..to-1 in einen Puffer; weiche Oberkante (Deckung) über vorhandene Pixel geblendet */
    const paintLayers = (target, from, to) => {
      for (let l = from; l < to; l++) {
        const depth = l / (layers - 1);
        const col = mix(mix(dark, base, 0.55 - depth * 0.3), l % 2 ? d2 : b2, 0.25);
        const tone = mix(horizon, mul(col, 0.62 - depth * 0.4), 0.3 + depth * 0.65);
        for (let x = 0; x < W; x++)
          for (let y = Math.max(0, Math.floor(ridge[l][x])); y < H; y++) {
            const tex = fbm(n, x / 30, y / 18, 5 + l, 4) - 0.5;
            // Lichtkante am Grat, Dunst am Fuß jeder Lage
            const rim = 1 - smooth(0, 8, y - ridge[l][x]);
            let c = mul(tone, 1 + tex * 0.45 + rim * 0.35);
            c = mix(c, horizon, smooth(ridge[l][x] + 20, ridge[l][x] + 120, y) * (1 - depth) * 0.3);
            const a = clamp(y + 1 - ridge[l][x]);
            const i = (y * W + x) * 4;
            const old = target.d[i + 3] / 255;
            for (let k = 0; k < 3; k++) target.d[i + k] = old ? target.d[i + k] * (1 - a) + c[k] * a : c[k];
            target.d[i + 3] = Math.round(255 * Math.max(old, a));
          }
      }
    };
    paintLayers(cv, 0, 2);
    const back = await cv.raw().png().toBuffer();

    // Bauwerke und Effekte auf Lage 1 (SVG)
    let mid = '';
    const at = (x) => ridge[1][Math.max(0, Math.min(W - 1, Math.round(x)))];
    if (look.lights) {
      const cx0 = W * (0.2 + r() * 0.6);
      const count = 12 + Math.floor(r() * 14);
      for (let i = 0; i < count; i++) {
        const x = cx0 + (r() - 0.5) * 360;
        const w = 8 + r() * 22;
        const h = 18 + Math.pow(r(), 1.8) * 120;
        const y = at(x) + 6;
        const shade = 12 + Math.floor(r() * 10);
        mid += `<rect x="${f2(x)}" y="${f2(y - h)}" width="${f2(w)}" height="${f2(h + 20)}" fill="rgb(${shade},${shade + 2},${shade + 2})"/>`;
        if (r() > 0.6) mid += `<rect x="${f2(x + w / 2 - 1)}" y="${f2(y - h - 16)}" width="2" height="16" fill="#0c0e0d"/><circle cx="${f2(x + w / 2)}" cy="${f2(y - h - 17)}" r="1.8" fill="#ff5a3a"/>`;
        const wins = Math.floor(h / 9);
        for (let k = 0; k < wins; k++) if (r() > 0.55) mid += `<rect x="${f2(x + 2 + r() * (w - 5))}" y="${f2(y - h + 4 + k * 9)}" width="2" height="3" fill="#ffc870" opacity="${f2(0.5 + r() * 0.5)}"/>`;
      }
      mid += `<ellipse cx="${f2(cx0)}" cy="${f2(at(cx0))}" rx="240" ry="50" fill="url(#cityGlow)"/>`;
    }
    if (p.theatres.includes('SPACEPORT')) {
      const x = W * (0.1 + r() * 0.8);
      const y = at(x) + 4;
      mid += `<path d="M${f2(x)} ${f2(y)} v-150 M${f2(x - 14)} ${f2(y)} l14 -60 l14 60 M${f2(x)} ${f2(y - 150)} h40" stroke="#101312" stroke-width="5" fill="none"/><circle cx="${f2(x + 40)}" cy="${f2(y - 150)}" r="3" fill="#ff5a3a"/><circle cx="${f2(x)}" cy="${f2(y - 150)}" r="3" fill="#ffd27a"/>`;
    }
    if (p.theatres.includes('DELVESITE_FACILITY')) {
      for (let k = 0; k < 3; k++) {
        const x = W * (0.1 + r() * 0.8);
        const y = at(x) + 4;
        const h = 60 + r() * 50;
        mid += `<path d="M${f2(x - 18)} ${f2(y)} L${f2(x)} ${f2(y - h)} L${f2(x + 18)} ${f2(y)} M${f2(x - 12)} ${f2(y - h * 0.3)} H${f2(x + 12)} M${f2(x - 7)} ${f2(y - h * 0.6)} H${f2(x + 7)} M${f2(x - 12)} ${f2(y - h * 0.3)} L${f2(x + 7)} ${f2(y - h * 0.6)}" stroke="#0e1110" stroke-width="3" fill="none"/><circle cx="${f2(x)}" cy="${f2(y - h)}" r="2.2" fill="#ffd27a"/>`;
      }
    }
    if (look.lava) {
      for (let k = 0; k < 4; k++) {
        const x = W * (0.1 + r() * 0.8);
        const y = at(x) + 2;
        mid += `<rect x="${f2(x - 6)}" y="${f2(y - 90)}" width="12" height="94" fill="#0e0f0e"/><ellipse cx="${f2(x + 20)}" cy="${f2(y - 120)}" rx="46" ry="22" fill="#2a2724" opacity=".55" filter="url(#blur)"/><ellipse cx="${f2(x)}" cy="${f2(y)}" rx="40" ry="14" fill="#ff7a2a" opacity=".45" filter="url(#blur)"/>`;
      }
    }
    if (look.rad) mid += `<rect x="0" y="${f2(H * 0.35)}" width="${W}" height="${f2(H * 0.3)}" fill="#c8d860" opacity=".08" filter="url(#blur)"/>`;
    const midSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>
      <radialGradient id="cityGlow" r=".5"><stop offset="0" stop-color="#ffb347" stop-opacity=".22"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
      <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter></defs>${mid}</svg>`;

    // vordere Lagen transparent darüber
    const front = canvas(W, H, [0, 0, 0], 0);
    paintLayers(front, 2, layers);
    // Vordergrund-Effekte (SVG)
    let fg = '';
    const atF = (x) => ridge[3][Math.max(0, Math.min(W - 1, Math.round(x)))];
    if (look.lava)
      for (let k = 0; k < 3; k++) {
        let x = W * r();
        let y = atF(x) + 20 + r() * 40;
        let d = `M${f2(x)} ${f2(y)}`;
        for (let s = 0; s < 8; s++) {
          x += 14 + r() * 26;
          y += (r() - 0.4) * 14;
          d += ` L${f2(x)} ${f2(y)}`;
        }
        fg += `<path d="${d}" stroke="#ff8a3a" stroke-width="7" fill="none" opacity=".45" filter="url(#b4)"/><path d="${d}" stroke="#ffd08a" stroke-width="1.6" fill="none"/>`;
      }
    if (look.tomb)
      for (let k = 0; k < 5; k++) {
        const x = W * r();
        const y = atF(x) + 14 + r() * 50;
        fg += `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(10 + r() * 30)}" ry="3" fill="#5fe0a0" opacity=".5" filter="url(#b4)"/>`;
      }
    if (p.theatres.includes('XENOFLORA_JUNGLE'))
      for (let k = 0; k < 26; k++) {
        const x = W * r();
        const y = atF(x) + 8;
        const s = 10 + r() * 26;
        fg += `<path d="M${f2(x)} ${f2(y)} q${f2(-s * 0.2)} ${f2(-s)} ${f2(s * 0.1)} ${f2(-s * 2)}" stroke="#08120a" stroke-width="3" fill="none"/><circle cx="${f2(x + s * 0.1)}" cy="${f2(y - s * 2)}" r="${f2(s * 0.55)}" fill="#0b170d"/>`;
      }
    const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><filter id="b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
      <radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs>${fg}<rect width="${W}" height="${H}" fill="url(#vig)"/></svg>`;

    const layersOut = [
      { input: await svg(midSvg, W, H).png().toBuffer() },
      { input: await front.raw().png().toBuffer() },
      { input: await svg(fgSvg, W, H).png().toBuffer() },
    ];
    await save(rel, sharp(back).composite(layersOut), { quality: 76 });
  }
}

// ─── Szene für Seitenleiste und Anmeldung (ersetzt Kathedrale) ───────────────

/** Nachthimmel mit Nebel und großem Planeten, davor Hochplateau mit Observatorium, Masten und Gebäuden */
async function scene(rel, W, H) {
  const k = W / 520;
  const cv = canvas(W, H);
  const n = makeNoise('scene');
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const t = clamp(v / 0.75);
      let c = mix([4, 7, 8], [36, 30, 24], Math.pow(t, 2.2));
      const neb = smooth(0.48, 0.8, fbm(n, u * 3, v * 4.5, 0, 6));
      c = add(c, [30, 62, 56], neb * 0.9 * (1 - t * 0.6));
      c = add(c, [80, 44, 24], smooth(0.55, 0.85, fbm(n, u * 2 + 4, v * 3, 2, 5)) * 0.45 * t);
      cv.set(x, y, c);
    }
  stars(cv, 'scene-stars', Math.round(700 * k * k), H * 0.65, 1);
  drawPlanet(cv, { cx: W * 0.68, cy: H * 0.24, R: W * 0.3, seed: 'scene-planet', theatres: ['DESOLATE_WASTES', 'DEAD_LANDS'], light: [-0.7, 0.1, 0.5] });
  drawPlanet(cv, { cx: W * 0.2, cy: H * 0.12, R: W * 0.06, seed: 'scene-moon', theatres: ['SPACEPORT'], light: [0.6, -0.2, 0.6] });
  const bg = await cv.raw().png().toBuffer();

  // Silhouette im 520×780-Raster zeichnen, per viewBox skaliert
  const r = rng('scene-city');
  let city = '';
  let win = '';
  const ground = 560;
  for (let i = 0; i < 46; i++) {
    const x = r() * 520;
    const w = 8 + r() * 26;
    const h = 20 + Math.pow(r(), 2) * 150 * (1 - Math.abs(x - 260) / 420);
    const y = ground - h + r() * 30;
    city += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(ground + 240 - y)}"/>`;
    for (let j = 0; j < h / 8; j++) if (r() > 0.62) win += `<rect x="${f2(x + 2 + r() * (w - 5))}" y="${f2(y + 4 + j * 8)}" width="1.6" height="2.4" opacity="${f2(0.45 + r() * 0.55)}"/>`;
    if (r() > 0.75) city += `<rect x="${f2(x + w / 2 - 0.8)}" y="${f2(y - 22)}" width="1.6" height="22"/>`;
  }
  const m = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 780" width="${W}" height="${H}"><defs>${DEFS}
    <linearGradient id="plateau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15130f"/><stop offset="1" stop-color="#050606"/></linearGradient>
    <linearGradient id="dome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b0d0c"/><stop offset=".3" stop-color="#3b3a34"/><stop offset=".55" stop-color="#1d1f1d"/><stop offset="1" stop-color="#070808"/></linearGradient>
    <radialGradient id="glow" r=".5"><stop offset="0" stop-color="#ffb347" stop-opacity=".4"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2d1d" stop-opacity="0"/><stop offset="1" stop-color="#3a2d1d" stop-opacity=".55"/></linearGradient></defs>
    <rect x="0" y="470" width="520" height="140" fill="url(#haze)"/>
    <g fill="#0c0e0d">${city}</g>
    <g fill="#ffc870">${win}</g>
    <ellipse cx="260" cy="560" rx="260" ry="60" fill="url(#glow)"/>
    <path d="M0 600 L60 585 L120 596 L170 574 L350 574 L400 592 L460 582 L520 598 V780 H0 Z" fill="url(#plateau)"/>
    <rect x="170" y="520" width="180" height="56" fill="#0d0f0e" stroke="#2a2d2a" stroke-width="1.5"/>
    <path d="M190 520 A70 70 0 0 1 330 520 Z" fill="url(#dome)" stroke="#050707" stroke-width="2"/>
    <path d="M254 452 L266 452 L268 520 L252 520 Z" fill="#050707"/>
    <path d="M190 520 A70 70 0 0 1 330 520" fill="none" stroke="url(#brass)" stroke-width="2.5" opacity=".7"/>
    ${[196, 226, 256, 286, 316].map((x) => `<rect x="${x + 2}" y="544" width="4" height="7" fill="#ffc870" opacity=".6"/>`).join('')}
    <path d="M110 574 V380 M96 574 L110 470 L124 574 M100 520 H120 M104 470 H116" stroke="#0a0c0b" stroke-width="4" fill="none"/>
    <circle cx="110" cy="378" r="3" fill="#ff5a3a"/>
    <path d="M420 590 V430 M408 590 L420 500 L432 590" stroke="#0a0c0b" stroke-width="4" fill="none"/>
    <circle cx="420" cy="428" r="3" fill="#ffd27a"/>
    <path d="M150 640 H370 M170 680 H350" stroke="#b3975f" stroke-opacity=".12" stroke-width="2"/></svg>`;
  const over = await svg(m, W, H).png().toBuffer();
  await save(rel, sharp(bg).composite([{ input: over }]), { quality: rel.includes('login-cathedral.webp') ? 70 : 74 });
}

// ─── App-Symbole ─────────────────────────────────────────────────────────────

const iconSvg = (S, maskable) => {
  const c = S / 2;
  const R = maskable ? S * 0.3 : S * 0.38;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><defs>${DEFS}</defs>
    ${maskable ? `<rect width="${S}" height="${S}" fill="#120e0a"/>` : `<rect width="${S}" height="${S}" rx="${S * 0.16}" fill="#120e0a"/>`}
    <circle cx="${c}" cy="${c}" r="${R}" fill="#1b1610" stroke="url(#brass)" stroke-width="${f2(R * 0.13)}"/>
    <circle cx="${c}" cy="${c}" r="${f2(R * 0.87)}" fill="none" stroke="#2a1f10" stroke-width="${f2(R * 0.025)}"/>
    ${compassStar(c, c, R * 0.8)}</svg>`;
};

async function icons() {
  await save('icons/icon-192.png', svg(iconSvg(192, false), 192, 192).flatten({ background: '#000' }), { png: true });
  await save('icons/icon-512.png', svg(iconSvg(512, false), 512, 512).flatten({ background: '#000' }), { png: true });
  await save('icons/maskable-512.png', svg(iconSvg(512, true), 512, 512), { png: true });
  // Favicon src/app/icon.svg – liegt außerhalb von public/ (im Paketordner unter _src/app/icon.svg)
  if (wanted('_src')) {
    const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1c4"/>
      <stop offset=".45" stop-color="#e0b95c"/>
      <stop offset="1" stop-color="#7a5c2c"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="10" fill="#120e0a"/>
  <circle cx="32" cy="32" r="25" fill="#1b1610" stroke="url(#g)" stroke-width="4"/>
  ${compassStar(32, 32, 21, { light: '#fff1c4', dark: '#a07a38', edge: '#2a1f10' })}
</svg>
`;
    const file = outFile('_src/app/icon.svg');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fav);
    written.push(`${'_src/app/icon.svg'.padEnd(34)} 64x64 (SVG)  ${(fav.length / 1024).toFixed(1)} KB`);
  }
}

// ─── Ablauf ──────────────────────────────────────────────────────────────────

const jobs = [
  ['ui/banner-emblem.webp', banner],
  ['ui/emblem-winged.webp', wingedEmblem],
  ['ui/seal-ribbon.webp', seal],
  ['ui/sentinel.webp', drone],
  ['ui/corner-', corners],
  ['ui/header-band.webp', headerBand],
  ['ui/header-niches-l.webp', headerNiche],
  ['ui/metal-tile.webp', metalTile],
  ['ui/space-bg.webp', spaceBg],
  ['ui/backdrop.webp', backdrop],
  ['ui/cathedral.webp', () => scene('ui/cathedral.webp', 520, 780)],
  ['ui/login-cathedral-sm.webp', () => scene('ui/login-cathedral-sm.webp', 1024, 1536)],
  ['ui/login-cathedral.webp', () => scene('ui/login-cathedral.webp', 1920, 2880)],
  ['art/planets/', planetPortraits],
  ['ui/land/', landscapes],
  ['icons/', icons],
];
for (const [key, fn] of jobs) if (!ONLY || key.startsWith(ONLY) || ONLY.startsWith(key) || (ONLY === '_src' && key === 'icons/')) await fn();
console.log(written.join('\n'));
console.log(`${written.length} Dateien in ${path.relative(ROOT, OUT)}/`);
