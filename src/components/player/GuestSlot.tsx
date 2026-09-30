'use client';

import { useState } from 'react';
import { guestsOf, MAX_GUESTS_PER_SIDE } from '@/engine/guests';
import { claimableSide } from '@/engine/playerActions';
import type { Battle, Player } from '@/engine/types';
import { CloseIcon } from '@/components/icons';
import { useCmd } from '@/components/admin/CommandProvider';
import { useT } from '@/i18n/client';

/**
 * Gastspieler (B3) auf dem Spielerlink: Die eigene Seite trägt einen einmaligen Gast ohne Konto ein
 * (Name, Armee). Ergebnis melden und bestätigen dann die Mitglieder der Allianz.
 */
export function GuestSlot({ battle: b, me, side }: { battle: Battle; me: Player; side: 'ATTACKER' | 'DEFENDER' }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [faction, setFaction] = useState('');
  const guests = guestsOf(b, side);
  const editable = b.status === 'SCHEDULED' && !b.draft && claimableSide(state, b, me.id) === side;
  if (!guests.length && !editable) return null;
  return (
    <div className="space-y-2 text-[15px]">
      {guests.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {guests.map((g, i) => (
            <li key={i} className="chip inline-flex items-center gap-1.5">
              {t('Gast: {name}', { name: g.name })}
              {g.faction ? ` (${g.faction})` : ''}
              {editable && (
                <button
                  type="button"
                  className="-my-1 inline-flex min-h-8 min-w-8 items-center justify-center"
                  aria-label={t('Gast {name} entfernen', { name: g.name })}
                  disabled={busy}
                  onClick={() => run({ type: 'BATTLE_GUEST_SET', battleId: b.id, playerId: me.id, side, guest: null, index: i })}
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && guests.length < MAX_GUESTS_PER_SIDE && !open && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
          {side === 'DEFENDER' ? t('Gast verteidigt für uns') : t('Gast greift für uns an')}
        </button>
      )}
      {open && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ type: 'BATTLE_GUEST_SET', battleId: b.id, playerId: me.id, side, guest: { name, faction }, index: guests.length })) {
              setOpen(false);
              setName('');
              setFaction('');
            }
          }}
        >
          <input className="input w-44" value={name} maxLength={40} placeholder={t('Name des Gasts')} aria-label={t('Name des Gasts')} onChange={(e) => setName(e.target.value)} />
          <input className="input w-44" value={faction} maxLength={60} placeholder={t('Fraktion')} aria-label={t('Fraktion des Gasts')} onChange={(e) => setFaction(e.target.value)} />
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !name.trim()}>
            {t('Gast eintragen')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
            {t('Abbrechen')}
          </button>
        </form>
      )}
      {(guests.length > 0 || open) && (
        <p className="text-[13px] text-faint">{t('Gäste haben keinen Spielerlink und zählen nicht für die Spielerstatistik. Ergebnis melden und bestätigen die Mitglieder deiner Allianz.')}</p>
      )}
    </div>
  );
}
