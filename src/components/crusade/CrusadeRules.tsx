'use client';

import type { RuleToggles } from '@/engine/types';
import { DEFAULT_CRUSADE, type CrusadeRules as Rules } from '@/engine/crusade';
import { useT } from '@/i18n/client';

/**
 * Schalter der Crusade-Anbindung (NTH2 3.2) im Regel-Panel: an/aus und XP je Schlacht. Standard: aus.
 * Die Werte lehnen sich an das Crusade-Regelwerk an (jede eingesetzte Einheit sammelt Erfahrung, die
 * hervorgehobene Einheit deutlich mehr); Sieg und Unentschieden können zusätzlich belohnt werden.
 */
export function CrusadeRulesPanel({ tog, set }: { tog: RuleToggles; set: (fn: (d: RuleToggles) => void) => void }) {
  const t = useT();
  const r: Rules = { ...DEFAULT_CRUSADE, ...(tog.crusade ?? {}) };
  const upd = (patch: Partial<Rules>) => set((d) => void (d.crusade = { ...DEFAULT_CRUSADE, ...(d.crusade ?? {}), ...patch }));
  const num = (v: string) => Math.min(10, Math.max(0, Math.round(Number(v) || 0)));
  const fields: [keyof Rules, string][] = [
    ['xpParticipation', 'XP je eingesetzter Einheit'],
    ['xpWin', 'zusätzlich bei Sieg'],
    ['xpDraw', 'zusätzlich bei Unentschieden'],
    ['xpMarked', 'Marked for Greatness'],
  ];
  return (
    <div className="mt-3 space-y-2">
      <p className="section-title">{t('Crusade-Anbindung')}</p>
      <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]" checked={r.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
        <span>
          {t('Order of Battle je Spieler: Kampagnen-Ergebnisse vergeben Crusade-XP')}
          <span className="block text-[13px] text-dim">{t('Spieler pflegen ihre Einheiten über den Spielerlink und melden je Schlacht die eingesetzten Einheiten. Der Warmaster kann XP korrigieren.')}</span>
        </span>
      </label>
      {r.enabled && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fields.map(([k, label]) => (
            <label key={k} className="block text-[14px]">
              <span className="label">{t(label)}</span>
              <input type="number" className="input w-24" min={0} max={10} value={r[k] as number} onChange={(e) => upd({ [k]: num(e.target.value) })} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
