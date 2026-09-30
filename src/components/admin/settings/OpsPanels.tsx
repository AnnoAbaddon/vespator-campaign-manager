'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { backupNowAction, restoreBackupAction, retryOutboxAction, sendTestAction, setDiscordWebhookAction } from '@/app/actions/ops';
import { Panel } from '@/components/ui';
import { useCmd } from '../CommandProvider';
import { NoteIcon, SaveIcon } from '@/components/icons';
import type { CampaignInfo } from '../types';
import { useIntlLocale, useMsg, useT } from '@/i18n/client';

const when = (iso: string | null, intl: string) => (iso ? new Date(iso).toLocaleString(intl, { dateStyle: 'short', timeStyle: 'short' }) : '–');

function useAct() {
  const { toast } = useCmd();
  const router = useRouter();
  const [pending, start] = useTransition();
  const msg = useMsg();
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string; id?: string }>, after?: (r: { id?: string }) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast('error', msg(r.error ?? 'Fehler'));
      else {
        toast('ok', msg(r.message ?? 'Erledigt'));
        after?.(r);
        router.refresh();
      }
    });
  return { pending, act };
}

/** Discord-Webhook, Testnachrichten und Versandprotokoll (N1.4) */
/** Lesbarer Versandstatus der Outbox */
const OUTBOX_STATUS: Record<string, string> = { PENDING: 'wartet', SENDING: 'wird gesendet', SENT: 'gesendet', FAILED: 'fehlgeschlagen', SKIPPED: 'übersprungen (kein SMTP)' };

