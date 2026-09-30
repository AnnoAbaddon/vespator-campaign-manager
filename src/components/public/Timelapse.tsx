'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { CampaignState, Fleet, PlanetState } from '@/engine/types';
import { FLEET_WEDGE, MapSvg, compactSize } from '@/components/map/MapSvg';
import { usePortraitMap } from '@/components/map/usePortrait';
import { mapOf } from '@/engine/map';
import { usePlanetImages } from '@/components/map/planetImages';
import { useLocale, useT } from '@/i18n/client';
import type { T } from '@/i18n/core';
import { stageLabel } from '@/components/stageLabel';
import { intlLocale, toLocale } from '@/i18n/core';

/** Schlanker Stand je Bild des Zeitraffers */
export interface TimelapseFrame {
  label: string;
  /** Zeitpunkt des Stands (ISO) */
  at?: string;
  /** Kampagnenstufe des Stands (für den aktuellen Stand: Phase und Schritt) */
  stage?: CampaignState['stage'];
  planets: PlanetState[];
  fleets: Pick<Fleet, 'id' | 'allianceId' | 'name' | 'planetId' | 'commanders'>[];
  points: Record<string, number> | null;
}

export interface TimelapseData {
  base: Pick<CampaignState, 'map' | 'alliances' | 'meta'>;
  frames: TimelapseFrame[];
}

/** Bildbeschriftungen kommen deutsch vom Server (Kampagnenstart, Ende Phase n, Aktuell …) */
function frameLabel(t: T, s: string): string {
  const end = /^Ende Phase (\d+)$/.exec(s);
  if (end) return t('Ende Phase {n}', { n: end[1] });
  const now = /^Aktuell \(Phase (\d+)\)$/.exec(s);
  if (now) return t('Aktuell (Phase {n})', { n: now[1] });
  return t(s);
}

/** Datum eines Stands in der Zeitzone der Kampagne (kurz: ohne Jahr); leer bei fehlender Angabe */
export function frameDate(iso: string | undefined, locale: string, timeZone?: string, short = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', ...(short ? {} : { year: 'numeric' }) };
  const loc = intlLocale(toLocale(locale));
  try {
    return d.toLocaleDateString(loc, { ...opts, timeZone: timeZone || undefined });
  } catch {
    return d.toLocaleDateString(loc, opts);
  }
}

/** Sekunden je Übergang bei Tempo 1 */
const SECONDS_PER_STEP = 2.5;
/** Bildrate des Videos */
const FPS = 30;

/** Zeitplan des Videos: feste Schrittweite je Bild, abhängig vom Tempo (unabhängig von der Rechenzeit) */
export function recordingPlan(steps: number, speed: number, fps = FPS) {
  const frames = Math.max(1, Math.round((Math.max(1, steps) * SECONDS_PER_STEP * fps) / speed));
  return { frames, posAt: (k: number) => Math.min(steps, (k / frames) * steps), frameMs: 1000 / fps };
}

// ─── Einbetten für die Aufnahme ─────────────────────────────────────────────
// Ein SVG, das als Bild gezeichnet wird, lädt keine externen Dateien und kennt die CSS-Variablen der Seite nicht.
// Daher werden Bilder und Schriften vor dem Serialisieren als Data-URI eingebettet.

const blobToDataUri = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

async function fetchDataUri(url: string, cache: Map<string, string | null>): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!;
  let v: string | null = null;
  try {
    const r = await fetch(url);
    if (r.ok) v = await blobToDataUri(await r.blob());
  } catch {
    v = null;
  }
  cache.set(url, v);
  return v;
}

