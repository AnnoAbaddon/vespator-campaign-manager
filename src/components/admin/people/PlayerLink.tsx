'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { playerLinkAction } from '@/app/actions/player';
import { CopyField } from '../settings/CopyField';
import { useCampaignInfo } from '../infoCtx';
import { useCmd } from '../CommandProvider';
import { useMsg, useT } from '@/i18n/client';

/** Persönlicher Spielerlink (N1.1): kopieren, QR, neu erzeugen, sperren */
export function PlayerLink({ playerId }: { playerId: string }) {
  const { campaignId, toast } = useCmd();
  const info = useCampaignInfo();
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = useT();
  const msg = useMsg();
  const url = info.playerLinks[playerId];
  const act = (a: 'regenerate' | 'revoke') =>
    start(async () => {
      const r = await playerLinkAction(campaignId, playerId, a);
      if (!r.ok) toast('error', msg(r.error));
      else {
        toast('ok', a === 'regenerate' ? t('Neuer Link erzeugt – der alte ist ungültig') : t('Link gesperrt'));
        router.refresh();
      }
    });
  return (
    <div className="space-y-2">
      <p className="section-title">{t('Persönlicher Spielerlink')}</p>
      {url ? (
        <>
          <CopyField value={url} />
          <div className="flex flex-wrap items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/c/${campaignId}/player/${playerId}/qr.svg?v=${encodeURIComponent(url.slice(-8))}`} alt={t('QR-Code des Spielerlinks')} className="h-28 w-28 border border-line bg-white" />
            <div className="space-y-1">
              <button className="btn btn-sm" disabled={pending} onClick={() => confirm(t('Neuen Link erzeugen? Der bisherige wird sofort ungültig.')) && act('regenerate')}>
                {t('Neu erzeugen')}
              </button>
              <button className="btn btn-sm btn-danger block" disabled={pending} onClick={() => confirm(t('Link sperren?')) && act('revoke')}>
                {t('Sperren')}
              </button>
            </div>
          </div>
          <p className="text-[13px] text-faint">{t('Wie ein Passwort behandeln – nur an den Spieler selbst schicken.')}</p>
        </>
      ) : (
        <button className="btn btn-sm" disabled={pending} onClick={() => act('regenerate')}>
          {t('Link erzeugen')}
        </button>
      )}
    </div>
  );
}
