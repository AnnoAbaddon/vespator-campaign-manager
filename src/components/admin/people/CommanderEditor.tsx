'use client';

import { useState } from 'react';
import type { Player } from '@/engine/types';
import { Field, UploadButton } from '@/components/ui';
import { useCmd } from '../CommandProvider';
import { CommanderCard } from '@/components/CommanderCard';
import { useLocale, useMsg, useT } from '@/i18n/client';

/** Kommandant pflegen, Ehrungen und Narben vergeben (N3.4) */
export function CommanderEditor({ player: p }: { player: Player }) {
  const { state, run, busy, campaignId } = useCmd();
  const t = useT();
  const msg = useMsg();
  const locale = useLocale();
  const [name, setName] = useState(p.commander?.name ?? '');
  const [title, setTitle] = useState(p.commander?.title ?? '');
  const [markTitle, setMarkTitle] = useState('');
  const [reason, setReason] = useState('');
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  const add = (kind: 'HONOR' | 'SCAR') =>
    run({
      type: 'MARK_ADD',
      kind,
      playerId: p.id,
      title: markTitle,
      reason,
      phase,
      battleId: null,
    }).then((ok) => {
      if (ok) {
        setMarkTitle('');
        setReason('');
      }
    });
  return (
    <div className="space-y-3">
      <p className="section-title">{t('Kommandant')}</p>
      <CommanderCard state={state} player={p} locale={locale} />
      <div className="grid gap-2 @lg:grid-cols-2">
        <Field label={t('Titel')}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('z. B. Lord-Castellan')} />
        </Field>
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={() =>
            run({
              type: 'COMMANDER_UPDATE',
              playerId: p.id,
              name,
              title,
              portrait: p.commander?.portrait ?? null,
            })
          }
        >
          {t('Kommandant speichern')}
        </button>
        <UploadButton
          kind="AVATAR"
          campaignId={campaignId}
          label={t('Portrait hochladen')}
          onUploaded={(id) =>
            run({
              type: 'COMMANDER_UPDATE',
              playerId: p.id,
              name,
              title,
              portrait: id,
            })
          }
        />
      </div>
      <div className="grid gap-2 @lg:grid-cols-2">
        <Field label={t('Ehrung/Narbe')}>
          <input className="input" value={markTitle} onChange={(e) => setMarkTitle(e.target.value)} placeholder={t('z. B. Held von Karabas')} />
        </Field>
        <Field label={t('Anlass')}>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-sm" disabled={busy || !markTitle.trim()} onClick={() => add('HONOR')}>
          {t('Ehrung vergeben')}
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy || !markTitle.trim()} onClick={() => add('SCAR')}>
          {t('Narbe vermerken')}
        </button>
      </div>
      {[...(p.honors ?? []).map((h) => ({ ...h, kind: 'HONOR' as const })), ...(p.scars ?? []).map((h) => ({ ...h, kind: 'SCAR' as const }))].length > 0 && (
        <ul className="space-y-1 text-[15px]">
          {(p.honors ?? []).map((h) => (
            <li key={h.id} className="flex items-center gap-2">
              <span className="text-accent">{msg(h.title)}</span>
              <span className="text-[13px] text-faint">
                {msg(h.reason)}
                {h.auto ? ` · ${t('automatisch')}` : ''}
              </span>
              <button
                className="btn btn-sm btn-ghost ml-auto"
                disabled={busy}
                onClick={() =>
                  run({
                    type: 'MARK_REMOVE',
                    kind: 'HONOR',
                    playerId: p.id,
                    id: h.id,
                  })
                }
              >
                {t('entfernen')}
              </button>
            </li>
          ))}
          {(p.scars ?? []).map((h) => (
            <li key={h.id} className="flex items-center gap-2">
              <span className="text-danger">{msg(h.title)}</span>
              <span className="text-[13px] text-faint">{msg(h.reason)}</span>
              <button
                className="btn btn-sm btn-ghost ml-auto"
                disabled={busy}
                onClick={() =>
                  run({
                    type: 'MARK_REMOVE',
                    kind: 'SCAR',
                    playerId: p.id,
                    id: h.id,
                  })
                }
              >
                {t('entfernen')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
