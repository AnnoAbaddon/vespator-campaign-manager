'use client';

import { useState } from 'react';
import { guestsOf, MAX_GUESTS_PER_SIDE } from '@/engine/guests';
import type { Battle } from '@/engine/types';
import { CloseIcon } from '@/components/icons';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Gastspieler (B3) im Schlacht-Editor: je Seite ein einmaliger Gast ohne Konto (Name, Armee).
 * Wird sofort gespeichert; zählt nicht für Spielerstatistik, Spiellast und Paarungen.
 */
export function GuestEditor({ battle: b }: { battle: Battle }) {
  const { run, busy } = useCmd();
  const t = useT();
  const [open, setOpen] = useState<'ATTACKER' | 'DEFENDER' | null>(null);
  const [name, setName] = useState('');
  const [faction, setFaction] = useState('');
  const locked = b.status === 'PROCESSED';
  const sides = (['ATTACKER', 'DEFENDER'] as const).map((side) => ({ side, list: guestsOf(b, side) }));
  const any = sides.some((x) => x.list.length);
  const add = async () => {
    if (!open) return;
    if (await run({ type: 'BATTLE_GUEST_SET', battleId: b.id, playerId: null, side: open, guest: { name, faction }, index: guestsOf(b, open).length })) {
      setOpen(null);
      setName('');
      setFaction('');
    }
  };
  if (locked && !any) return null;
  return (
    <div className="space-y-2 text-[15px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">{t('Gastspieler (ohne Konto, zählt nicht für die Spielerstatistik)')}</span>
        {!locked &&
          sides.map(({ side, list }) =>
            list.length < MAX_GUESTS_PER_SIDE ? (
              <button key={side} type="button" className="btn btn-sm btn-ghost" aria-expanded={open === side} onClick={() => setOpen(open === side ? null : side)}>
                {side === 'ATTACKER' ? t('+ Gast (Angreifer)') : t('+ Gast (Verteidiger)')}
              </button>
            ) : null,
          )}
      </div>
      {any && (
        <ul className="flex flex-wrap gap-2">
          {sides.flatMap(({ side, list }) =>
            list.map((g, i) => (
              <li key={`${side}${i}`} className="chip inline-flex items-center gap-1.5">
                {side === 'ATTACKER' ? t('Angreifer') : t('Verteidiger')}: {g.name}
                {g.faction ? ` (${g.faction})` : ''}
                {!locked && (
                  <button
                    type="button"
                    className="-my-1 inline-flex min-h-8 min-w-8 items-center justify-center"
                    aria-label={t('Gast {name} entfernen', { name: g.name })}
                    disabled={busy}
                    onClick={() => run({ type: 'BATTLE_GUEST_SET', battleId: b.id, playerId: null, side, guest: null, index: i })}
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </li>
            )),
          )}
        </ul>
      )}
      {open && (
        <div className="flex flex-wrap items-end gap-2">
          <input className="input w-48" value={name} maxLength={40} placeholder={t('Name des Gasts')} aria-label={t('Name des Gasts')} onChange={(e) => setName(e.target.value)} />
          <input className="input w-48" list="faction-list" value={faction} placeholder={t('Fraktion')} aria-label={t('Fraktion des Gasts')} onChange={(e) => setFaction(e.target.value)} />
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={add}>
            {t('Gast eintragen')}
          </button>
        </div>
      )}
    </div>
  );
}
