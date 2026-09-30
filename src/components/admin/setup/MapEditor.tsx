'use client';

import { useMemo, useRef, useState } from 'react';
import { THEATRES, type TheatreId } from '@/engine/data/vespator';
import { ALL_THEATRES, forkMap, MAP_LIMITS, mapWarnings, newPlanetId, validateMap, VESPATOR_MAP, type MapDef } from '@/engine/map';
import { PlanetArt } from '@/components/map/PlanetArt';
import { TheatreGlyph } from '@/components/map/icons';
import { Field, useModal } from '@/components/ui';
import { saveMapTemplateAction, deleteMapTemplateAction } from '@/app/actions/campaign';
import { useCmd } from '../CommandProvider';
import { PlanetImagePicker } from './PlanetImagePicker';
import { MapGenPanel } from './MapGenPanel';
import { useMsg, useT } from '@/i18n/client';

type Mode = 'move' | 'connect' | 'add';
const VW = 1000;
const VH = 703;

/** Vollbild-Editor für die Kampagnenkarte (N5.5). Änderungen gelten erst mit „Übernehmen“ (MAP_SET). */
export function MapEditor({ templates, onClose }: { templates: { id: string; name: string; map: MapDef }[]; onClose: () => void }) {
  const { state, run, busy, toast, campaignId } = useCmd();
  const t = useT();
  const msg = useMsg();
  // NTH2 4.2: eigene Planetenbilder stehen im Entwurf an den Planeten (MAP_SET übernimmt sie in den Zustand)
  const [map, setMap] = useState<MapDef>(() => {
    const m = structuredClone(state.map);
    for (const p of m.planets) {
      const ps = state.planets.find((x) => x.id === p.id);
      if (ps?.portrait) p.portrait = ps.portrait;
      if (ps?.landscape) p.landscape = ps.landscape;
    }
    return m;
  });
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('move');
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  /** Letzter Pointer-Down traf einen Planeten: der folgende Klick (wegen Pointer-Capture am SVG) hebt die Auswahl nicht auf */
  const downOnPlanet = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const close = () => {
    if (dirty.current && !confirm(t('Änderungen an der Karte verwerfen?'))) return;
    onClose();
  };
  const dialog = useModal(close);

  /** Name im Dialog „Als Vorlage speichern“ (null = zu) */
  const [tplName, setTplName] = useState<string | null>(null);
  /** Karten-Generator (NTH2 3.4) offen */
  const [gen, setGen] = useState(false);
  const tplTrim = tplName?.trim() ?? '';
  const tplClash =
    tplTrim && tplTrim.toLowerCase() === VESPATOR_MAP.name.trim().toLowerCase()
      ? t('Gleicher Name wie die Regelwerk-Karte – bitte einen eigenen Namen wählen, damit man die Vorlagen unterscheiden kann.')
      : templates.some((x) => x.name.trim().toLowerCase() === tplTrim.toLowerCase())
        ? t('Eine Vorlage mit diesem Namen gibt es schon – sie wird überschrieben.')
        : null;
  const errors = useMemo(() => validateMap(map), [map]);
  const warnings = useMemo(() => mapWarnings(map), [map]);
  const selected = map.planets.find((p) => p.id === sel) ?? null;

  const toMap = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    const x = Math.min(98, Math.max(2, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(97, Math.max(3, ((e.clientY - r.top) / r.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  const update = (fn: (m: MapDef) => void) => {
    dirty.current = true;
    setMap((m) => {
      const n = structuredClone(m);
      fn(n);
      return n;
    });
  };

  const toggleLink = (a: string, b: string) =>
    update((m) => {
      const i = m.connections.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (i >= 0) m.connections.splice(i, 1);
      else m.connections.push([a, b]);
    });

  const clickPlanet = (id: string) => {
    if (mode === 'connect') {
      if (!linkFrom) setLinkFrom(id);
      else if (linkFrom === id) setLinkFrom(null);
      else {
        toggleLink(linkFrom, id);
        setLinkFrom(null);
      }
      setSel(id);
      return;
    }
    setSel(id);
  };

  const addPlanet = (x: number, y: number) => {
    if (map.planets.length >= MAP_LIMITS.maxPlanets) return;
    const id = newPlanetId();
    let n = map.planets.length + 1;
    while (map.planets.some((p) => p.name === t('Neue Welt {n}', { n }))) n++;
    const name = t('Neue Welt {n}', { n });
    update((m) => {
      m.planets.push({
        id,
        name,
        system: '',
        slots: 3,
        // B15: ohne vorgewähltes Theatre – sonst schaltet ein Klick auf „Dead Lands“ die Vorauswahl unbemerkt wieder ab
        theatres: [],
        x,
        y,
      });
    });
    setSel(id);
    setMode('move');
  };

  const load = (m: MapDef, keepIds: boolean) => {
    dirty.current = true;
    setMap(keepIds ? structuredClone(m) : forkMap(m).map);
    setSel(null);
    setLinkFrom(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ format: 'vespator-map', version: 1, map }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${map.name.replace(/[^\p{L}\p{N}]+/gu, '-') || t('karte')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const m = (raw.map ?? raw) as MapDef;
      if (!Array.isArray(m.planets) || !Array.isArray(m.connections)) throw new Error('Keine Karte');
      load(
        {
          name: String(m.name ?? t('Importierte Karte')),
          template: null,
          background: m.background ?? null,
          planets: m.planets,
          connections: m.connections,
        },
        false,
      );
      toast('ok', t('Karte importiert – bitte prüfen und übernehmen'));
    } catch {
      toast('error', t('Datei enthält keine gültige Karte'));
    }
  };

  const apply = async () => {
    if (await run({ type: 'MAP_SET', map })) onClose();
  };

  return (
    <div ref={dialog} tabIndex={-1} className="fixed inset-0 z-[60] flex flex-col bg-void outline-none" role="dialog" aria-modal="true" aria-labelledby="map-editor-title">
      <header className="relative z-[1] flex flex-wrap items-center gap-2 bg-[linear-gradient(180deg,#141816_0%,#0c0f0e_100%)] px-3 py-2 shadow-[0_1px_0_#050707,0_2px_0_#665333,0_3px_0_#050707,0_10px_20px_rgba(0,0,0,0.6)]">
        <span aria-hidden className="hidden h-[34px] w-[80px] bg-[url('/ui/emblem-winged.webp')] bg-contain bg-center bg-no-repeat sm:block" />
        <h2 id="map-editor-title" className="mr-2 font-display text-[19px] font-bold uppercase tracking-[0.06em] text-ink [text-shadow:0_2px_0_#000]">
          {t('Karteneditor')}
        </h2>
        <input className="input w-56" value={map.name} onChange={(e) => update((m) => void (m.name = e.target.value))} aria-label={t('Name der Karte')} />
        <label className="inline-flex items-center gap-1.5 text-[15px] text-dim">
          {t('Hintergrund')}
          <input
            type="color"
            value={map.background ?? '#120e0a'}
            onChange={(e) => update((m) => void (m.background = e.target.value))}
            className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
            aria-label={t('Hintergrundfarbe')}
          />
        </label>
        <select
          className="select w-auto"
          value=""
          aria-label={t('Vorlage laden')}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (!confirm(t('Aktuellen Entwurf durch die Vorlage ersetzen?'))) return;
            if (v === 'vespator') load(VESPATOR_MAP, true);
            else {
              const tpl = templates.find((x) => x.id === v);
              if (tpl) load(tpl.map, false);
            }
          }}
        >
          <option value="">{t('Vorlage laden …')}</option>
          <option value="vespator">{t('Vespator Front (Regelwerk)')}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name} ({t('{n} Planeten', { n: tpl.map.planets.length })})
            </option>
          ))}
        </select>
        <button className="btn btn-sm btn-ghost" onClick={() => fileInput.current?.click()}>
          {t('JSON importieren')}
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" tabIndex={-1} aria-hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        <button className="btn btn-sm btn-ghost" onClick={exportJson}>
          {t('JSON exportieren')}
        </button>
        <button className="btn btn-sm btn-ghost" aria-expanded={gen} onClick={() => setGen(!gen)}>
          {t('Zufällige Karte')}
        </button>
        <button className="btn btn-sm btn-ghost" disabled={errors.length > 0} aria-expanded={tplName !== null} onClick={() => setTplName(tplName === null ? map.name : null)}>
          {t('Als Vorlage speichern')}
        </button>
        <span className="ml-auto flex gap-2">
          <button className="btn btn-sm btn-ghost" onClick={close}>
            {t('Abbrechen')}
          </button>
          <button className="btn btn-sm btn-primary" disabled={busy || errors.length > 0} onClick={apply}>
            {t('Übernehmen')}
          </button>
        </span>
      </header>
      {/* Namensdialog für „Als Vorlage speichern“: eigener Name, Hinweis auf Überschreiben oder Verwechslung */}
      {gen && (
        <MapGenPanel
          onClose={() => setGen(false)}
          onGenerate={(m) => {
            if (dirty.current && !confirm(t('Aktuellen Entwurf durch die zufällige Karte ersetzen?'))) return;
            load(m, true);
            toast('ok', t('Zufällige Karte erzeugt – bitte prüfen und übernehmen'));
          }}
        />
      )}
      {tplName !== null && (
        <form
          className="relative z-[1] flex flex-wrap items-end gap-2 border-b border-line/60 bg-panel px-3 py-2"
          aria-label={t('Als Vorlage speichern')}
          onSubmit={async (e) => {
            e.preventDefault();
            const name = tplName.trim();
            if (!name) return;
            const r = await saveMapTemplateAction({ ...map, name });
            toast(r.ok ? 'ok' : 'error', r.ok ? t('Vorlage „{name}“ gespeichert', { name }) : r.error ? msg(r.error) : t('Fehler'));
            if (r.ok) setTplName(null);
          }}
        >
          <Field label={t('Name der Vorlage')}>
            <input className="input w-64" value={tplName} onChange={(e) => setTplName(e.target.value)} autoFocus required maxLength={80} />
          </Field>
          <button className="btn btn-sm btn-primary" disabled={!tplName.trim()}>
            {t('Vorlage speichern')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setTplName(null)}>
            {t('Abbrechen')}
          </button>
          {tplClash && <p className="basis-full text-[14px] text-warn">{tplClash}</p>}
        </form>
      )}

      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[15px]">
            <div className="inset inline-flex p-0.5" role="group" aria-label={t('Werkzeug')}>
              {(
                [
                  ['move', 'Auswählen & verschieben'],
                  ['connect', 'Verbinden'],
                  ['add', 'Planet hinzufügen'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={mode === k}
                  className={`min-h-8 rounded-[2px] px-2.5 py-1 ${mode === k ? 'bg-[#262b28] text-ink shadow-[inset_0_0_0_1px_rgba(179,151,95,0.6)]' : 'text-faint hover:text-dim'}`}
                  onClick={() => {
                    setMode(k);
                    setLinkFrom(null);
                  }}
                >
                  {t(l)}
                </button>
              ))}
            </div>
            <span className="text-faint">
              {mode === 'move' && t('Planet anklicken zum Bearbeiten, ziehen zum Verschieben.')}
              {mode === 'connect' && (linkFrom ? t('Zweiten Planeten anklicken – bestehende Verbindung wird entfernt.') : t('Ersten Planeten anklicken.'))}
              {mode === 'add' && t('Auf eine freie Stelle klicken.')}
            </span>
          </div>
          <svg
            ref={svg}
            viewBox={`0 0 ${VW} ${VH}`}
            className="min-h-0 w-full flex-1 touch-none rounded-[2px] shadow-[inset_0_0_0_1px_rgba(55,104,91,0.35),0_0_0_1px_#050707,0_0_0_2px_#665333]"
            style={{ background: map.background ?? '#120e0a' }}
            preserveAspectRatio="xMidYMid meet"
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || mode !== 'move') return;
              d.moved = true;
              const { x, y } = toMap(e);
              update((m) => {
                const p = m.planets.find((q) => q.id === d.id);
                if (p) Object.assign(p, { x, y });
              });
            }}
            onPointerDown={() => (downOnPlanet.current = false)}
            onPointerUp={() => (drag.current = null)}
            onClick={(e) => {
              // Durch setPointerCapture landet der Klick auf einem Planeten beim SVG: dann nicht abwählen
              if (downOnPlanet.current) {
                downOnPlanet.current = false;
                return;
              }
              if (mode === 'add' && e.target === svg.current) {
                const { x, y } = toMap(e);
                addPlanet(x, y);
              } else if (e.target === svg.current) setSel(null);
            }}
          >
            {map.connections.map(([a, b]) => {
              const p = map.planets.find((q) => q.id === a);
              const q = map.planets.find((r) => r.id === b);
              if (!p || !q) return null;
              return (
                <line
                  key={`${a}-${b}`}
                  x1={(p.x / 100) * VW}
                  y1={(p.y / 100) * VH}
                  x2={(q.x / 100) * VW}
                  y2={(q.y / 100) * VH}
                  stroke="#9c7a3c"
                  strokeWidth={3}
                  strokeDasharray="8 6"
                  className={mode === 'connect' ? 'cursor-pointer' : ''}
                  onClick={(e) => {
                    if (mode !== 'connect') return;
                    e.stopPropagation();
                    toggleLink(a, b);
                  }}
                />
              );
            })}
            {map.planets.map((p) => {
              const x = (p.x / 100) * VW;
              const y = (p.y / 100) * VH;
              const on = sel === p.id || linkFrom === p.id;
              return (
                <g
                  key={p.id}
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    if (mode !== 'move') return;
                    e.stopPropagation();
                    downOnPlanet.current = true;
                    svg.current?.setPointerCapture?.(e.pointerId);
                    drag.current = { id: p.id, moved: false };
                    setSel(p.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    clickPlanet(p.id);
                  }}
                >
                  {on && <circle cx={x} cy={y} r={34} fill="none" stroke={linkFrom === p.id ? '#8fb35a' : '#f5c451'} strokeWidth={3} />}
                  <PlanetArt planetId={p.id} def={p} cx={x} cy={y} r={22} image={p.portrait} />
                  <text x={x} y={y - 32} textAnchor="middle" fontSize={20} fontWeight={700} fill="#f3dfa6" stroke="#0a0806" strokeWidth={4} paintOrder="stroke" style={{ fontFamily: 'var(--font-cinzel), serif' }}>
                    {p.name}
                  </text>
                  <text x={x} y={y + 40} textAnchor="middle" fontSize={14} fill="#bba77f" stroke="#0a0806" strokeWidth={3} paintOrder="stroke">
                    {t('{slots} Slots · {n} Theatres', {
                      slots: p.slots,
                      n: p.theatres.length,
                    })}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="min-h-0 space-y-3 overflow-y-auto">
          {selected ? (
            <section className="hud space-y-3 p-3 [&>*]:relative [&>*]:z-[1]">
              <h3 className="hud-title">{t('Planet')}</h3>
              <Field label={t('Name')}>
                <input className="input" value={selected.name} onChange={(e) => update((m) => void (m.planets.find((p) => p.id === sel)!.name = e.target.value))} />
              </Field>
              <Field label="System">
                <input className="input" value={selected.system} onChange={(e) => update((m) => void (m.planets.find((p) => p.id === sel)!.system = e.target.value))} />
              </Field>
              <Field label={`Infrastructure Locations (${MAP_LIMITS.minSlots}–${MAP_LIMITS.maxSlots})`}>
                <input
                  type="number"
                  className="input w-24"
                  min={MAP_LIMITS.minSlots}
                  max={MAP_LIMITS.maxSlots}
                  value={selected.slots}
                  onChange={(e) => update((m) => void (m.planets.find((p) => p.id === sel)!.slots = Math.min(MAP_LIMITS.maxSlots, Math.max(MAP_LIMITS.minSlots, Number(e.target.value) || 1))))}
                />
              </Field>
              <div>
                <p className="label mb-1">{t('Theatres (1–3)')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_THEATRES.map((th: TheatreId) => {
                    const on = selected.theatres.includes(th);
                    return (
                      <button
                        key={th}
                        type="button"
                        aria-pressed={on}
                        disabled={!on && selected.theatres.length >= MAP_LIMITS.maxTheatres}
                        className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-[13px] disabled:opacity-40 ${on ? 'border-accent bg-accent/10 text-ink' : 'border-line text-dim'}`}
                        onClick={() => {
                          const id = sel;
                          // Zustand im Update selbst lesen (nicht aus dem Render): schnelle Klicks gehen nicht verloren
                          update((m) => {
                            const p = m.planets.find((q) => q.id === id);
                            if (!p) return;
                            if (p.theatres.includes(th)) p.theatres = p.theatres.filter((x) => x !== th);
                            else if (p.theatres.length < MAP_LIMITS.maxTheatres) p.theatres = [...p.theatres, th];
                          });
                        }}
                      >
                        <svg width="18" height="18" viewBox="-15 -15 30 30" aria-hidden>
                          <TheatreGlyph id={th} r={14} />
                        </svg>
                        {THEATRES[th].name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[15px] text-dim">
                {t('Verbunden mit:')}{' '}
                {map.connections
                  .filter(([a, b]) => a === sel || b === sel)
                  .map(([a, b]) => map.planets.find((p) => p.id === (a === sel ? b : a))?.name)
                  .join(', ') || '–'}
              </p>
              <div className="border-t border-line/60 pt-2">
                <p className="label">{t('Eigene Bilder')}</p>
                <PlanetImagePicker
                  campaignId={campaignId}
                  planetId={selected.id}
                  def={selected}
                  portrait={selected.portrait}
                  landscape={selected.landscape}
                  onChange={(next) =>
                    update((m) => {
                      const p = m.planets.find((q) => q.id === sel);
                      if (p) Object.assign(p, next);
                    })
                  }
                />
              </div>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  update((m) => {
                    m.planets = m.planets.filter((p) => p.id !== sel);
                    m.connections = m.connections.filter(([a, b]) => a !== sel && b !== sel);
                  });
                  setSel(null);
                }}
              >
                {t('Planet entfernen')}
              </button>
            </section>
          ) : (
            <section className="hud p-3 text-[15px] text-dim">
              <h3 className="hud-title mb-2">{map.name || t('Karte')}</h3>
              {t('{n} Planeten, {m} Verbindungen. Planet anklicken, um ihn zu bearbeiten.', { n: map.planets.length, m: map.connections.length })}
            </section>
          )}

          <section className="hud p-3 text-[15px]">
            <h3 className="hud-title mb-2">{t('Prüfung')}</h3>
            {errors.length === 0 ? (
              <p className="flex items-center gap-2 text-ok">
                <span className="lamp lamp-ok" aria-hidden /> {t('Karte ist spielbar')}
              </p>
            ) : (
              <ul className="space-y-1 text-danger" role="alert">
                {errors.map((e) => (
                  <li key={e} className="flex gap-2">
                    <span className="lamp lamp-alert mt-1.5" aria-hidden />
                    {msg(e)}
                  </li>
                ))}
              </ul>
            )}
            {warnings.map((w) => (
              <p key={w} className="mt-2 text-warn">
                {msg(w)}
              </p>
            ))}
            <p className="mt-2 text-[14px] text-faint">{t('„Übernehmen“ kann den Planeten neue interne IDs geben (z. B. bei einer geänderten Regelwerk-Karte). Namen, Lage und Verbindungen bleiben gleich.')}</p>
          </section>

          {templates.length > 0 && (
            <section className="hud p-3 text-[15px]">
              <h3 className="hud-title mb-2">{t('Gespeicherte Vorlagen')}</h3>
              <ul className="space-y-1">
                {templates.map((tpl) => (
                  <li key={tpl.id} className="flex items-center justify-between gap-2">
                    <span>
                      {tpl.name} <span className="text-faint">({tpl.map.planets.length})</span>
                    </span>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={async () => {
                        if (confirm(t('Vorlage „{name}“ löschen?', { name: tpl.name }))) await deleteMapTemplateAction(tpl.id);
                      }}
                    >
                      {t('löschen')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
