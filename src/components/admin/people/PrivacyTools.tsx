'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Player } from '@/engine/types';
import { deletePlayerContactAction, exportPlayerDataAction } from '@/app/actions/betrieb';
import { useCmd } from '../CommandProvider';
import { useMsg, useT } from '@/i18n/client';

/**
 * Datenschutz je Spieler (NTH2 6.4): alle Daten als JSON exportieren, Kontaktdaten (E-Mail, Discord, Klarname)
 * mit einem Klick löschen – in allen Revisionen und in der Outbox, mit Eintrag im Verwaltungsprotokoll.
 */
export function PrivacyTools({ player }: { player: Player }) {
  const { campaignId, readOnly } = useCmd();
  const t = useT();
  const msg = useMsg();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const hasContact = !!(player.email?.trim() || player.discord?.trim() || player.realName?.trim());
  return (
    <div className="space-y-2">
      <p className="section-title">{t('Datenschutz')}</p>
      <p className="text-[14px] text-dim">{t('Auf Wunsch des Spielers: Daten herausgeben oder Kontaktdaten löschen. Die Löschung gilt auch für ältere Stände der Kampagne und steht im Verwaltungsprotokoll.')}</p>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await exportPlayerDataAction(campaignId, player.id);
              if (!r.ok) return setNote({ ok: false, text: msg(r.error) });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }));
              a.download = r.filename;
              a.click();
              URL.revokeObjectURL(a.href);
              setNote({ ok: true, text: t('Export erstellt') });
            })
          }
        >
          {t('Daten exportieren (JSON)')}
        </button>
        {confirm ? (
          <button
            className="btn btn-sm btn-danger"
            disabled={pending || readOnly}
            onClick={() =>
              start(async () => {
                const r = await deletePlayerContactAction(campaignId, player.id);
                setConfirm(false);
                setNote(r.ok ? { ok: true, text: t('Kontaktdaten gelöscht ({n} Stände bereinigt)', { n: r.revisions }) } : { ok: false, text: msg(r.error) });
                if (r.ok) router.refresh();
              })
            }
          >
            {t('Wirklich löschen: E-Mail, Discord und Klarname')}
          </button>
        ) : (
          <button className="btn btn-sm btn-danger" disabled={pending || readOnly || !hasContact} onClick={() => setConfirm(true)}>
            {t('Kontaktdaten löschen')}
          </button>
        )}
      </div>
      {note && (
        <p className={`text-[14px] ${note.ok ? 'text-ok' : 'text-danger'}`} role={note.ok ? 'status' : 'alert'}>
          {note.text}
        </p>
      )}
    </div>
  );
}