/** @font-face-Regeln der Seite für die genutzten Schriftfamilien, mit eingebetteten Schriftdateien */
async function fontFaceCss(families: string[], cache: Map<string, string | null>): Promise<string> {
  const want = new Set(families.map((f) => f.replace(/['"]/g, '').trim()));
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(list)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const fam = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
      if (!want.has(fam)) continue;
      let css = rule.cssText;
      for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        const abs = new URL(m[1], sheet.href ?? location.href).href;
        const uri = await fetchDataUri(abs, cache);
        if (uri) css = css.split(m[0]).join(`url("${uri}")`);
      }
      rules.push(css);
    }
  }
  return rules.join('\n');
}

/** CSS-Variablen der Schriften (next/font) in echte Familiennamen auflösen */
function resolveFontVars(xml: string): { xml: string; families: string[] } {
  const root = getComputedStyle(document.documentElement);
  const families = new Set<string>();
  const out = xml.replace(/var\((--font-[a-z-]+)\)/g, (_, v: string) => {
    const val = root.getPropertyValue(v).trim();
    for (const f of val.split(',')) if (f.trim()) families.add(f.trim());
    return val || 'serif';
  });
  return { xml: out, families: [...families] };
}

/**
 * Zeitraffer (N3.2): animiert die Karte über alle Phasen-Snapshots. Power Level blenden weich über,
 * Flotten fliegen zum neuen Planeten. Export als WebM direkt im Browser (Canvas + MediaRecorder).
 */
export function Timelapse({ data, autoplay = false, compact = false, framed = true }: { data: TimelapseData; autoplay?: boolean; compact?: boolean; framed?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const planetImages = usePlanetImages();
  const { frames, base } = data;
  const last = Math.max(0, frames.length - 1);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(autoplay && frames.length > 1);
  const [speed, setSpeed] = useState(1);
  // Handy: gewählter Planet, dessen Allianzwerte eingeblendet werden
  const [selected, setSelected] = useState<string | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const svgBox = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const cancel = useRef(false);
  const [box, setBox] = useState({ w: 1000, h: 700 });
  // Hochformat nur auf Handys (Fenster < 1024 px) – auf dem Desktop bleibt die Buchausrichtung (wie CampaignMap)
  const portrait = usePortraitMap(box.w, box.h);
  // Zeichenfläche im Seitenverhältnis des Schirms: das Planetennetz nutzt die ganze Höhe
  const aspect = Math.round((box.h / Math.max(1, box.w)) * 100) / 100;

  useEffect(() => {
    const el = svgBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Beim Verlassen der Seite läuft keine Aufnahme weiter
  useEffect(
    () => () => {
      cancel.current = true;
    },
    [],
  );

  // Abspielen: 2,5 s je Übergang bei Tempo 1
  useEffect(() => {
    if (!playing) return;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      setPos((p) => {
        const n = p + (dt * speed) / SECONDS_PER_STEP;
        if (n >= last) {
          setPlaying(false);
          return last;
        }
        return n;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, last]);

  const view = useMemo(() => {
    const i = Math.min(Math.floor(pos), last);
    const j = Math.min(i + 1, last);
    const f = pos - i;
    const a = frames[i];
    const b = frames[j];
    const planets = a.planets.map((p) => {
      const q = b.planets.find((x) => x.id === p.id) ?? p;
      const power: Record<string, number> = {};
      for (const al of base.alliances) power[al.id] = (p.power[al.id] ?? 0) + ((q.power[al.id] ?? 0) - (p.power[al.id] ?? 0)) * f;
      return { ...(f < 0.5 ? p : q), power };
    });
    const motion: { fleetId: string; from: string; to: string; t: number }[] = [];
    const fleets = (f < 0.5 ? a : b).fleets.map((fl) => {
      const fa = a.fleets.find((x) => x.id === fl.id);
      const fb = b.fleets.find((x) => x.id === fl.id);
      if (fa?.planetId && fb?.planetId && fa.planetId !== fb.planetId && f > 0 && f < 1) motion.push({ fleetId: fl.id, from: fa.planetId, to: fb.planetId, t: f });
      return fl;
    });
    const state = { ...base, planets, fleets, battles: [], pointsHistory: [] } as unknown as CampaignState;
    return { state, motion, label: frameLabel(t, f < 0.5 ? a.label : b.label), points: (f < 0.5 ? a : b).points };
  }, [pos, frames, base, last, t]);

  /**
   * Nimmt die Animation von Anfang bis Ende als WebM auf. Jedes Bild wird einzeln gezeichnet und mit fester
   * Schrittweite (nach Tempo) an den Rekorder übergeben – das Video hat dadurch immer dieselbe Länge,
   * auch wenn das Zeichnen länger dauert.
   */
  const record = async () => {
    if (!svgBox.current?.querySelector('svg') || typeof MediaRecorder === 'undefined') return;
    const { w: W, h: H } = compactSize(portrait, aspect);
    const canvas = document.createElement('canvas');
    const scale = 1280 / Math.max(W, H);
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale) + 80;
    const g = canvas.getContext('2d')!;
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    const cache = new Map<string, string | null>();
    let fontCss: string | null = null;
    cancel.current = false;
    setPlaying(false);
    setRecording(0);
    const plan = recordingPlan(last, speed);
    const bg = base.map.background ?? '#071b18';
    const t0 = performance.now();
    try {
      rec.start();
      for (let k = 0; k <= plan.frames + FPS && !cancel.current; k++) {
        const p = plan.posAt(k);
        flushSync(() => setPos(p));
        const el = svgBox.current?.querySelector('svg');
        if (!el) break;
        // Bilder (Planetenporträts) als Data-URI, Schriften aufgelöst und eingebettet
        const clone = el.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('width', String(W));
        clone.setAttribute('height', String(H));
        for (const img of Array.from(clone.querySelectorAll('image'))) {
          const href = img.getAttribute('href');
          if (!href || href.startsWith('data:')) continue;
          const uri = await fetchDataUri(new URL(href, location.href).href, cache);
          if (uri) img.setAttribute('href', uri);
        }
        const resolved = resolveFontVars(new XMLSerializer().serializeToString(clone));
        if (fontCss === null) fontCss = await fontFaceCss(resolved.families, cache);
        const xml = fontCss ? resolved.xml.replace(/(<svg[^>]*>)/, `$1<style>${fontCss.replace(/</g, '\\3c ')}</style>`) : resolved.xml;
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
        await img.decode().catch(() => undefined);
        if (cancel.current) break;
        // Bild zusammensetzen: Karte, Titelzeile, Kampagnenpunkte
        // Taktischer Schirm: Kartengrund mit feinem Raster, oben ein Stahlband mit Messingkante
        g.fillStyle = bg;
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.strokeStyle = 'rgba(55,104,91,0.14)';
        g.lineWidth = 1;
        g.beginPath();
        for (let gx = 0; gx < canvas.width; gx += 48) {
          g.moveTo(gx + 0.5, 80);
          g.lineTo(gx + 0.5, canvas.height);
        }
        for (let gy = 80; gy < canvas.height; gy += 48) {
          g.moveTo(0, gy + 0.5);
          g.lineTo(canvas.width, gy + 0.5);
        }
        g.stroke();
        g.fillStyle = '#151918';
        g.fillRect(0, 0, canvas.width, 80);
        g.fillStyle = '#b3975f';
        g.fillRect(0, 78, canvas.width, 2);
        g.drawImage(img, 0, 80, canvas.width, canvas.height - 80);
        const fr = frames[Math.min(last, Math.round(p))];
        g.fillStyle = '#e8dfc9';
        g.font = 'bold 28px Cinzel, serif';
        g.textBaseline = 'alphabetic';
        g.fillText(`${base.meta.name} – ${frameLabel(t, fr.label)}`, 24, 36);
        if (fr.points) {
          let x = 24;
          g.font = '22px "Share Tech Mono", monospace';
          for (const al of base.alliances) {
            g.fillStyle = al.color;
            g.fillRect(x, 50, 16, 16);
            g.fillStyle = '#e8dfc9';
            const label = `${al.name} ${fr.points[al.id] ?? '–'}`;
            g.fillText(label, x + 22, 66);
            x += 22 + g.measureText(label).width + 28;
          }
        }
        // feste Taktung: Bild k erscheint zum Zeitpunkt k / fps
        const wait = t0 + k * plan.frameMs - performance.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        track.requestFrame?.();
        if (k % FPS === 0) setRecording(Math.min(100, Math.round((k / plan.frames) * 100)));
      }
    } finally {
      if (rec.state !== 'inactive') rec.stop();
      await done;
      for (const tr of stream.getTracks()) tr.stop();
      setRecording(null);
    }
    if (cancel.current) return;
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base.meta.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${t('zeitraffer')}.webm`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Erst nach dem Start des Downloads freigeben
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // Marken der Zeitleiste: bei wenigen Ständen mit Datum, damit „Start“ und „Jetzt“ zeitlich verortet sind
  const withDates = frames.length <= 4;
  const shortLabel = (f: TimelapseFrame, k: number) => {
    const n = /Phase (\d+)/.exec(f.label)?.[1];
    const base = k === 0 ? t('Start') : /^Aktuell/.test(f.label) ? t('Jetzt') : n ? `P${n}` : String(k);
    const d = withDates ? frameDate(f.at, locale, data.base.meta.timezone, true) : '';
    return d ? `${base} ${d}` : base;
  };
  /** Zusatz zum aktuellen Bild: Datum; beim laufenden Stand zusätzlich Phase und Schritt */
  const frameInfo = (f: TimelapseFrame) => {
    const parts = [frameDate(f.at, locale, data.base.meta.timezone)];
    if (/^Aktuell/.test(f.label) && f.stage) parts.push(stageLabel({ stage: f.stage, meta: data.base.meta } as CampaignState, t));
    return parts.filter(Boolean).join(' · ');
  };

  const pointsEl = view.points ? (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1" aria-label={t('Kampagnenpunkte')}>
      {base.alliances.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1.5 text-[15px] lg:text-[17px]">
          <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_6px_currentColor]" style={{ background: a.color, color: a.color }} />
          <span className="text-ink">{a.name}</span>
          <b className="font-mono text-ink">{view.points![a.id] ?? '–'}</b>
        </span>
      ))}
    </span>
  ) : null;

  // Karteneinheiten je Bildschirmpixel, wie in der Kampagnenkarte
  const csz = compactSize(portrait, aspect);
  const unit = Math.max(0.8, csz.w / Math.max(1, box.w), csz.h / Math.max(1, box.h));
  // Schmale Karte (Handy): nur Name, Machtring und Flotten; Allianzwerte erst nach Antippen eines Planeten
  const sparse = box.w < 560;
  const selPlanet = sparse && selected ? view.state.planets.find((p) => p.id === selected) : null;
  const selName = selPlanet ? (mapOf(view.state).planets.find((p) => p.id === selPlanet.id)?.name ?? selPlanet.id) : null;
  const mapEl = (
    <MapSvg
      state={view.state}
      variant="compact"
      portrait={portrait}
      aspect={aspect}
      unit={unit}
      fleetMotion={view.motion}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      locale={locale}
      planetImages={planetImages}
      dense={!sparse || recording !== null}
      selected={sparse && recording === null ? selected : null}
      onPlanet={sparse ? (id) => setSelected((s) => (s === id ? null : id)) : undefined}
    />
  );

  if (compact) {
    if (frames.length < 2) return <p className="text-sm text-faint">{t('Der Zeitraffer braucht mindestens den Kampagnenstart und eine abgeschlossene Phase.')}</p>;
    // Präsentationsmodus: nur der Schirm mit Beschriftung, ohne Bedienung
    return (
      <div className="screen relative h-full">
        <div ref={svgBox} className="absolute inset-0">
          <MapSvg
            state={view.state}
            variant="compact"
            portrait={portrait}
            aspect={aspect}
            unit={unit}
            fleetMotion={view.motion}
            preserveAspectRatio="xMidYMid meet"
            className="block h-full w-full"
            locale={locale}
            planetImages={planetImages}
          />
        </div>
        <div className="pointer-events-none absolute left-3 top-3 z-[1] flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-display text-2xl font-bold text-ink [text-shadow:0_2px_4px_#000] lg:text-4xl">{view.label}</span>
          {pointsEl}
        </div>
      </div>
    );
  }

  const busy = recording !== null;
  const frameIdx = Math.min(last, Math.round(pos));
  const single = frames.length === 1;

  // `framed`: eigenes Gehäuse mit Messingschild (Admin); in der Leseansicht liefert die Hülle das Gehäuse
  const Wrap = framed ? 'section' : 'div';
  return (
    <Wrap className={framed ? 'hud frame flex h-full min-h-0 flex-col gap-2 p-2 pt-6 sm:p-3 sm:pt-7' : 'flex h-full min-h-0 flex-col gap-2'} aria-label={framed ? t('Zeitraffer') : undefined}>
      {framed && <span className="plate plate-head">{t('Zeitraffer')}</span>}
      {frames.length === 0 ? (
        <div className="screen relative z-[1] grid flex-1 place-items-center p-6">
          <p className="max-w-md text-center text-[16px] text-dim">{t('Der Zeitraffer braucht mindestens den Kampagnenstart und eine abgeschlossene Phase.')}</p>
        </div>
      ) : (
        <>
          {/* Aktueller Zeitpunkt: großer Titel, Stand x von n, Kampagnenpunkte */}
          <div className="relative z-[1] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-display text-[20px] font-bold leading-tight text-[#f3e2b4] [text-shadow:0_1px_0_#000] lg:text-[26px]" aria-live="polite">
                {view.label}
              </span>
              <span className="font-mono text-[13px] text-dim sm:text-[14px]">
                {t('Stand {n} von {m}', { n: frameIdx + 1, m: frames.length })}
                {frameInfo(frames[frameIdx]) ? ` · ${frameInfo(frames[frameIdx])}` : ''}
              </span>
            </p>
            {pointsEl}
          </div>
          <div ref={svgBox} className="screen relative z-[1] min-h-0 flex-1">
            {mapEl}
            {single && (
              <p className="absolute inset-x-3 bottom-3 z-[2] mx-auto max-w-lg rounded-[2px] border border-brass/50 bg-[#0d1110]/92 px-3 py-2 text-center text-[15px] text-ink shadow-[0_4px_14px_rgba(0,0,0,0.7)]">
                {t('Bisher gibt es nur diesen einen Stand. Nach jeder abgeschlossenen Phase kommt ein Bild hinzu; ab zwei Ständen lässt sich der Verlauf abspielen.')}
              </p>
            )}
          </div>
          {/* Handy: Hinweis bzw. Allianzwerte des gewählten Planeten als feste Zeile unter dem Schirm – verdeckt keine Planeten */}
          {sparse && !single && (
            <p className="relative z-[1] flex h-6 min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap px-1 text-[14px]" aria-live="polite">
              {selPlanet ? (
                <>
                  <span className="truncate font-display font-bold uppercase text-ink">{selName}</span>
                  {base.alliances.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
                      <span className="sr-only">{a.name}</span>
                      <b className="font-mono text-ink">{Math.round(selPlanet.power[a.id] ?? 0)}</b>
                    </span>
                  ))}
                </>
              ) : (
                // Kurzlegende der Kartenzeichen; Allianzwerte erst nach Antippen eines Planeten
                <>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-ink">
                    <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-brass bg-[#0a0806]">
                      <svg viewBox="-0.5 -0.5 1 1" width={11} height={11}>
                        <path d={FLEET_WEDGE} fill="#b3975f" />
                      </svg>
                    </span>
                    {t('Flotte')}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-ink">
                    <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-brass/80" />
                    {t('Ring = Power Level')}
                  </span>
                  <span className="min-w-0 truncate text-[13px] text-dim">{t('Antippen: Werte')}</span>
                </>
              )}
            </p>
          )}
          {/* Bedienpult: Zeitleiste mit Phasenmarken, darunter Wiedergabe + Tempo als Gruppe und abgesetzt der Videoexport */}
          {!single && (
            <div className="no-print inset relative z-[1] space-y-1 p-1.5 @container sm:space-y-1.5 sm:p-2">
              <div className="px-1">
                <input
                  type="range"
                  min={0}
                  max={last}
                  step={0.01}
                  value={pos}
                  disabled={busy}
                  onChange={(e) => (setPlaying(false), setPos(Number(e.target.value)))}
                  className="scrub block w-full"
                  style={{ '--scrub-pct': `${(pos / Math.max(1, last)) * 100}%` } as React.CSSProperties}
                  aria-label={t('Zeitpunkt')}
                  aria-valuetext={view.label}
                />
                {/* Phasenmarken: je Stand ein Strich mit Beschriftung, der aktuelle hervorgehoben */}
                <div className="relative h-6 sm:h-7" aria-hidden>
                  {frames.map((f, k) => {
                    const on = k === frameIdx;
                    const edge = k === 0 ? 'translate-x-0 items-start' : k === last ? '-translate-x-full items-end' : '-translate-x-1/2 items-center';
                    return (
                      <span key={k} className={`absolute top-0 flex flex-col ${edge}`} style={{ left: k === 0 ? 0 : k === last ? '100%' : `calc(9px + (100% - 18px) * ${k / Math.max(1, last)})` }}>
                        <span className={`mx-[8px] h-2 w-0.5 ${on ? 'bg-accent shadow-[0_0_6px_#dda94d]' : 'bg-brass-dark'}`} />
                        <span className={`whitespace-nowrap font-mono text-[13px] leading-5 ${on ? 'font-bold text-[#f3e2b4]' : 'text-dim'}`}>{shortLabel(f, k)}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 sm:gap-x-2">
                <div className="flex items-center gap-1 sm:gap-1.5" role="group" aria-label={t('Wiedergabe')}>
                  <button
                    type="button"
                    className="btn btn-primary min-h-11 min-w-11 px-2 @[340px]:min-w-[6.25rem] sm:min-w-[8.5rem] sm:px-2.5 lg:min-h-0"
                    disabled={busy}
                    aria-label={playing ? t('Pause') : pos >= last ? t('Nochmal') : t('Abspielen')}
                    onClick={() => (pos >= last ? (setPos(0), setPlaying(true)) : setPlaying((p) => !p))}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                      {playing ? <path d="M4 2.5h2.5v11H4zM9.5 2.5H12v11H9.5z" fill="currentColor" /> : <path d="M4 2.5v11l9-5.5z" fill="currentColor" />}
                    </svg>
                    {/* sehr schmales Pult: nur Symbol, Beschriftung über aria-label */}
                    <span className="hidden @[340px]:inline">{playing ? t('Pause') : pos >= last ? t('Nochmal') : t('Abspielen')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn min-h-11 w-11 px-0 lg:min-h-0 lg:w-10"
                    disabled={busy || frameIdx === 0}
                    onClick={() => (setPlaying(false), setPos(Math.max(0, Math.ceil(pos) - 1)))}
                    aria-label={t('Ein Bild zurück')}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                      <path d="M3 2.5h2v11H3zM13 2.5v11L6 8z" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn min-h-11 w-11 px-0 lg:min-h-0 lg:w-10"
                    disabled={busy || pos >= last}
                    onClick={() => (setPlaying(false), setPos(Math.min(last, Math.floor(pos) + 1)))}
                    aria-label={t('Ein Bild vor')}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                      <path d="M11 2.5h2v11h-2zM3 2.5v11L10 8z" fill="currentColor" />
                    </svg>
                  </button>
                  <span className="mx-1 hidden h-7 w-px bg-line sm:block" aria-hidden />
                  {/* Tempo: mobil eine Taste (wechselt reihum), sonst drei Tasten */}
                  <button
                    type="button"
                    className="btn min-h-11 min-w-12 px-2 font-mono sm:hidden"
                    disabled={busy}
                    onClick={() => setSpeed((v) => (v === 0.5 ? 1 : v === 1 ? 2 : 0.5))}
                    aria-label={t('Tempo: {v}', { v: t(speed === 0.5 ? 'langsam' : speed === 1 ? 'normal' : 'schnell') })}
                  >
                    {speed === 0.5 ? '0,5×' : `${speed}×`}
                  </button>
                  <span className="hidden items-center gap-1 sm:inline-flex" role="group" aria-label={t('Tempo')}>
                    <span className="mr-0.5 text-[14px] text-dim">{t('Tempo')}</span>
                    {(
                      [
                        [0.5, 'langsam'],
                        [1, 'normal'],
                        [2, 'schnell'],
                      ] as const
                    ).map(([v, l]) => (
                      <button key={v} type="button" className="btn btn-sm px-2" aria-pressed={speed === v} disabled={busy} onClick={() => setSpeed(v)}>
                        {t(l)}
                      </button>
                    ))}
                  </span>
                </div>
                {/* Videoexport räumlich abgesetzt */}
                <div className="ml-auto flex items-center gap-2 sm:border-l sm:border-line/70 sm:pl-3">
                  {recording === null ? (
                    <button type="button" className="btn btn-sm min-h-11 px-2 sm:px-3 lg:min-h-0" onClick={record} title={t('Nimmt den Zeitraffer auf und lädt ihn als WebM-Video herunter')}>
                      <span className="lamp" aria-hidden />
                      <span className="sm:hidden">{t('Video')}</span>
                      <span className="hidden sm:inline">{t('Als Video (WebM)')}</span>
                    </button>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-[14px] text-ink" role="status">
                        <span className="lamp lamp-alert" aria-hidden />
                        {t('Nimmt auf … {n} %', { n: recording })}
                      </span>
                      <button type="button" className="btn btn-sm btn-ghost min-h-11 lg:min-h-0" onClick={() => (cancel.current = true)}>
                        {t('Abbrechen')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Wrap>
  );
}
