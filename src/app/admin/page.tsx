import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { deleteCampaign, getCampaign, listCampaigns, loadState, setArchived } from '@/server/campaigns';
import { allowed, authorize, authorizePage, campaignScope, sessionPrincipal } from '@/server/authz';
import { audit } from '@/server/audit';
import { listMapTemplates } from '@/server/mapTemplates';
import { listCampaignTemplates } from '@/server/campaignTemplates';
import { CampaignActions } from '@/components/admin/NewCampaignForm';
import { ArrowRightIcon } from '@/components/icons';
import { stageLabel } from '@/components/stageLabel';
import { AdminShell } from '@/components/admin/AdminShell';
import { adminLocale, tFor } from '@/i18n/server';
import { intlLocale } from '@/i18n/core';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Kampagnen') };
}

async function deleteBroken(form: FormData) {
  'use server';
  const id = String(form.get('id') ?? '');
  const a = await authorize('campaign.delete', { campaignId: id });
  const row = getCampaign(id);
  if (row && isBroken(row.id, row.current_rev) && String(form.get('confirm') ?? '') === row.name) {
    audit(a.username, 'Kampagne gelöscht', `${row.name} (defekt)`, id);
    deleteCampaign(id);
  }
  revalidatePath('/admin');
}

/**
 * Verwalten direkt aus der Liste: Archivieren/Wiederherstellen und Löschen (mit Namensbestätigung) – auch für
 * Kampagnen, deren Verwaltungsseite nicht mehr lädt oder die doppelt angelegt wurden.
 */
async function manageFromList(form: FormData) {
  'use server';
  const id = String(form.get('id') ?? '');
  // F8: erst die Berechtigung, dann nur diese eine Kampagnenzeile laden (nicht alle Zustände)
  const a = await authorize('campaign.write', { campaignId: id });
  const action = String(form.get('action') ?? '');
  const row = getCampaign(id);
  if (!row) return;
  if (action === 'archive' || action === 'unarchive') {
    setArchived(id, action === 'archive');
    audit(a.username, action === 'archive' ? 'Kampagne archiviert' : 'Archivierung aufgehoben', row.name, id);
  } else if (action === 'delete') {
    if (!allowed(await sessionPrincipal(), 'campaign.delete', { campaignId: id })) return;
    if (String(form.get('confirm') ?? '') !== row.name) return;
    audit(a.username, 'Kampagne gelöscht', row.name, id);
    deleteCampaign(id);
  }
  revalidatePath('/admin');
}

