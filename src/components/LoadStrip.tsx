import { battlesPerPlayer } from '@/engine/playerActions';
import type { CampaignState } from '@/engine/types';
import { DEFAULT_LOCALE, makeT, type Locale } from '@/i18n/core';

/** Spiellast (N1.6): Schlachten je Spieler in einer Phase, markiert über dem Limit */
export function LoadStrip({ state, phase, locale }: { state: CampaignState; phase: number; locale?: Locale }) {
  const t = makeT(locale ?? DEFAULT_LOCALE);
  const load = battlesPerPlayer(state, phase);
  const max = state.toggles.load?.maxPerPlayer ?? null;
  const rows = state.players.filter((p) => p.active && (load[p.id] ?? 0) > 0).sort((a, b) => (load[b.id] ?? 0) - (load[a.id] ?? 0));
  if (!rows.length) return <p className="text-sm text-faint">{t('Noch keine Schlachten mit Teilnehmern in Phase {n}.', { n: phase })}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5 text-sm">
      {rows.map((p) => (
        <li key={p.id} className={`chip ${max && (load[p.id] ?? 0) > max ? 'border-danger text-danger' : ''}`}>
          {p.nickname} {load[p.id]}
        </li>
      ))}
      {max ? <li className="text-xs text-faint">{t('Limit {n} je Phase', { n: max })}</li> : null}
    </ul>
  );
}
