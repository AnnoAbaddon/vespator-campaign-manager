'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { compactSize, fullContentBounds, MAP_H, MAP_W, MapSvg, type MapSvgProps, type Reserve } from './MapSvg';
import { useLocale, useT } from '@/i18n/client';
import { GameIcon } from '@/components/icons/GameIcon';
import { INFRA_ICON } from '@/components/icons/registry';
import { PlanetPortrait } from './PlanetArt';
import { usePlanetImages } from './planetImages';
import { CloseIcon, HandIcon } from '@/components/icons';
import { mapOf, planetDef } from '@/engine/map';
import { usePortraitMap } from './usePortrait';

/** Mindestmaßstab der Detailkarte beim Start (Bildschirmpixel je Karteneinheit): Namen ≈ 16 px, PL-Ziffern ≈ 12 px, Rasterzellen ≈ 26 px */
const DETAIL_MIN_SCALE = 0.72;

type VB = { x: number; y: number; w: number; h: number };

/**
 * Interaktive Karte. Standard ist die Übersicht, die sich an die verfügbare Fläche anpasst
 * (auf schmalen Bildschirmen hochkant), sodass sie ohne Zoomen lesbar ist.
 * Die Detailkarte (Regelbuch-Stil) und Zoom/Pan bleiben als Option.
 * Die Werkzeugleiste steht als eigene Zeile über der Zeichenfläche und verdeckt nie Karteninhalte.
 * `fit`: Karte füllt die Höhe des Elternelements statt der Breite. `controls = false`: ohne Bedienleiste (Präsentation).
 */
