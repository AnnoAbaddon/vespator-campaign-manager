import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { calendarKey } from '@/server/players';
import { loadPlayer, secretAlliance } from '@/server/authz';
import { publicOrigin } from '@/server/origin';
import { getCampaign } from '@/server/campaigns';
import { toPlayerView } from '@/engine/publicView';
import { allianceOf, stagePhase } from '@/engine/players';
import { PlayerProvider } from '@/components/player/PlayerProvider';
import { PlayerApp } from '@/components/player/PlayerApp';
import { LageReport } from '@/components/public/Lage';
import { playerLocale } from '@/i18n/server';
import { vapidPublicKey } from '@/server/push';
import { discordBotConfig, discordLinksOf } from '@/server/discordBot';

export default async function PlayerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = loadPlayer(token);
  if (!s) notFound();
  // B5: nach Kampagnenende gilt die Mitgliedschaft der letzten Phase (nicht die aus dem Setup)
  const phase = stagePhase(s.state);
  // F3: inaktive Spieler (deaktiviert oder gelöscht) sehen nur die Leseansicht – keine Allianz-Notizen, keine verdeckten Befehle
  const allianceId = secretAlliance(s, allianceOf(s.player, phase));
  const view = toPlayerView(s.state, s.playerId, allianceId);
  const me = view.players.find((p) => p.id === s.playerId)!;
  const origin = publicOrigin(await headers());
  const pub = getCampaign(s.campaignId)?.public_enabled ? `${origin}/v/${s.publicToken}` : null;
  return (
    <PlayerProvider token={token} state={view} me={me} revision={s.revision} readOnly={s.archived}>
      <PlayerApp
        token={token}
        me={me}
        allianceId={allianceId}
        publicUrl={pub}
        p1={{ vapidKey: vapidPublicKey(), discordBot: !!discordBotConfig(), discordLinked: discordLinksOf(s.campaignId, s.playerId).map((d) => d.username ?? d.user) }}
        campaignId={s.campaignId}
        calendarUrl={`${origin}/kalender/${s.campaignId}/${s.playerId}/${calendarKey(s.campaignId, s.playerId) ?? ''}.ics`}
        lage={<LageReport state={view} locale={await playerLocale(s.player, s.state)} battleHref={(id) => `/p/${token}/battles/${id}`} briefingHref={(id) => `/p/${token}/battles/${id}`} />}
      />
    </PlayerProvider>
  );
}
