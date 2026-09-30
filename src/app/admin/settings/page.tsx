import crypto from 'node:crypto';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { publicOrigin } from '@/server/origin';
import { defaultLocale, getSetting, planetArtEnabled, setSetting } from '@/server/db';
import { listAccounts } from '@/server/auth';
import { allowed, authorize, authorizePage, campaignScope, sessionPrincipal } from '@/server/authz';
import { listAudit } from '@/server/audit';
import { AuditPanel } from '@/components/admin/settings/AuditPanel';
import { campaignNameList } from '@/server/campaigns';
import { AccountsPanel } from '@/components/admin/settings/AccountsPanel';
import { HallOfFameLink, PasswordForm } from '@/components/admin/settings/AccountForms';
import { AccountSections, Sect, type AccountSection } from '@/components/admin/settings/AccountSections';
import { setPlanetArtAction } from '@/app/actions/campaign';
import { setDefaultLocaleAction, setLocaleAction } from '@/app/actions/accounts';
import { smtpConfig, smtpInsecureFromEnv } from '@/server/notify';
import { SmtpForm } from '@/components/admin/settings/SmtpForm';
import { PublicUrlForm } from '@/components/admin/settings/PublicUrlForm';
import { LegalForm } from '@/components/admin/settings/LegalForm';
import { legalText } from '@/server/legal';
import { DiscordBotForm } from '@/components/admin/settings/DiscordBotForm';
import { AdminPush } from '@/components/admin/settings/AdminPush';
import { discordBotStatus } from '@/server/discordBot';
import { vapidPublicKey } from '@/server/push';
import { adminLocale, tFor } from '@/i18n/server';
import { AdminShell } from '@/components/admin/AdminShell';
import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, toLocale } from '@/i18n/core';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Konto') };
}

/** Globale Standardsprache aus dem Formular übernehmen */
async function setDefaultLocaleForm(form: FormData) {
  'use server';
  await authorize('instance.manage');
  await setDefaultLocaleAction(toLocale(form.get('defaultLocale')));
}

/** Sprache der Verwaltung aus dem Formular übernehmen (N5.4) */
async function setLocaleForm(form: FormData) {
  'use server';
  await authorize('account.self');
  await setLocaleAction(toLocale(form.get('locale')));
}

