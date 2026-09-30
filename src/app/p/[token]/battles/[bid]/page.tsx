import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPlayer, secretAlliance } from '@/server/authz';
import { toPlayerView } from '@/engine/publicView';
import { allianceOf, stagePhase } from '@/engine/players';
import { Briefing } from '@/components/public/Briefing';
import { PrintButton } from '@/components/public/PrintButton';
import { playerLocale, tFor } from '@/i18n/server';
import { planetArtEnabled } from '@/server/db';
import { ArrowLeftIcon } from '@/components/icons';
import { Housing } from '@/components/public/Terminal';

export const metadata = { title: 'Briefing' };

export default async function PlayerBriefing({ params }: { params: Promise<{ token: string; bid: string }> }) {
  const { token, bid } = await params;
  const s = loadPlayer(token);
  if (!s) notFound();
  // B5: nach Kampagnenende gilt die Mitgliedschaft der letzten Phase (nicht die aus dem Setup)
  const phase = stagePhase(s.state);
  // F3: inaktive Spieler sehen nur die Leseansicht (keine Allianz-Geheimnisse)
  const view = toPlayerView(s.state, s.playerId, secretAlliance(s, allianceOf(s.player, phase)));
  const b = view.battles.find((x) => x.id === bid);
  if (!b) notFound();
  const locale = await playerLocale(s.player, s.state);
  const t = tFor(locale);
  return (
    <main className="term-grid mx-auto h-[calc(100dvh-var(--hdr))] max-w-[1100px] p-3 lg:p-[var(--gap)] lg:pt-[calc(var(--gap)+4px)]">
      <Housing
        title="Briefing"
        className="term-housing"
        actions={
          <>
            <Link className="btn btn-sm mr-auto" href={`/p/${token}`}>
              <ArrowLeftIcon size={14} /> {t('Zurück')}
            </Link>
            <PrintButton />
          </>
        }
      >
        <div className="mx-auto max-w-3xl">
          <Briefing state={view} battle={b} locale={locale} planetImages={planetArtEnabled()} />
        </div>
      </Housing>
    </main>
  );
}
