'use client';

import { useState } from 'react';
import type { Player } from '@/engine/types';
import { currentAllianceOf } from '@/engine/players';
import { Avatar, Field, UploadButton } from '@/components/ui';
import { useCmd } from '../CommandProvider';
import { useT } from '@/i18n/client';

/** Vollständiges Spielerformular (Anlegen/Bearbeiten) */
export function PlayerEditor({ player, onDone }: { player?: Player; onDone?: () => void }) {
  const { state, run, campaignId, busy } = useCmd();
  const t = useT();
  const [f, setF] = useState({
    nickname: player?.nickname ?? '',
    realName: player?.realName ?? '',
    email: player?.email ?? '',
    discord: player?.discord ?? '',
    faction: player?.faction ?? '',
    subfaction: player?.subfaction ?? '',
    notes: player?.notes ?? '',
    active: player?.active ?? true,
    isGameMaster: player?.isGameMaster ?? false,
    avatar: player?.avatar ?? null,
  });
  const [allianceId, setAllianceId] = useState<string>((player && currentAllianceOf(player)) ?? '');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run({
          type: 'PLAYER_UPSERT',
          id: player?.id,
          data: f,
          allianceId: allianceId || null,
        });
        if (ok) {
          if (!player) {
            setF((x) => ({
              ...x,
              nickname: '',
              realName: '',
              email: '',
              discord: '',
              faction: '',
              subfaction: '',
              notes: '',
              avatar: null,
            }));
          }
          onDone?.();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar id={f.avatar} name={f.nickname || '?'} size={48} />
        <UploadButton kind="AVATAR" campaignId={campaignId} onUploaded={(id) => set('avatar', id)} label={t('Avatar hochladen')} />
        {f.avatar && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('avatar', null)}>
            {t('Entfernen')}
          </button>
        )}
      </div>
      <div className="grid gap-3 @lg:grid-cols-2">
        <Field label={t('Nickname')}>
          <input className="input" value={f.nickname} onChange={(e) => set('nickname', e.target.value)} required />
        </Field>
        <Field label={t('Allianz')}>
          <select className="select" value={allianceId} onChange={(e) => setAllianceId(e.target.value)}>
            <option value="">{t('– keine –')}</option>
            {state.alliances.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Fraktion')}>
          <input className="input" list="faction-list" value={f.faction} onChange={(e) => set('faction', e.target.value)} placeholder={t('z. B. Space Marines')} />
        </Field>
        <Field label={t('Subfraktion')}>
          <input className="input" value={f.subfaction} onChange={(e) => set('subfaction', e.target.value)} placeholder={t('z. B. Ultramarines')} />
        </Field>
        <Field label={t('Realname (privat)')}>
          <input className="input" value={f.realName} onChange={(e) => set('realName', e.target.value)} />
        </Field>
        <Field label={t('E-Mail (privat)')}>
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('Discord (privat)')}>
          <input className="input" value={f.discord} onChange={(e) => set('discord', e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end gap-2 text-[15px]">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> {t('Aktiv')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={f.isGameMaster} onChange={(e) => set('isGameMaster', e.target.checked)} /> {t('ist Spielleiter')}
          </label>
        </div>
      </div>
      <Field label={t('SL-Notiz (nie öffentlich)')}>
        <textarea className="textarea" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy || !f.nickname.trim()}>
          {player ? t('Speichern') : t('Spieler anlegen')}
        </button>
        {onDone && (
          <button type="button" className="btn" onClick={onDone}>
            {t('Abbrechen')}
          </button>
        )}
      </div>
    </form>
  );
}

/** Kompaktes Formular zum schnellen Anlegen */
export function QuickPlayerForm({ defaultAllianceId }: { defaultAllianceId?: string }) {
  const { state, run, busy } = useCmd();
  const [nickname, setNickname] = useState('');
  const t = useT();
  const [faction, setFaction] = useState('');
  const [allianceId, setAllianceId] = useState(defaultAllianceId ?? state.alliances[0]?.id ?? '');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!nickname.trim()) return;
        const ok = await run({
          type: 'PLAYER_UPSERT',
          data: { nickname, faction },
          allianceId: allianceId || null,
        });
        if (ok) {
          setNickname('');
          setFaction('');
        }
      }}
    >
      <label className="min-w-32 flex-1">
        <span className="label">{t('Nickname')}</span>
        <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} required />
      </label>
      <label className="min-w-32 flex-1">
        <span className="label">{t('Fraktion')}</span>
        <input className="input" list="faction-list" value={faction} onChange={(e) => setFaction(e.target.value)} />
      </label>
      <label className="min-w-32 flex-1">
        <span className="label">{t('Allianz')}</span>
        <select className="select" value={allianceId} onChange={(e) => setAllianceId(e.target.value)}>
          <option value="">{t('– keine –')}</option>
          {state.alliances.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary" disabled={busy}>
        {t('+ Spieler')}
      </button>
    </form>
  );
}
