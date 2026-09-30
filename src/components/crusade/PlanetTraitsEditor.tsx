'use client';

import { useState } from 'react';
import { planetTraits } from '@/engine/crusade';
import { useCmd } from '@/components/admin/CommandProvider';
import { SaveIcon } from '@/components/icons';
import { useT } from '@/i18n/client';

/**
 * Planeten-Merkmale (A9) pflegen: Schlagwort (z. B. „Industriewelt“) und Wirkung als Freitext
 * (z. B. „+1 Requisition bei Sieg“). Erscheinen im Schlacht-Briefing und in der Planetenakte.
 */
export function PlanetTraitsEditor({ planetId }: { planetId: string }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const saved = planetTraits(state, planetId);
  const [rows, setRows] = useState<{ id?: string; keyword: string; effect: string }[] | null>(null);
  const cur = rows ?? saved;
  const set = (i: number, patch: Partial<{ keyword: string; effect: string }>) => setRows(cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2 border-t border-line/60 pt-3">
      <p className="section-title">{t('Planeten-Merkmale (Crusade)')}</p>
      <p className="text-[14px] text-dim">{t('Schlagworte für Crusade-Armeen, z. B. „Industriewelt“ mit Wirkung „+1 Requisition bei Sieg“. Öffentlich im Briefing und in der Planetenakte.')}</p>
      {cur.map((r, i) => (
        <div key={r.id ?? `n${i}`} className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
          <input className="input" value={r.keyword} maxLength={60} placeholder={t('Schlagwort')} aria-label={t('Schlagwort')} onChange={(e) => set(i, { keyword: e.target.value })} />
          <input className="input" value={r.effect} maxLength={300} placeholder={t('Wirkung (Freitext)')} aria-label={t('Wirkung (Freitext)')} onChange={(e) => set(i, { effect: e.target.value })} />
          <button type="button" className="btn btn-sm" onClick={() => setRows(cur.filter((_, j) => j !== i))}>
            {t('entfernen')}
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" disabled={cur.length >= 8} onClick={() => setRows([...cur, { keyword: '', effect: '' }])}>
          {t('Merkmal hinzufügen')}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy || rows === null}
          onClick={async () => {
            if (await run({ type: 'PLANET_TRAITS_SET', planetId, traits: cur })) setRows(null);
          }}
        >
          <SaveIcon /> {t('Merkmale speichern')}
        </button>
      </div>
    </div>
  );
}
