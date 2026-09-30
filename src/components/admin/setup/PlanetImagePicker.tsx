'use client';

import { UploadButton, uploadUrl } from '@/components/ui';
import { PlanetPortrait } from '@/components/map/PlanetArt';
import type { PlanetDef } from '@/engine/data/vespator';
import { useT } from '@/i18n/client';

/**
 * Eigene Planetenbilder (NTH2 4.2): Porträt (Globus) und Landschaftsbild hochladen, ansehen, entfernen.
 * Genutzt im Karteneditor (Entwurf, gilt mit „Übernehmen“) und in der Planetenakte des Cockpits (sofort).
 * Ohne Upload bleiben die prozedurale Grafik bzw. die Vespator-Bilder.
 */
export function PlanetImagePicker({
  campaignId,
  planetId,
  portrait,
  landscape,
  disabled,
  onChange,
  def,
}: {
  campaignId: string;
  planetId: string;
  portrait: string | null | undefined;
  landscape: string | null | undefined;
  disabled?: boolean;
  /** Stammdaten eines noch nicht übernommenen Entwurfsplaneten (Karteneditor) */
  def?: PlanetDef;
  onChange: (next: { portrait?: string | null; landscape?: string | null }) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <p className="text-[14px] text-dim">{t('Eigene Bilder ersetzen die Grafik auf Karte, Planetenakte, Briefing und im Codex. Die App schneidet sie zu und passt die Farben an.')}</p>
      <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
        <PlanetPortrait planetId={planetId} size={96} image={portrait} def={def} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 w-full">{t('Porträt (Globus)')}</span>
          {!disabled && <UploadButton kind="PLANET_PORTRAIT" campaignId={campaignId} label={portrait ? t('Porträt ersetzen') : t('Porträt hochladen')} onUploaded={(id) => onChange({ portrait: id })} />}
          {portrait && !disabled && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange({ portrait: null })}>
              {t('Porträt entfernen')}
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <span className="label mb-0">{t('Landschaft')}</span>
        {landscape ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uploadUrl(landscape, true)!} alt={t('Landschaftsbild')} className="block h-20 w-full border border-line object-cover" />
        ) : (
          <p className="inset px-2 py-1.5 text-[14px] text-faint">{t('Kein eigenes Landschaftsbild')}</p>
        )}
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <UploadButton kind="PLANET_LANDSCAPE" campaignId={campaignId} label={landscape ? t('Landschaft ersetzen') : t('Landschaft hochladen')} onUploaded={(id) => onChange({ landscape: id })} />
            {landscape && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange({ landscape: null })}>
                {t('Landschaft entfernen')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
