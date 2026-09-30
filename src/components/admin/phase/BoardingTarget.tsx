'use client';

import { planetName } from '@/components/ui';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Zielflotte einer Boarding Action schon beim Befehl (R4 / SPEC 9.2): Flotten der angegriffenen Allianz auf dem
 * Zielplaneten. Ohne Flotte dort nur der Hinweis (F-3) – die Zielflotte kann bei Sieg noch gewählt werden.
 */
export function BoardingTarget({ value, planetId, allianceId, onChange, className = '' }: { value: string | undefined; planetId: string; allianceId: string; onChange: (id: string | undefined) => void; className?: string }) {
  const { state } = useCmd();
  const t = useT();
  const fleets = state.fleets.filter((f) => f.allianceId === allianceId && f.planetId === planetId && !f.reserve);
  if (!fleets.length) return <p className={`text-[13px] text-warn ${className}`}>{t('Keine gegnerische Flotte am Ziel – bei Sieg wird keine Flotte vertrieben.')}</p>;
  return (
    <select className={`select ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-label={t('Zielflotte')}>
      <option value="">{t('– Zielflotte auf {planet} –', { planet: planetName(planetId) })}</option>
      {fleets.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
