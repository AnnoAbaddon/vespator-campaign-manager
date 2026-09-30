import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { publicOrigin } from '@/server/origin';
import { currentState, getCampaign, listRevisions, phaseSnapshots } from '@/server/campaigns';
import { CommandProvider } from '@/components/admin/CommandProvider';
import { AdminCampaign } from '@/components/admin/AdminCampaign';
import { listMapTemplates } from '@/server/mapTemplates';
import { playerLinks } from '@/server/players';
import { discordWebhook, outboxStatus, smtpConfig } from '@/server/notify';
import { listBackups } from '@/server/autoBackup';
import { allowed, authorizePage, sessionPrincipal } from '@/server/authz';
import { listSandboxes } from '@/server/sandbox';
import { listCampaignTemplates } from '@/server/campaignTemplates';

export default async function CampaignPage(props: PageProps<'/admin/c/[id]'>) {
  const { id } = await props.params;
  // Zugriff hier prüfen – Layouts schützen Seiten nicht zuverlässig (RSC-Anfragen können sie überspringen)
  await authorizePage('campaign.read', { campaignId: id });
  let data;
  try {
    data = currentState(id);
  } catch {
    notFound();
  }
  const { row, state } = data;
  const revisions = listRevisions(id).map((r) => ({
    number: r.number,
    summary: r.summary,
    log: JSON.parse(r.log) as string[],
    isOverride: !!r.is_override,
    reason: r.reason,
    undone: !!r.undone,
    active: r.active,
    createdAt: r.created_at,
    author: r.author,
    commandType: (JSON.parse(r.command) as { type: string }).type,
  }));
  const h = await headers();
  // nur für die Anzeige – aus Kopfzeilen abgeleitete Adressen werden nie gespeichert (Links in Nachrichten: APP_URL)
  const origin = publicOrigin(h);
  const hook = discordWebhook(id);
  // Szenario-Sandbox (NTH2 2.1): Bezug zum Original bzw. offene Sandboxes
  const orig = row.sandbox_of ? getCampaign(row.sandbox_of) : null;
  const sandbox = orig && state.meta.sandbox ? { of: orig.id, ofName: orig.name, baseRev: state.meta.sandbox.baseRev, originalRev: orig.current_rev } : null;
  return (
    <CommandProvider campaignId={id} revision={row.current_rev} state={state} readOnly={!!row.archived}>
      <AdminCampaign
        revisions={revisions}
        snapshots={phaseSnapshots(id)}
        info={{
          id,
          archived: !!row.archived,
          publicEnabled: !!row.public_enabled,
          publicUrl: `${origin}/v/${row.public_token}`,
          previousCampaignId: row.previous_campaign_id,
          mapTemplates: listMapTemplates(),
          playerLinks: playerLinks(id, origin),
          sandbox,
          sandboxes: row.sandbox_of ? [] : listSandboxes(id),
          campaignTemplates: listCampaignTemplates().map((x) => ({ id: x.id, name: x.name, createdAt: x.createdAt, createdBy: x.createdBy })),
          isAdmin: allowed(await sessionPrincipal(), 'instance.manage'),
          ops: { webhook: hook ? `${hook.slice(0, 40)}…` : null, smtp: !!smtpConfig(), outbox: outboxStatus(id), backups: listBackups(id) },
        }}
      />
    </CommandProvider>
  );
}
