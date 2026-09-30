import type { Metadata } from 'next';
import { allowed, authorizePage, sessionPrincipal } from '@/server/authz';
import { healthReport } from '@/server/health';
import { endedAt, privacySettings } from '@/server/privacy';
import { listCampaigns } from '@/server/campaigns';
import { getSetting } from '@/server/db';
import { i18nOverrides } from '@/server/i18nStore';
import { AdminShell } from '@/components/admin/AdminShell';
import { AccountSections, Sect, type AccountSection } from '@/components/admin/settings/AccountSections';
import { ClearErrorsButton, ErrorWebhookForm, PrivacySettingsForm, TranslationImport } from '@/components/admin/ops/OpsForms';
import { adminLocale, tFor } from '@/i18n/server';
import { intlLocale, LOCALE_NAMES, type Locale } from '@/i18n/core';
import { PACKS } from '@/i18n/packs';
import { buildCatalog, checklist } from '@/i18n/catalog';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Betrieb') };
}

const mb = (b: number | null) => (b === null ? '–' : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);
const DAY = 86_400_000;

/**
 * Betrieb (nur Admins): Health (NTH2 6.2), Datenschutz (NTH2 6.4) und Übersetzungsdatei (NTH2 7.2).
 */
export default async function OpsPage() {
  const admin = await authorizePage('account.self');
  const locale = await adminLocale();
  const t = tFor(locale);
  const intl = intlLocale(locale);
  const user = t('Angemeldet als {name} · {role}', { name: admin.username, role: admin.role === 'ADMIN' ? 'Admin' : 'Co-Warmaster' });
  if (!allowed(await sessionPrincipal(), 'instance.manage'))
    return (
      <AdminShell locale={locale} active="ops" user={user} title={t('Betrieb')} icon="ui_COG">
        <p className="text-[15px] text-dim">{t('Betrieb und Datenschutz verwaltet ein Admin.')}</p>
      </AdminShell>
    );
  const h = healthReport();
  const now = h.now;
  const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(intl, { dateStyle: 'short', timeStyle: 'short' }) : '–');
  const up = `${Math.floor(h.uptimeSec / 86400)} d ${Math.floor((h.uptimeSec % 86400) / 3600)} h ${Math.floor((h.uptimeSec % 3600) / 60)} min`;
  const backlog = h.outbox.reduce((s, o) => s + o.pending, 0);
  const stale = new Set(h.backups.filter((b) => !b.archived && (!b.last || now - Date.parse(b.last) > 2 * DAY)).map((b) => b.campaignId));
  const lamp = (ok: boolean) => <span className={`lamp ${ok ? 'lamp-ok' : 'lamp-alert'}`} aria-hidden />;

  const health = (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t('Outbox-Stau'), value: String(backlog), ok: backlog < 20 },
          { label: t('Fehler (24 h)'), value: String(h.errors24h), ok: h.errors24h === 0 },
          { label: t('Backups älter als 2 Tage'), value: String(stale.size), ok: stale.size === 0 },
          { label: t('Freier Speicher'), value: mb(h.disk.free), ok: h.disk.free === null || h.disk.free > 1024 ** 3 },
        ].map((k) => (
          <div key={k.label} className="inset flex items-center gap-2.5 p-2.5">
            {lamp(k.ok)}
            <div>
              <p className="text-[13px] text-dim">{k.label}</p>
              <p className="font-mono text-[18px] text-ink">{k.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Sect title={t('Version und Laufzeit')}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[15px]">
            <dt className="text-dim">{t('Version')}</dt>
            <dd className="font-mono">
              {h.version}
              {h.commit ? ` · ${h.commit.slice(0, 10)}` : ''}
            </dd>
            <dt className="text-dim">Build</dt>
            <dd className="truncate font-mono">{h.build ?? t('Entwicklung')}</dd>
            <dt className="text-dim">Node</dt>
            <dd className="font-mono">{h.node}</dd>
            <dt className="text-dim">{t('Gestartet')}</dt>
            <dd className="font-mono">
              {dt(h.startedAt)} · {up}
            </dd>
          </dl>
        </Sect>
        <Sect title={t('Speicher')}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[15px]">
            <dt className="text-dim">{t('Daten')}</dt>
            <dd className="font-mono">{mb(h.disk.data)}</dd>
            <dt className="text-dim">{t('Uploads')}</dt>
            <dd className="font-mono">{mb(h.disk.uploads)}</dd>
            <dt className="text-dim">{t('Backups')}</dt>
            <dd className="font-mono">{mb(h.disk.backups)}</dd>
            <dt className="text-dim">{t('Frei / gesamt')}</dt>
            <dd className="font-mono">
              {mb(h.disk.free)} / {mb(h.disk.total)}
            </dd>
          </dl>
        </Sect>
      </div>
      <Sect title={t('Outbox je Kanal')}>
        {/* waagrecht scrollbar (mobil): per Tastatur erreichbar */}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('Outbox je Kanal')}>
          <table className="table w-full min-w-[460px] text-[14px]">
            <thead>
              <tr>
                <th>{t('Kanal')}</th>
                <th className="text-right">{t('Wartend')}</th>
                <th className="text-right">{t('Fehlgeschlagen')}</th>
                <th className="text-right">{t('Gesendet (24 h)')}</th>
                <th>{t('Älteste wartende')}</th>
              </tr>
            </thead>
            <tbody>
              {h.outbox.map((o) => (
                <tr key={o.channel}>
                  <td>{o.channel}</td>
                  <td className="text-right font-mono">{o.pending}</td>
                  <td className={`text-right font-mono ${o.failed ? 'text-danger' : ''}`}>{o.failed}</td>
                  <td className="text-right font-mono">{o.sent24h}</td>
                  <td className="font-mono">{dt(o.oldestPending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sect>
      <Sect title={t('Letztes Backup je Kampagne')}>
        <table className="table w-full text-[14px]">
          <thead>
            <tr>
              <th>{t('Kampagne')}</th>
              <th>{t('Letztes Backup')}</th>
              <th className="text-right">{t('Anzahl')}</th>
            </tr>
          </thead>
          <tbody>
            {h.backups.map((b) => (
              <tr key={b.campaignId} className={b.archived ? 'text-faint' : ''}>
                <td>
                  {b.name}
                  {b.archived ? ` (${t('archiviert')})` : ''}
                </td>
                <td className={`font-mono ${stale.has(b.campaignId) ? 'text-warn' : ''}`}>{dt(b.last)}</td>
                <td className="text-right font-mono">{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sect>
      <Sect title={t('Serverfehler')}>
        {h.errors.length === 0 ? (
          <p className="text-[15px] text-ok">{t('Keine Fehler protokolliert.')}</p>
        ) : (
          <ul className="space-y-1.5 text-[14px]">
            {h.errors.map((e) => (
              <li key={e.id} className="inset p-2">
                <p className="font-mono text-[13px] text-dim">
                  {dt(e.at)} · {e.source}
                </p>
                <p className="break-words text-ink">{e.message}</p>
                {e.detail && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[13px] text-dim">Stack</summary>
                    <pre className="overflow-x-auto whitespace-pre text-[12px] text-dim">{e.detail}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        <ClearErrorsButton />
      </Sect>
      <Sect title={t('Fehler-Benachrichtigung')}>
        <ErrorWebhookForm configured={h.webhook} />
      </Sect>
    </>
  );

  const ps = privacySettings();
  const ended = listCampaigns()
    .filter((c) => !c.broken && c.state.stage.kind === 'ENDED')
    .map((c) => ({ id: c.id, name: c.name, at: endedAt(c.id), cleaned: getSetting(`privacyCleaned:${c.id}`) }));
  const privacy = (
    <>
      <p className="text-[15px] text-dim">
        {t(
          'Auf Wunsch eines Spielers: Daten exportieren oder Kontaktdaten löschen – in der Kampagne unter Allianzen & Spieler → Spieler bearbeiten → Datenschutz. Gelöscht wird in allen Revisionen und in der Outbox; jede Löschung steht im Verwaltungsprotokoll.',
        )}
      </p>
      <Sect title={t('Automatische Bereinigung')}>
        <PrivacySettingsForm initial={ps} />
        <p className="text-[13px] text-dim">{t('Automatische Backups auf dem Server rotieren nach 14 Tagen heraus; heruntergeladene Backups sind davon nicht betroffen.')}</p>
      </Sect>
      <Sect title={t('Beendete Kampagnen')}>
        {ended.length === 0 ? (
          <p className="text-[15px] text-faint">{t('Keine beendete Kampagne.')}</p>
        ) : (
          <table className="table w-full text-[14px]">
            <thead>
              <tr>
                <th>{t('Kampagne')}</th>
                <th>{t('Beendet')}</th>
                <th>{t('Bereinigt')}</th>
              </tr>
            </thead>
            <tbody>
              {ended.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="font-mono">{dt(c.at)}</td>
                  <td className="font-mono">{c.cleaned ? dt(c.cleaned) : ps.days && c.at ? t('fällig ab {date}', { date: dt(new Date(Date.parse(c.at) + ps.days * DAY).toISOString()) }) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sect>
    </>
  );

  const ov = i18nOverrides();
  const check = checklist(buildCatalog(PACKS), ov);
  const imported = Object.fromEntries(Object.entries(ov).map(([l, d]) => [l, Object.keys(d ?? {}).length])) as Partial<Record<Locale, number>>;
  const translations = (
    <>
      <p className="text-[15px] text-dim">
        {t(
          'Alle Oberflächentexte und Engine-Meldungen als Tabelle: exportieren, in einem Tabellenprogramm übersetzen, wieder importieren. Schlüssel ist der deutsche Text; fehlende Einträge fallen auf Englisch, dann Deutsch zurück. Spielbegriffe bleiben englisch.',
        )}
      </p>
      <TranslationImport imported={imported} />
      <Sect title={t('Prüfliste je Sprache')}>
        <div className="space-y-2">
          {check.map((c) => (
            <details key={c.locale} className="fold inset p-2">
              <summary className="flex flex-wrap items-center gap-2">
                <span className="w-24 font-serif font-semibold text-ink">{LOCALE_NAMES[c.locale]}</span>
                {/* Anteil übersetzter Einträge */}
                <span className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-[#0c0f0e] shadow-[inset_0_0_0_1px_#665333]" aria-hidden>
                  <span className="block h-full bg-[#b3975f]" style={{ width: `${Math.round((c.translated / Math.max(1, c.total)) * 100)}%` }} />
                </span>
                <span className="font-mono text-[14px]">
                  {c.translated}/{c.total}
                </span>
                <span className={`text-[14px] ${c.missing.length ? 'text-warn' : 'text-ok'}`}>{t('{n} fehlen', { n: c.missing.length })}</span>
                {c.broken.length > 0 && <span className="text-[14px] text-danger">{t('{n} mit Platzhalter-Fehler', { n: c.broken.length })}</span>}
              </summary>
              <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto text-[13px]">
                {c.broken.map((b) => (
                  <li key={`b-${b.de}`} className="text-danger">
                    <span className="font-mono">[{b.area}]</span> {b.de} → {b.value}
                  </li>
                ))}
                {c.missing.slice(0, 300).map((m) => (
                  <li key={`m-${m.de}`} className="text-dim">
                    <span className="font-mono">[{m.area}]</span> {m.de}
                  </li>
                ))}
                {c.missing.length > 300 && <li className="text-faint">{t('… und {n} weitere (vollständig in der Exportdatei)', { n: c.missing.length - 300 })}</li>}
              </ul>
            </details>
          ))}
        </div>
      </Sect>
    </>
  );

  const sections: AccountSection[] = [
    { id: 'health', label: t('Zustand'), icon: 'ui_COG', content: health },
    { id: 'privacy', label: t('Datenschutz'), icon: 'em_crown', content: privacy },
    { id: 'i18n', label: t('Übersetzungen'), icon: 'ui_SCROLL', content: translations },
  ];
  return (
    <AdminShell locale={locale} active="ops" user={user} title={t('Betrieb')} icon="ui_COG">
      <AccountSections sections={sections} />
    </AdminShell>
  );
}
