import type { Player } from '@/engine/types';
import { HOBBY_STATUS_LABEL, paintedPoints } from '@/engine/hobby';
import { intlLocale, makeT, type Locale } from '@/i18n/core';
import { uploadUrl } from './fmt';

/** Bemal-Chronik eines Spielers (D5) für Spielerakte und Codex – ohne Hooks, serverseitig nutzbar */
export function HobbyLog({ player, locale }: { player: Player; locale: Locale }) {
  const t = makeT(locale);
  const il = intlLocale(locale);
  const list = [...(player.hobby ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[15px]">
        {t('Fertig bemalt:')} <b className="font-mono text-ink">{paintedPoints(player)}</b> {t('Punkte')}
      </p>
      <ul className="divide-y divide-line/40 text-[15px]">
        {list.map((h) => (
          <li key={h.id} className="flex items-center gap-3 py-1.5">
            {h.photo && (
              <a href={uploadUrl(h.photo)!} className="shrink-0" aria-label={t('Foto: {unit}', { unit: h.unit })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadUrl(h.photo, true)!} alt="" loading="lazy" className="h-12 w-12 border border-line object-cover" />
              </a>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{h.unit}</span>
              <span className="block text-[14px] text-dim">
                {new Date(h.date).toLocaleDateString(il, { timeZone: 'UTC' })} · {t(HOBBY_STATUS_LABEL[h.status])}
                {h.points ? ` · ${t('{n} Punkte', { n: h.points })}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
