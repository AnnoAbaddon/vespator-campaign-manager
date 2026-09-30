'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { reportTarget } from '@/components/player/playerLinkStore';
import { useT } from '@/i18n/client';

/** Springt mit dem gemerkten Spielerlink zur Schlacht; ohne gemerkten Link eine kurze Anleitung */
export function ReportJump({ campaignId, battleId }: { campaignId: string; battleId: string }) {
  const t = useT();
  // undefined = Server bzw. vor dem Lesen des Speichers, null = kein Link auf diesem Gerät
  const target = useSyncExternalStore(
    () => () => undefined,
    () => reportTarget(campaignId, battleId),
    () => undefined,
  );
  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);
  return (
    <section className="hud frame space-y-3 p-4 pt-6 text-[16px]">
      <span className="plate plate-head">{t('Ergebnis melden')}</span>
      {target === null ? (
        <div className="relative z-[1] space-y-2">
          <p className="text-ink">{t('Auf diesem Gerät ist noch kein Spielerlink bekannt.')}</p>
          <p className="text-dim">
            {t(
              'Öffne einmal deinen persönlichen Spielerlink (QR-Karte oder E-Mail des Warmasters) auf diesem Handy und scanne den Code danach erneut. Der Code auf dem Bogen enthält aus Sicherheitsgründen keinen persönlichen Link.',
            )}
          </p>
        </div>
      ) : (
        <p className="relative z-[1] text-dim" role="status">
          {t('Öffne das Meldeformular …')}
        </p>
      )}
    </section>
  );
}
