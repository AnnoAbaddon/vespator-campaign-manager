'use client';

import { useState } from 'react';
import { currentAllianceOf, playersOfAlliance } from '@/engine/players';
import { AllianceTag, FactionTag } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { useCmd } from '../CommandProvider';
import { useT } from '@/i18n/client';

/**
 * Mitglieder einer Allianz verwalten: Spieler ohne Allianz oder aus einer anderen Allianz
 * hinzufügen, Mitglieder entfernen. Während einer laufenden Kampagne fragt die Engine nach.
 */
export function AllianceMembers({ allianceId }: { allianceId: string }) {
  const { state, run, busy, readOnly } = useCmd();
  const [pick, setPick] = useState('');
  const t = useT();
  const members = playersOfAlliance(state, allianceId);
  const candidates = state.players.filter((p) => p.active && currentAllianceOf(p) !== allianceId);
  const without = candidates.filter((p) => !currentAllianceOf(p));
  const others = state.alliances.filter((a) => a.id !== allianceId);
  const alliance = (id: string | null) => state.alliances.find((a) => a.id === id) ?? null;

  const add = async () => {
    if (!pick) return;
    if (await run({ type: 'PLAYER_UPSERT', id: pick, data: {}, allianceId })) setPick('');
  };

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5">
        {members.map((p) => (
          <li key={p.id} className="chip gap-1.5 normal-case">
            <span className="text-ink">{p.nickname}</span>
            {p.faction && <FactionTag name={p.faction} className="text-faint" />}
            {!readOnly && (
              <button
                type="button"
                className="ml-0.5 text-danger hover:text-ink"
                aria-label={t('{name} aus der Allianz entfernen', {
                  name: p.nickname,
                })}
                title={t('Aus der Allianz entfernen')}
                disabled={busy}
                onClick={() =>
                  run({
                    type: 'PLAYER_UPSERT',
                    id: p.id,
                    data: {},
                    allianceId: null,
                  })
                }
              >
                <CloseIcon size={14} />
              </button>
            )}
          </li>
        ))}
        {!members.length && <li className="text-[15px] text-faint">{t('Noch keine Mitglieder.')}</li>}
      </ul>
      {!readOnly && candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="select w-auto min-w-52" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('Spieler hinzufügen')}>
            <option value="">{t('– Spieler hinzufügen –')}</option>
            {without.length > 0 && (
              <optgroup label={t('Ohne Allianz')}>
                {without.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname}
                    {p.faction ? ` (${p.faction})` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {others.map((o) => {
              const list = candidates.filter((p) => currentAllianceOf(p) === o.id);
              return list.length ? (
                <optgroup key={o.id} label={t('Aus {name} (wechselt)', { name: o.name })}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                      {p.faction ? ` (${p.faction})` : ''}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <button type="button" className="btn btn-sm" disabled={!pick || busy} onClick={add}>
            {t('Hinzufügen')}
          </button>
          {pick && currentAllianceOf(state.players.find((p) => p.id === pick)!) && (
            <span className="text-[14px] text-warn">
              {t('wechselt von')} <AllianceTag alliance={alliance(currentAllianceOf(state.players.find((p) => p.id === pick)!))} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
