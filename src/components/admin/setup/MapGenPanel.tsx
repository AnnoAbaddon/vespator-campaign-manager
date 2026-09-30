'use client';

import { useState } from 'react';
import { DEFAULT_MAP_GEN, generateMap, MAP_GEN_LIMITS, randomSeed, type MapGenOptions } from '@/engine/mapGen';
import { MAP_LIMITS, type MapDef } from '@/engine/map';
import { Field } from '@/components/ui';
import { DiceIcon } from '@/components/icons';
import { useT } from '@/i18n/client';

/**
 * Karten-Generator im Karteneditor (NTH2 3.4): Regler für Planeten, Verbindungsdichte, Theatre-Mix und
 * Slot-Spanne plus Seed. „Erzeugen“ ersetzt den Entwurf; danach lässt sich alles im Editor anpassen.
 */
export function MapGenPanel({ onGenerate, onClose }: { onGenerate: (m: MapDef) => void; onClose: () => void }) {
  const t = useT();
  const [o, setO] = useState<MapGenOptions>(() => ({ ...DEFAULT_MAP_GEN, seed: randomSeed() }));
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<MapGenOptions>) => setO((x) => ({ ...x, ...patch }));
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const slider = (label: string, value: number, text: string, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <Field label={`${label}: ${text}`}>
      <input type="range" className="h-11 w-full accent-[#dda94d]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
  return (
    <form
      className="relative z-[1] grid max-h-[45dvh] grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto border-b border-line/60 bg-panel px-3 py-2 lg:max-h-none lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      aria-label={t('Zufällige Karte')}
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onGenerate(generateMap(o));
          setErr(null);
        } catch (x) {
          setErr(x instanceof Error ? x.message : String(x));
        }
      }}
    >
      {slider(t('Planeten'), o.planets, String(o.planets), MAP_GEN_LIMITS.minPlanets, MAP_GEN_LIMITS.maxPlanets, 1, (v) => set({ planets: v }))}
      {slider(t('Verbindungsdichte'), o.density, pct(o.density), 0, 1, 0.05, (v) => set({ density: v }))}
      {slider(t('Theatre-Mix'), o.theatreMix, o.theatreMix < 0.34 ? t('einheitlich') : o.theatreMix < 0.67 ? t('gemischt') : t('vielfältig'), 0, 1, 0.05, (v) => set({ theatreMix: v }))}
      <Field label={t('Infrastructure Locations je Planet')}>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            className="input w-16"
            min={MAP_LIMITS.minSlots}
            max={MAP_LIMITS.maxSlots}
            value={o.slotMin}
            aria-label={t('mindestens')}
            onChange={(e) => set({ slotMin: Number(e.target.value) || MAP_LIMITS.minSlots })}
          />
          <span className="text-dim">–</span>
          <input
            type="number"
            className="input w-16"
            min={MAP_LIMITS.minSlots}
            max={MAP_LIMITS.maxSlots}
            value={o.slotMax}
            aria-label={t('höchstens')}
            onChange={(e) => set({ slotMax: Number(e.target.value) || MAP_LIMITS.maxSlots })}
          />
        </span>
      </Field>
      <div className="col-span-2 flex flex-wrap items-end gap-2 lg:col-span-1 lg:row-span-2 lg:flex-col lg:items-stretch lg:justify-end">
        <button className="btn btn-sm btn-primary">{t('Erzeugen')}</button>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          {t('Schließen')}
        </button>
      </div>
      <Field label={t('Seed (gleicher Seed, gleiche Karte)')}>
        <span className="flex items-center gap-1.5">
          <input className="input w-36 font-mono" value={o.seed} maxLength={32} onChange={(e) => set({ seed: e.target.value })} required />
          <button type="button" className="btn btn-sm" title={t('Neuer Seed')} aria-label={t('Neuer Seed')} onClick={() => set({ seed: randomSeed() })}>
            <DiceIcon />
          </button>
        </span>
      </Field>
      <p className="col-span-2 self-end pb-2 text-[14px] text-dim lg:col-span-3">{t('Ersetzt den aktuellen Entwurf. Die Karte ist geprüft und lässt sich danach frei bearbeiten.')}</p>
      {err && (
        <p className="col-span-2 text-[14px] text-danger lg:col-span-5" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