export function CampaignMap(props: MapSvgProps & { fit?: boolean; controls?: boolean }) {
  const { fit, controls = true, ...mapProps } = props;
  const t = useT();
  const locale = useLocale();
  const planetImages = usePlanetImages();
  const [detail, setDetail] = useState(false);
  const [list, setList] = useState(false);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  // Verschiebehinweis verschwindet nach der ersten Bedienung der Karte
  const [touched, setTouched] = useState(false);
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // Hochformat nur auf Handys (Fenster < 1024 px) – auf dem Desktop bleibt immer die Buchausrichtung
  const portraitArea = usePortraitMap(size.w, size.h);
  const portrait = !detail && portraitArea;
  // Seitenverhältnis der Zeichenfläche (ohne Werkzeugleiste); die Übersicht füllt damit die verfügbare Höhe
  const aspect = fit ? Math.round((size.h / Math.max(1, size.w)) * 100) / 100 : 0.7;
  const dims = detail ? { w: MAP_W, h: MAP_H } : compactSize(portrait, aspect);
  // Detailmodus: eigene Einpassung auf die engen Inhaltsumrisse im Seitenverhältnis der Fläche;
  // der Start-Ausschnitt hält eine Mindestgröße für Schilder und Raster und lässt sich verschieben/zoomen.
  const bounds = fullContentBounds(props.state);
  // Start-Ausschnitt: auf den gewählten Planeten zentriert (sonst Mitte der Inhalte), ohne über die Inhaltsränder zu laufen
  const focus = props.selected ? planetDef(props.selected) : null;
  const fitBox = (minScale: number): VB => {
    let w = Math.max(bounds.w, bounds.h / aspect);
    if (minScale && size.w / w < minScale) w = size.w / minScale;
    const h = w * aspect;
    const cx = focus && w < bounds.w ? Math.min(bounds.x + bounds.w - w / 2, Math.max(bounds.x + w / 2, (focus.x / 100) * MAP_W)) : bounds.x + bounds.w / 2;
    // ohne Fokus oben bündig: die oberste Schilderreihe bleibt ganz sichtbar, der Rest ist per Verschieben erreichbar
    const cy = h >= bounds.h ? bounds.y + bounds.h / 2 : focus ? Math.min(bounds.y + bounds.h - h / 2, Math.max(bounds.y + h / 2, (focus.y / 100) * MAP_H)) : bounds.y + h / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };
  const FULL: VB = detail ? fitBox(0) : { x: 0, y: 0, ...dims };
  const START: VB = detail ? fitBox(DETAIL_MIN_SCALE) : FULL;
  const [vb, setVb] = useState<VB>(START);
  const drag = useRef<{ id: number; x: number; y: number; vb: VB; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; vb: VB } | null>(null);

  // Kartenschmuck des Schirms (Adler, Kenndaten, Kompass): die Übersicht hält dessen Ecken frei
  const [reserve, setReserve] = useState<Reserve[]>([]);
  // Größe der Zeichenfläche (unter der Werkzeugleiste) – Grundlage für Einpassung und Schriftgrößen
  useEffect(() => {
    const el = box.current ?? outer.current;
    if (!el) return;
    const measureDecor = () => {
      const decor = outer.current?.parentElement?.querySelector<HTMLElement>(':scope > .sector-decor');
      const r = el.getBoundingClientRect();
      const out: Reserve[] = [];
      if (decor && r.width > 0 && getComputedStyle(decor).display !== 'none') {
        for (const c of Array.from(decor.children)) {
          const d = c.getBoundingClientRect();
          if (!d.width || d.bottom <= r.top || d.top >= r.bottom) continue;
          const left = d.left + d.width / 2 < r.left + r.width / 2;
          const top = d.top + d.height / 2 < r.top + r.height / 2;
          const w = Math.round(left ? d.right - r.left + 6 : r.right - d.left + 6);
          const h = Math.round(top ? d.bottom - r.top + 4 : r.bottom - d.top + 4);
          if (w > 0 && h > 0) out.push({ corner: `${top ? 't' : 'b'}${left ? 'l' : 'r'}` as Reserve['corner'], w, h });
        }
      }
      setReserve((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
    };
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: fit ? e.contentRect.height : e.contentRect.width * 0.7 });
      measureDecor();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, list, detail]);

  // Bei Wechsel von Ausrichtung oder Kartentyp Ausschnitt zurücksetzen
  const dimKey = detail ? `d${Math.round(size.w / 24)}x${Math.round(size.h / 24)}|${Math.round(bounds.w)}` : `${dims.w}x${dims.h}`;
  const [vbKey, setVbKey] = useState(dimKey);
  if (vbKey !== dimKey) {
    setVbKey(dimKey);
    setVb(START);
  }

  // Karteneinheiten pro Bildschirmpixel (bei Zoom entsprechend kleiner)
  const scale = Math.max(vb.w / Math.max(1, size.w), fit ? vb.h / Math.max(1, size.h) : 0);
  const unit = Math.max(0.8, scale);
  const zoomed = detail || vb.w < dims.w - 1;

  const clamp = (v: VB): VB => {
    if (detail) {
      const w = Math.min(FULL.w, Math.max(220, v.w));
      const h = w * aspect;
      const cx = Math.min(bounds.x + bounds.w, Math.max(bounds.x, v.x + v.w / 2));
      const cy = Math.min(bounds.y + bounds.h, Math.max(bounds.y, v.y + v.h / 2));
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    }
    const w = Math.min(dims.w, Math.max(dims.w / 6, v.w));
    const h = (w / dims.w) * dims.h;
    return { w, h, x: Math.min(dims.w - w, Math.max(0, v.x)), y: Math.min(dims.h - h, Math.max(0, v.y)) };
  };

  // aktuelle Begrenzung für Handler, die nur einmal registriert werden (Mausrad) – sonst gälte die alte Kartengröße
  const clampRef = useRef(clamp);
  useLayoutEffect(() => {
    clampRef.current = clamp;
  });

  const zoomAt = (factor: number, cx = 0.5, cy = 0.5) => {
    setVb((v) => {
      const w = v.w * factor;
      const h = v.h * factor;
      return clampRef.current({ w, h, x: v.x + (v.w - w) * cx, y: v.y + (v.h - h) * cy });
    });
  };

  // Verschieben und Pinch: den Ausschnitt direkt am SVG setzen (ein Bild je Frame) und erst beim Loslassen
  // übernehmen – sonst zeichnet React die ganze Karte bei jeder Zeigerbewegung neu
  const live = useRef<VB | null>(null);
  const frame = useRef(0);
  const preview = (v: VB) => {
    live.current = v;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const l = live.current;
      const svg = box.current?.querySelector('svg');
      if (l && svg) svg.setAttribute('viewBox', `${l.x} ${l.y} ${l.w} ${l.h}`);
    });
  };
  const commit = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const l = live.current;
    live.current = null;
    if (!l) return;
    // DOM sofort auf den Endstand bringen (auch wenn React ihn für unverändert hält)
    box.current?.querySelector('svg')?.setAttribute('viewBox', `${l.x} ${l.y} ${l.w} ${l.h}`);
    setVb(l);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Mausrad zoomt nur mit Strg/Cmd oder nachdem die Karte angeklickt bzw. fokussiert wurde – sonst scrollt die Seite
  const engaged = useRef(false);
  useEffect(() => {
    const el = box.current;
    const root = outer.current;
    if (!el || !root) return;
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !engaged.current) return;
      e.preventDefault();
      setTouched(true);
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const away = (e: PointerEvent) => {
      if (!root.contains(e.target as Node)) engaged.current = false;
    };
    const leave = () => {
      if (!root.contains(document.activeElement)) engaged.current = false;
    };
    el.addEventListener('wheel', h, { passive: false });
    document.addEventListener('pointerdown', away, true);
    root.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('wheel', h);
      document.removeEventListener('pointerdown', away, true);
      root.removeEventListener('mouseleave', leave);
    };
  }, [list, detail, portrait]);

  const toggle = (
    <div className="inset inline-flex shrink-0 p-0.5" role="group" aria-label={t('Kartendarstellung')}>
      {(
        [
          ['map', 'Übersicht'],
          ['detail', 'Detail'],
          ['list', 'Liste'],
        ] as const
      ).map(([k, label]) => {
        const on = k === 'list' ? list : !list && (k === 'detail') === detail;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            className={`touch-44 min-h-8 rounded-[2px] px-2 text-[13px] font-semibold sm:px-3 sm:text-[14px] ${on ? 'bg-[linear-gradient(180deg,#2b2a22,#1e1d18)] text-[#f3e2b4] shadow-[inset_0_0_0_1px_#b3975f,0_0_8px_rgba(221,169,77,0.25)]' : 'text-dim hover:text-ink'}`}
            onClick={() => {
              setList(k === 'list');
              if (k !== 'list') setDetail(k === 'detail');
            }}
          >
            {t(label)}
          </button>
        );
      })}
    </div>
  );

  /** Kartenwerkzeug mit sichtbarer Beschriftung bei Zeiger oder Tastaturfokus */
  const tool = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <button
      type="button"
      className="map-tool btn btn-sm touch-44 w-9 px-0"
      onClick={() => {
        setTouched(true);
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      {icon}
      <span className="map-tip" aria-hidden>
        {label}
      </span>
    </button>
  );

  const panHint = t('Ziehen zum Verschieben');

  if (list) {
    const alliances = [...props.state.alliances].sort((a, b) => a.order - b.order);
    // gleiche Spalten für Kopf und Zeilen: Planet/System, je Allianz eine beschriftete Spalte, Infrastruktur (ab sm)
    const cols = { gridTemplateColumns: `minmax(0,1fr) repeat(${alliances.length}, 2.6rem)` };
    const colsWide = { gridTemplateColumns: `minmax(0,1fr) repeat(${alliances.length}, 3.4rem) 7.4rem` };
    const infraCell = (slots: (typeof props.state.planets)[number]['slots'], cls = '') => (
      <span className={`flex items-center gap-1 ${cls}`} aria-label={t('Infrastruktur')}>
        {slots.map((s, i) => {
          const al = s.infra ? alliances.find((a) => a.id === s.infra!.allianceId) : null;
          return (
            <span
              key={i}
              title={s.destroyed ? t('zerstört') : s.infra ? `${s.infra.type} · ${al?.name ?? ''}` : t('frei')}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border"
              style={{ background: s.destroyed ? '#3a1512' : '#0b1110', borderColor: s.destroyed ? '#e2685c' : al ? al.color : '#665333' }}
            >
              {s.destroyed ? <CloseIcon size={12} className="text-[#ec6454]" /> : s.infra ? <GameIcon name={INFRA_ICON[s.infra.type]} size={15} color={al?.color ?? '#b3975f'} /> : null}
            </span>
          );
        })}
      </span>
    );
    return (
      <div ref={outer} className={fit ? 'flex h-full flex-col' : ''}>
        <div className="map-toolbar no-print relative z-[2] flex shrink-0 flex-wrap items-center justify-end gap-1.5 px-1.5 pb-1.5 pt-1.5 sm:gap-2 sm:px-2 sm:pt-2">{toggle}</div>
        <div
          className={fit ? 'min-h-0 flex-1 overflow-y-auto px-2 pb-2' : 'px-2 pb-2'}
          tabIndex={fit ? 0 : undefined}
          role="region"
          aria-label={t('Planetenliste')}
          style={{ ['--list-cols' as string]: cols.gridTemplateColumns, ['--list-cols-wide' as string]: colsWide.gridTemplateColumns }}
        >
          {/* Spaltenkopf: bleibt beim Scrollen stehen */}
          <div className="map-list-head sticky top-0 z-[1] grid items-end gap-x-1.5 px-2 py-1.5 text-[13px] text-dim sm:gap-x-2" aria-hidden>
            <span className="font-serif">{t('Planet / System')}</span>
            {alliances.map((a) => (
              <span key={a.id} className="flex min-w-0 flex-col items-center leading-tight">
                <span className="inline-block h-1 w-5 rounded-full" style={{ background: a.color }} />
                <span className="max-w-full truncate">{a.name}</span>
              </span>
            ))}
            <span className="map-list-infra">{t('Infrastruktur')}</span>
          </div>
          <ul className="space-y-1">
            {mapOf(props.state).planets.map((def) => {
              const p = props.state.planets.find((x) => x.id === def.id)!;
              const fleets = props.state.fleets.filter((f) => f.planetId === def.id);
              const sel = props.selected === def.id;
              const hi = props.highlight?.includes(def.id);
              const ops = (props.arrows ?? []).filter((ar) => ar.to === def.id);
              const heat = props.heat?.[def.id] ?? 0;
              const extra = fleets.length > 0 || ops.length > 0 || heat > 0;
              return (
                <li key={def.id}>
                  <button
                    type="button"
                    onClick={() => props.onPlanet?.(def.id)}
                    aria-pressed={props.onPlanet ? sel : undefined}
                    className={`map-list-row hud grid w-full items-center gap-x-1.5 gap-y-1 sm:gap-x-2 px-2 py-1.5 text-left transition-shadow ${sel ? 'shadow-[inset_0_0_0_1px_#f3c768,0_0_14px_rgba(243,199,104,0.3)]' : hi ? 'shadow-[inset_0_0_0_1px_#dda94d]' : 'hover:shadow-[inset_0_0_0_1px_rgba(179,151,95,0.6)]'} ${p.destroyed ? 'opacity-70' : ''}`}
                  >
                    <span className="relative z-[1] flex min-w-0 items-center gap-2">
                      <span className="hidden shrink-0 sm:block">
                        <PlanetPortrait planetId={def.id} size={34} destroyed={p.destroyed} planetImages={planetImages} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block break-words font-display text-[15px] font-bold leading-tight sm:truncate ${sel ? 'text-[#f3e2b4]' : 'text-ink'}`}>{def.name}</span>
                        <span className="block truncate text-[13px] leading-tight text-dim">{p.destroyed ? t('zerstört') : def.system}</span>
                      </span>
                    </span>
                    {alliances.map((a) => {
                      const pl = p.power[a.id];
                      return (
                        <span
                          key={a.id}
                          title={`${a.name}: ${pl ?? '–'}`}
                          aria-label={`${a.name}: ${pl ?? '–'}`}
                          className="relative z-[1] inline-flex h-7 items-center justify-center rounded-[2px] bg-[#0c100f] font-mono text-[15px] font-bold shadow-[inset_0_0_0_1px_#4d3f27]"
                          style={{ color: pl ? '#efe4c8' : '#8a846f', borderBottom: `3px solid ${a.color}`, opacity: pl ? 1 : 0.75 }}
                        >
                          {pl ?? '–'}
                        </span>
                      );
                    })}
                    {infraCell(p.slots, 'map-list-infra relative z-[1]')}
                    {/* Folgezeile nur bei Inhalt: Flotten, Operationen, Umkämpft (mobil zusätzlich die Infrastruktur) */}
                    {(extra || p.slots.length > 0) && (
                      <span className={`map-list-extra relative z-[1] col-span-full flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] sm:pl-[42px] ${extra ? 'flex' : 'map-list-extra-mobile'}`}>
                        {infraCell(p.slots, 'map-list-infra-mobile')}
                        {fleets.length > 0 && (
                          <span className="inline-flex flex-wrap items-center gap-x-2 text-dim">
                            <GameIcon name="ui_FLEET" size={14} color="#b3975f" />
                            {fleets.map((f) => {
                              const al = alliances.find((a) => a.id === f.allianceId);
                              return (
                                <span key={f.id} className="inline-flex items-center gap-1">
                                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: al?.color }} />
                                  {f.name}
                                </span>
                              );
                            })}
                          </span>
                        )}
                        {ops.map((ar, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-0.5 w-4 shrink-0" style={{ background: ar.color }} />
                            <span className="text-ink">
                              {t(ar.label ?? 'Operation')}
                              {ar.from !== def.id ? ` ${t('von {planet}', { planet: planetDef(ar.from)?.name })}` : ''}
                              {ar.dashed ? ` ${t('(geplant)')}` : ''}
                            </span>
                          </span>
                        ))}
                        {heat > 0 && <span className="text-warn">{t('Umkämpft: {n} Schlacht(en)', { n: heat })}</span>}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div ref={outer} data-map-mode={detail ? 'detail' : 'overview'} className={`relative flex select-none flex-col ${fit ? 'h-full' : ''}`}>
      {/* Werkzeugleiste als eigene Zeile über der Zeichenfläche: verdeckt keine Beschriftungen */}
      {controls && (
        <div className="map-toolbar no-print relative z-[2] flex shrink-0 flex-wrap items-center justify-end gap-1.5 px-1.5 pb-1.5 pt-1.5 sm:gap-2 sm:px-2 sm:pt-2">
          {zoomed && (
            <span className={`map-hint mr-auto hidden min-w-0 items-center gap-1.5 truncate text-[13px] text-dim sm:inline-flex ${touched ? 'opacity-0' : ''}`} aria-hidden={touched}>
              <HandIcon size={14} className="shrink-0 text-brass" />
              {panHint}
            </span>
          )}
          {/* Handy: kurzer Hinweis als eigene schmale Zeile unter den Werkzeugen – bleibt sichtbar (Touch-Nutzer) */}
          {zoomed && (
            <span className="order-last flex w-full items-center gap-1.5 text-[13px] leading-tight text-dim sm:hidden">
              <HandIcon size={14} className="shrink-0 text-brass" />
              {t('Karte verschieben')}
            </span>
          )}
          {toggle}
          <div className="flex shrink-0 gap-0.5 sm:gap-1">
            {tool(
              t('Hineinzoomen'),
              () => zoomAt(1 / 1.3),
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>,
            )}
            {tool(
              t('Herauszoomen'),
              () => zoomAt(1.3),
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>,
            )}
            {tool(
              t('Ansicht zurücksetzen'),
              () => setVb(START),
              // Rücklaufpfeil um einen Mittelpunkt: „auf den Ausgangsausschnitt einpassen“ (kein Vollbild-Symbol)
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M3.3 9.6A5 5 0 1 0 4.6 4.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M4.9 1.6v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8.3" cy="8.3" r="1.4" fill="currentColor" />
              </svg>,
            )}
          </div>
        </div>
      )}
      <div
        ref={box}
        className={`relative overflow-hidden ${fit ? 'min-h-0 flex-1' : ''}`}
        style={{ touchAction: detail || vb.w < dims.w ? 'none' : 'pan-y' }}
        onFocus={() => (engaged.current = true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) engaged.current = false;
        }}
        onPointerDown={(e) => {
          engaged.current = true;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          // Ausgangspunkt: ein noch nicht übernommener Ausschnitt (laufendes Verschieben) geht vor
          const cur = live.current ?? vb;
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), vb: cur };
            drag.current = null;
          } else drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vb: cur, moved: false };
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            const f = pinch.current.d / Math.max(1, d);
            const base = pinch.current.vb;
            const w = base.w * f;
            const h = base.h * f;
            setTouched(true);
            preview(clamp({ w, h, x: base.x + (base.w - w) / 2, y: base.y + (base.h - h) / 2 }));
            return;
          }
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const r = box.current!.getBoundingClientRect();
          const dx = ((e.clientX - d.x) / r.width) * d.vb.w;
          const dy = ((e.clientY - d.y) / r.height) * d.vb.h;
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) {
            d.moved = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }
          if (d.moved) {
            setTouched(true);
            preview(clamp({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy }));
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          commit();
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          drag.current = null;
          commit();
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation();
            e.preventDefault();
          }
          drag.current = null;
        }}
      >
        <MapSvg
          {...mapProps}
          variant={detail ? 'full' : 'compact'}
          portrait={portrait}
          aspect={detail ? undefined : aspect}
          reserve={detail ? undefined : reserve}
          unit={unit}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          className={fit ? 'block h-full w-full' : 'block h-auto w-full'}
          locale={locale}
          planetImages={planetImages}
        />
      </div>
    </div>
  );
}