/** Defekte Kampagne: der aktuelle Stand lässt sich nicht laden */
function isBroken(id: string, rev: number): boolean {
  try {
    const st = loadState(id, rev);
    return !st?.stage?.kind || !Array.isArray(st.alliances);
  } catch {
    return true;
  }
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ folge?: string }> }) {
  const admin = await authorizePage('account.self');
  const { folge } = await searchParams;
  const locale = await adminLocale();
  const t = tFor(locale);
  const intl = intlLocale(locale);
  // Co-Warmaster sehen nur ihre freigegebenen Kampagnen (N5.2)
  const scope = campaignScope(admin);
  const list = listCampaigns().filter((c) => scope === 'ALL' || scope.includes(c.id));
  const finished = list.filter((c) => !c.broken && c.state.stage.kind === 'ENDED').map((c) => ({ id: c.id, name: c.name }));
  const canCreate = allowed(await sessionPrincipal(), 'campaign.create');
  const canDelete = allowed(await sessionPrincipal(), 'instance.manage');
  // Kampagnen als Liste: Name und Stand links, Punkte je Allianz rechts – nutzt die Breite der Hauptfläche
  const cards = (
    <div className="@container space-y-3">
      {list.length > 0 && (
        <p aria-hidden className="hidden grid-cols-[minmax(0,1fr)_auto_20px] gap-x-6 px-2 font-serif text-[14px] font-semibold text-faint @2xl:grid">
          <span className="pl-[22px]">{t('Kampagne und Stand')}</span>
          <span className="text-right">{t('Kampagnenpunkte')}</span>
          <span />
        </p>
      )}
      <ul className="divide-y divide-line/60 border-y border-line/60">
        {list.map((c) => {
          if (c.broken) {
            return (
              <li key={c.id} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-[17px] font-bold uppercase leading-snug tracking-[0.04em]">{c.name}</h2>
                  <span className="chip border-danger text-danger">{t('defekt')}</span>
                </div>
                <p className="notice notice-danger">{t('Der gespeicherte Zustand kann nicht geladen werden: {error}', { error: c.broken })}</p>
                <a className="link text-[15px]" href={`/api/c/${c.id}/export`}>
                  {t('Rohdaten exportieren')}
                </a>
                <form action={deleteBroken} className="flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="id" value={c.id} />
                  <input className="input" name="confirm" placeholder={t('Name zur Bestätigung')} aria-label={t('Name zur Bestätigung')} required />
                  <button className="btn btn-danger btn-sm shrink-0 self-start sm:self-auto">{t('Löschen')}</button>
                </form>
              </li>
            );
          }
          const s = c.state;
          const last = s.pointsHistory[s.pointsHistory.length - 1];
          const lamp = c.archived ? '' : s.stage.kind === 'ENDED' ? 'lamp-ok' : 'lamp-on';
          const deadline = c.deadline?.at ?? null;
          return (
            <li key={c.id} className="relative">
              <Link
                href={`/admin/c/${c.id}`}
                className={`group grid items-center gap-x-6 gap-y-2 px-2 py-3 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.03] @2xl:grid-cols-[minmax(0,1fr)_auto_20px] ${c.archived ? 'opacity-70' : ''}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden className={`lamp mt-2 ${lamp}`} />
                  <div className="min-w-0">
                    <h2 className="hyphens-auto font-display text-[17px] font-bold uppercase leading-snug tracking-[0.04em] text-ink [overflow-wrap:anywhere] group-hover:text-[#fff6e0]" lang="de">
                      {c.name}
                      {c.archived ? <span className="chip ml-2 align-middle font-sans normal-case tracking-normal">{t('Archiv')}</span> : null}
                    </h2>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[14px] text-dim">
                      <span>{stageLabel(s, t)}</span>
                      {/* in „Operationen wählen“ zählt die Befehlsfrist, danach die Schlachtenfrist */}
                      {deadline && <span className="whitespace-nowrap text-warn">{t('Deadline: {date}', { date: new Date(deadline).toLocaleDateString(intl) })}</span>}
                    </p>
                  </div>
                </div>
                {last ? (
                  <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 pl-[22px] text-[15px] @2xl:max-w-[26rem] @2xl:justify-end @2xl:pl-0">
                    {s.alliances.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_6px_currentColor]" style={{ background: a.color, color: a.color }} />
                        {a.name} <b className="font-mono text-ink">{last.points[a.id]}</b>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="hidden @2xl:block" />
                )}
                <span aria-hidden className="hidden text-brass @2xl:block">
                  <ArrowRightIcon size={18} />
                </span>
              </Link>
              <details className="px-2 pb-2 pl-[30px] text-[14px]">
                <summary className="cursor-pointer py-3 text-faint hover:text-dim lg:py-0">{t('Verwalten')}</summary>
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <form action={manageFromList}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="action" value={c.archived ? 'unarchive' : 'archive'} />
                    <button className="btn btn-sm">{c.archived ? t('Archivierung aufheben') : t('Archivieren')}</button>
                  </form>
                  {canDelete && (
                    <form action={manageFromList} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="action" value="delete" />
                      <input className="input h-9 w-56" name="confirm" placeholder={t('Name zur Bestätigung')} aria-label={t('Name zur Bestätigung')} required />
                      <button className="btn btn-danger btn-sm">{t('Löschen')}</button>
                    </form>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {!list.length && (
        <p className="notice notice-muted">
          {canCreate ? t('Noch keine Kampagne – lege über „Neue Kampagne“ die erste an.') : t('Dir ist noch keine Kampagne freigegeben – ein Admin kann das in der Kontoverwaltung ändern.')}
        </p>
      )}
    </div>
  );
  // Neue Kampagnen anlegen oder importieren dürfen nur Admins (N5.2)
  return (
    <AdminShell
      locale={locale}
      active="list"
      user={t('Angemeldet als {name}', { name: admin.username })}
      title={t('Kampagnen ({n})', { n: list.length })}
      icon="ui_PLANET"
      side={canCreate ? <CampaignActions finished={finished} followUp={folge ?? null} mapTemplates={listMapTemplates().map((m) => ({ id: m.id, name: m.name }))} campaignTemplates={listCampaignTemplates()} /> : undefined}
      sideTitle={t('Anlegen & Importieren')}
      sideIcon="ui_SCROLL"
      sideFlatMobile
    >
      {cards}
    </AdminShell>
  );
}
