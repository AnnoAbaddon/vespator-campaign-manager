'use client';

import type { Player } from '@/engine/types';
import { HOBBY_STATUS_LABEL, paintedPoints } from '@/engine/hobby';
import { uploadUrl } from '@/components/ui';
import { useIntlLocale, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/** Bemal-Chronik eines Spielers im Cockpit (D5): Einsicht und Entfernen einzelner Einträge (Moderation) */
export function HobbyAdmin({ player }: { player: Player }) {
  const { run, busy, readOnly } = useCmd();
  const t = useT();
  const il = useIntlLocale();
  const list = [...(player.hobby ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return null;
  return (
    <div>
      <p className="section-title">
        {t('Bemal-Chronik')} <span className="font-sans text-[14px] normal-case tracking-normal text-dim">({t('{n} Punkte fertig bemalt', { n: paintedPoints(player) })})</span>
      </p>
      <ul className="space-y-1 text-[15px]">
        {list.map((h) => (
          <li key={h.id} className="flex items-center gap-2">
            {h.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadUrl(h.photo, true)!} alt="" className="h-9 w-9 shrink-0 border border-line object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate">
              <b className="text-ink">{h.unit}</b>{' '}
              <span className="text-dim">
                · {new Date(h.date).toLocaleDateString(il, { timeZone: 'UTC' })} · {t(HOBBY_STATUS_LABEL[h.status])}
                {h.points ? ` · ${t('{n} Punkte', { n: h.points })}` : ''}
              </span>
            </span>
            {!readOnly && (
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run({ type: 'HOBBY_DELETE', playerId: player.id, id: h.id })}>
                {t('entfernen')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