export default async function AccountPage() {
  const admin = await authorizePage('account.self');
  const locale = await adminLocale();
  const t = tFor(locale);
  const owner = allowed(await sessionPrincipal(), 'instance.manage');
  let token = getSetting('hallToken');
  if (!token) {
    token = crypto.randomBytes(32).toString('base64url');
    setSetting('hallToken', token);
  }
  const h = await headers();
  const origin = publicOrigin(h);
  const campaignNames = Object.fromEntries(campaignNameList().map((c) => [c.id, c.name]));
  const smtp = (() => {
    const raw = getSetting('smtp');
    if (!raw) return null;
    const c = JSON.parse(raw) as { host: string; port: number; secure: boolean; user: string; from: string; insecure?: boolean };
    return { host: c.host, port: c.port, secure: c.secure, user: c.user, from: c.from, insecure: !!c.insecure };
  })();
  const personal = (
    <>
      <Sect title={t('Sprache')}>
        <form action={setLocaleForm} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select key={admin.locale} className="select sm:w-44" name="locale" defaultValue={admin.locale} aria-label={t('Sprache der Verwaltung')}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
          <button className="btn btn-sm self-start sm:self-auto">{t('Sprache speichern')}</button>
          <span className="basis-full text-[14px] text-dim">{t('Gilt für die Verwaltung mit diesem Konto.')}</span>
        </form>
      </Sect>
      <div className="border-t border-line/60 pt-4">
        <PasswordForm />
      </div>
      {/* NTH2 1.1: Push „Handlungsbedarf“ für dieses Konto */}
      <div className="border-t border-line/60 pt-4">
        <AdminPush vapidKey={vapidPublicKey()} />
      </div>
    </>
  );
  const administration = (
    <>
      <AccountsPanel accounts={listAccounts()} campaigns={Object.entries(campaignNames).map(([id, name]) => ({ id, name }))} me={admin.id} />
      <HallOfFameLink hallUrl={`${origin}/hall/${token}`} />
      {/* Datenschutzhinweis (Art. 13 DSGVO) und Impressum – Pflichtangaben des Betreibers */}
      <LegalForm privacy={legalText('privacy')} imprint={legalText('imprint')} />
      <div className="border-t border-line/60 pt-4">
        <Sect title={t('Standardsprache')}>
          <form action={setDefaultLocaleForm} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select key={defaultLocale() ?? DEFAULT_LOCALE} className="select sm:w-44" name="defaultLocale" defaultValue={defaultLocale() ?? DEFAULT_LOCALE} aria-label={t('Standardsprache')}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </select>
            <button className="btn btn-sm self-start sm:self-auto">{t('Standardsprache speichern')}</button>
            <span className="basis-full text-[14px] text-dim">
              {t('Gilt für alle, die keine eigene Sprache gewählt haben: Anmeldung, Einladungen, Leseansicht und Spielerseiten ohne Kampagnensprache. Neue Kampagnen übernehmen sie als Kampagnensprache.')}
            </span>
          </form>
        </Sect>
      </div>
      <div className="border-t border-line/60 pt-4">
        <Sect title={t('Darstellung')}>
          <form action={setPlanetArtAction} className="space-y-3">
            <label className="flex items-start gap-2.5 text-[15px]">
              <input type="checkbox" name="planetArt" defaultChecked={planetArtEnabled()} className="mt-1 accent-[#dda94d]" />
              <span>
                {t('Planetenbilder verwenden')}
                <span className="block text-[14px] text-dim">
                  {t('An: Karte, Planetenakten, Leseansicht, Spielerseite und Codex zeigen Planetenporträts und Planetenlandschaften als Bilder. Aus: prozedural gezeichnete Planeten, keine Landschaftsbilder. Übrige Dekorationsbilder (Kopfzeile, Rahmen, Hintergründe) bleiben. Gilt für alle Kampagnen.')}
                </span>
              </span>
            </label>
            <button className="btn btn-sm">{t('Darstellung speichern')}</button>
          </form>
        </Sect>
      </div>
    </>
  );
  const services = (
    <>
      <p className="text-[15px] text-dim">{t('Dienste, die für alle Kampagnen gelten. Benachrichtigungen einer Kampagne stellst du in der Kampagne unter „Einstellungen“ im Register „Dienste“ ein.')}</p>
      <PublicUrlForm current={getSetting('publicUrl')} fromEnv={process.env.APP_URL?.trim() || null} suggestion={origin} />
      <SmtpForm current={smtp} fromEnv={!!smtpConfig() && !getSetting('smtp')} insecureEnv={smtpInsecureFromEnv()} />
      <DiscordBotForm current={discordBotStatus()} endpoint={`${origin}/api/discord/interactions`} />
    </>
  );
  const sections: AccountSection[] = [{ id: 'personal', label: t('Persönlich'), icon: 'ui_SKULL', content: personal }];
  if (owner) sections.push({ id: 'admin', label: t('Administration'), icon: 'em_crown', content: administration }, { id: 'services', label: t('Dienste'), icon: 'ui_COG', content: services });
  return (
    <AdminShell
      locale={locale}
      active="settings"
      user={t('Angemeldet als {name} · {role}', { name: admin.username, role: owner ? 'Admin' : 'Co-Warmaster' })}
      title={t('Konto')}
      icon="ui_COG"
      sideTitle={t('Verwaltungsprotokoll')}
      sideIcon="ui_SCROLL"
      sideFoldMobile
      side={
        /* Admins sehen alles, Co-Warmaster die Einträge ihrer freigegebenen Kampagnen */
        <AuditPanel entries={listAudit(campaignScope(admin), 50)} campaigns={campaignNames} locale={locale} />
      }
    >
      <AccountSections sections={sections} />
    </AdminShell>
  );
}