export function NotifyPanel({ info }: { info: CampaignInfo }) {
  const { campaignId } = useCmd();
  const { pending, act } = useAct();
  const [hook, setHook] = useState('');
  const [mail, setMail] = useState('');
  const t = useT();
  const intl = useIntlLocale();
  const msg = useMsg();
  const o = info.ops;
  const failed = o.outbox.filter((m) => m.status === 'FAILED').length;
  return (
    <Panel title={t('Benachrichtigungen')} icon={<NoteIcon size={18} />}>
      <p className="text-[14px] text-faint">
        {t('Discord je Kampagne, E-Mail über den globalen SMTP-Server (Konto → E-Mail-Versand). Spieler bestellen Kategorien auf ihrer Spielerseite oder per Link in jeder Mail ab.')}
      </p>
      <div className="inset mt-3 space-y-2 p-3">
        <p className="label">Discord-Webhook {o.webhook ? <span className="text-ok">· {t('eingerichtet')}</span> : <span className="text-faint">· {t('nicht eingerichtet')}</span>}</p>
        {o.webhook && <p className="break-all font-mono text-[13px] text-dim">{o.webhook}</p>}
        <div className="flex gap-2">
          <input className="input" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" aria-label="Discord-Webhook" />
          <button
            className="btn btn-sm shrink-0"
            disabled={pending}
            onClick={() =>
              act(
                () => setDiscordWebhookAction(campaignId, hook),
                () => setHook(''),
              )
            }
          >
            {hook ? t('Speichern') : t('Entfernen')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm btn-ghost" disabled={pending || !o.webhook} onClick={() => act(() => sendTestAction(campaignId, null))}>
            {t('Discord testen')}
          </button>
          {/* F10: Test-E-Mails über den Club-SMTP nur für Admins */}
          {info.isAdmin && (
            <>
              <input className="input w-56" type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder={t('Test-E-Mail an …')} aria-label={t('Test-E-Mail-Adresse')} />
              <button className="btn btn-sm btn-ghost" disabled={pending || !mail.includes('@') || !o.smtp} onClick={() => act(() => sendTestAction(campaignId, mail))}>
                {t('E-Mail testen')}
              </button>
              {!o.smtp && <span className="text-[14px] text-warn">{t('SMTP ist nicht eingerichtet')}</span>}
            </>
          )}
        </div>
      </div>
      <details className="fold mt-2">
        <summary>
          {t('Versandprotokoll ({n})', { n: o.outbox.length })}
          {failed > 0 && <span className="text-danger"> · {t('{n} fehlgeschlagen', { n: failed })}</span>}
        </summary>
        {failed > 0 && (
          <button className="btn btn-sm mt-2" disabled={pending} onClick={() => act(() => retryOutboxAction(campaignId))}>
            {t('Fehlgeschlagene erneut senden')}
          </button>
        )}
        <ul className="inset mt-2 space-y-1 p-2 text-[14px]">
          {o.outbox.map((m) => (
            <li key={m.id} className="flex flex-wrap gap-x-2">
              {/* SKIPPED: ohne SMTP nicht versendet (kein Fehler) – Leuchte aus */}
              <span className={`lamp mt-1 ${m.status === 'SENT' ? 'lamp-ok' : m.status === 'FAILED' ? 'lamp-alert' : m.status === 'SKIPPED' ? '' : 'lamp-on'}`} role="img" aria-label={t(OUTBOX_STATUS[m.status] ?? m.status)} />
              <span className={m.status === 'FAILED' ? 'text-danger' : 'text-faint'}>{t(m.channel === 'PUSH' && m.status === 'SKIPPED' ? 'übersprungen' : (OUTBOX_STATUS[m.status] ?? m.status))}</span>
              <span className="text-dim">{when(m.sent_at ?? m.created_at, intl)}</span>
              <span>{m.channel === 'DISCORD' ? 'Discord' : m.channel === 'PUSH' ? 'Web-Push' : m.recipient}</span>
              <span className="text-faint">{m.subject}</span>
              {m.last_error && <span className={m.status === 'SKIPPED' ? 'text-faint' : 'text-danger'}>{msg(m.last_error)}</span>}
            </li>
          ))}
          {o.outbox.length === 0 && <li className="text-faint">{t('Noch nichts verschickt.')}</li>}
        </ul>
      </details>
    </Panel>
  );
}

/** Automatische Backups (N5.1): täglich 03:00, 14 Stück, Wiederherstellung als neue Kampagne */
export function BackupPanel({ info }: { info: CampaignInfo }) {
  const { campaignId } = useCmd();
  const { pending, act } = useAct();
  const router = useRouter();
  const b = info.ops.backups;
  const t = useT();
  const intl = useIntlLocale();
  return (
    <Panel title={t('Automatische Backups')} icon={<SaveIcon size={18} />}>
      <p className="text-[14px] text-faint">{t('Täglich ab 03:00 Uhr ein Komplett-ZIP (Stand, Historie, Bilder). Die letzten 14 bleiben erhalten. Wiederherstellen legt immer eine neue Kampagne an.')}</p>
      <p className="mt-2 text-[15px]">
        {t('Letztes Backup:')} {b[0] ? `${when(b[0].at, intl)} · ${Math.round(b[0].size / 1024)} KB` : <span className="text-faint">{t('noch keins')}</span>}
      </p>
      <button className="btn btn-sm mt-2" disabled={pending} onClick={() => act(() => backupNowAction(campaignId))}>
        {t('Jetzt sichern')}
      </button>
      {b.length > 0 && (
        <ul className="inset mt-3 space-y-1 p-2 text-[15px]">
          {b.map((x) => (
            <li key={x.file} className="flex items-center justify-between gap-2">
              <span className="font-mono text-[13px]">
                {when(x.at, intl)} · {Math.round(x.size / 1024)} KB
              </span>
              <button
                className="btn btn-sm btn-ghost"
                disabled={pending || !info.isAdmin}
                title={info.isAdmin ? undefined : t('Wiederherstellen dürfen nur Admins')}
                onClick={() =>
                  confirm(t('Dieses Backup als neue Kampagne wiederherstellen?')) &&
                  act(
                    () => restoreBackupAction(campaignId, x.file),
                    (r) => r.id && router.push(`/admin/c/${r.id}`),
                  )
                }
              >
                {t('Wiederherstellen')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
