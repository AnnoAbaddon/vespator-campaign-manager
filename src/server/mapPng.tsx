import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { Locale } from '@/i18n/core';
import { contextLocale } from './locale';
import { MapSvg, MAP_W } from '@/components/map/MapSvg';
import type { CampaignState } from '@/engine/types';
import { planetArtEnabled } from '@/server/db';

// react-dom/server darf im App Router nicht statisch importiert werden; zur Laufzeit laden (MapSvg kommt ohne Hooks aus)
const runtimeRequire = createRequire(path.join(process.cwd(), 'package.json'));
function renderToStaticMarkup(el: React.ReactElement): string {
  return (runtimeRequire('react-dom/server') as typeof import('react-dom/server')).renderToStaticMarkup(el);
}

const FONT = path.join(process.cwd(), 'assets', 'fonts', 'ShareTechMono-Regular.ttf');
const PUBLIC = path.join(process.cwd(), 'public');

/**
 * Planetenporträts als Data-URI: resvg lädt keine externen Dateien und kann kein WebP, daher als PNG
 * (verkleinert, zwischengespeichert). Für den SVG-Download reicht das Original-WebP.
 */
const artCache = new Map<string, Promise<string | null>>();
function artDataUri(src: string, png: boolean): Promise<string | null> {
  const key = `${png ? 'png' : 'webp'}:${src}`;
  let p = artCache.get(key);
  if (!p) {
    const file = path.join(PUBLIC, path.normalize(src).replace(/^([/\\])+/, ''));
    p = (async () => {
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return null;
      if (!png) return `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}`;
      const buf = await sharp(file).resize(192, 192, { fit: 'cover' }).png().toBuffer();
      return `data:image/png;base64,${buf.toString('base64')}`;
    })().catch(() => null);
    artCache.set(key, p);
  }
  return p;
}

/** Ersetzt die Bildverweise (href="/art/…") durch eingebettete Daten */
async function inlineImages(svg: string, png: boolean): Promise<string> {
  const srcs = [...new Set([...svg.matchAll(/href="(\/art\/[^"]+)"/g)].map((m) => m[1]))];
  const uris = await Promise.all(srcs.map((s) => artDataUri(s, png)));
  srcs.forEach((s, i) => {
    const uri = uris[i];
    // Ohne Bild bleibt nichts Kaputtes stehen: Verweis entfernen
    svg = svg.split(`href="${s}"`).join(uri ? `href="${uri}"` : 'href=""');
  });
  return svg;
}

/** Rendert die Karte als SVG-String (ohne CSS-Variablen, Bilder eingebettet, für externe Renderer) */
export async function mapSvgString(state: CampaignState, opts: { print?: boolean; png?: boolean; locale?: Locale } = {}): Promise<string> {
  const pts = state.pointsHistory.length ? state.pointsHistory[state.pointsHistory.length - 1].points : null;
  let svg = renderToStaticMarkup(createElement(MapSvg, { state, points: pts, print: opts.print, planetImages: planetArtEnabled() /* Einstellung „Planetenbilder verwenden“ (N6) gilt auch für den Export */, locale: opts.locale ?? contextLocale(state.meta.locale) }));
  svg = svg
    .replace(/font-family:[^;"]*;?/g, "font-family:'Share Tech Mono';")
    .replace(/var\(--font-techmono\)/g, 'Share Tech Mono')
    .replace(/context-stroke/g, '#e0b95c');
  return inlineImages(svg, !!opts.png);
}

export async function mapPng(state: CampaignState, opts: { print?: boolean; scale?: number; locale?: Locale } = {}): Promise<Buffer> {
  const svg = await mapSvgString(state, { ...opts, png: true });
  const hasFont = fs.existsSync(FONT);
  const r = new Resvg(svg, {
    background: opts.print ? '#ffffff' : (state.map?.background ?? '#071b18'),
    fitTo: { mode: 'width', value: Math.round(MAP_W * (opts.scale ?? 2)) },
    font: { fontFiles: hasFont ? [FONT] : [], loadSystemFonts: !hasFont, defaultFontFamily: 'Share Tech Mono' },
  });
  return r.render().asPng();
}
