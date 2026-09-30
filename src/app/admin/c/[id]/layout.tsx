import { authorizePage } from '@/server/authz';

/** Schützt alle Seiten einer Kampagne: Co-Warmaster sehen nur freigegebene Kampagnen (N5.2) */
export default async function CampaignLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  await authorizePage('campaign.read', { campaignId: id });
  return <>{children}</>;
}
