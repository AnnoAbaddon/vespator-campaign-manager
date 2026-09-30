'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applySandboxAction, createSandboxAction, discardSandboxAction } from '@/app/actions/gmTools';
import { Panel, fmtDate } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { ArrowLeftIcon } from '@/components/icons';
import { useLocale, useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { useCampaignInfo } from '../infoCtx';
import type { CampaignInfo } from '../types';
import { useActionDialog, useBusy } from './ActionDialog';

/**
 * Leiste in einer Szenario-Sandbox (NTH2 2.1): woher die Kopie stammt, Übernehmen (Override mit Begründung),
 * Verwerfen, zurück zum Original. Kompakt, damit die Seitenleiste auf einen Bildschirm passt.
 */
export function SandboxBar({ compact = false }: { compact?: boolean }) {
  const info = useCampaignInfo();
  const { campaignId, toast } = useCmd();
  const t = useT();
  const msg = useMsg();
  const router = useRouter();
  const [pending, start] = useBusy();
  const { ask, dialog } = useActionDialog();
  const sb = info.sandbox;
  if (!sb) return null;
  const changed = sb.originalRev !== sb.baseRev;

  const apply = () =>
    start(async () => {
      const reason = await ask({
        title: t('Sandbox übernehmen'),
        text: t('Die Schritte der Sandbox werden als Revisionen an „{name}“ angehängt und gelten dann wirklich (Benachrichtigungen inklusive). Ein Undo nimmt die ganze Übernahme zurück.', { name: sb.ofName }),
        reason: true,
        confirmLabel: t('Übernehmen'),
      });
      if (!reason) return;
      let r = await applySandboxAction(campaignId, reason);
      if (!r.ok && 'confirm' in r) {
        const ok = await ask({ title: t('Sandbox übernehmen'), text: msg(r.confirm), confirmLabel: t('Trotzdem übernehmen'), danger: true });
        if (ok === null) return;
        r = await applySandboxAction(campaignId, reason, true);
      }
      if (r.ok) {
        toast('ok', t('Sandbox übernommen'));
        router.push(`/admin/c/${r.originalId}`);
      } else toast('error', msg('error' in r ? r.error : r.confirm));
    });

  const discard = () =>
    start(async () => {
      const ok = await ask({ title: t('Sandbox verwerfen'), text: t('Die Sandbox und alle ihre Schritte werden gelöscht. Die Kampagne bleibt unverändert.'), confirmLabel: t('Verwerfen'), danger: true });
      if (ok === null) return;
      const r = await discardSandboxAction(campaignId);
      if (r.ok) {
        toast('ok', t('Sandbox verworfen'));
        router.push(`/admin/c/${r.originalId}`);
      } else toast('error', msg(r.error));
    });

  return (
    <div className={`sandbox-bar notice flex-col items-stretch gap-2 ${compact ? 'text-[14px]' : 'text-[15px]'}`} role="status" aria-label={t('Szenario-Sandbox')}>
      <p className="flex items-start gap-2">
        <span className="lamp lamp-on mt-1.5" aria-hidden />
        <span className="min-w-0 flex-1">
          <b className="text-ink">{t('Sandbox')}</b> · {t('Kopie von „{name}“', { name: sb.ofName })}
          {changed && <span className="block text-[13px] text-warn">{t('Original seit dem Anlegen geändert (Rev. {a} → {b})', { a: sb.baseRev, b: sb.originalRev })}</span>}
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-sm btn-primary flex-1" disabled={pending} onClick={apply}>
          {t('Übernehmen')}
        </button>
        <button type="button" className="btn btn-sm btn-danger flex-1" disabled={pending} onClick={discard}>
          {t('Verwerfen')}
        </button>
        <Link className="btn btn-sm btn-ghost" href={`/admin/c/${sb.of}`} title={t('Zur Originalkampagne')} aria-label={t('Zur Originalkampagne')}>
          <ArrowLeftIcon size={15} /> {t('Original')}
        </Link>
      </div>
      {dialog}
    </div>
  );
}

/** Einstellungen → Kampagne: Sandbox anlegen und offene Sandboxes verwalten (NTH2 2.1) */
export function SandboxPanel({ info }: { info: CampaignInfo }) {
  const { campaignId, toast, readOnly } = useCmd();
  const t = useT();
  const msg = useMsg();
  const lc = useLocale();
  const router = useRouter();
  const [pending, start] = useBusy();
  const { ask, dialog } = useActionDialog();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (info.sandbox) return null;
  const list = info.sandboxes ?? [];
  return (
    <Panel title={t('Szenario-Sandbox')} icon={<GameIcon name="ui_DICE" size={18} />}>
      <p className="text-[15px] text-dim">
        {t(
          'Eine Kopie der Kampagne zum Ausprobieren: Befehle, Würfe und Ereignisse durchspielen (Ereignisse lassen sich dort auch erzwingen). Danach verwerfen oder bewusst übernehmen. Die Sandbox benachrichtigt niemanden und hat keine Leseansicht.',
        )}
      </p>
      <button
        type="button"
        className="btn btn-sm mt-2"
        disabled={pending || readOnly}
        onClick={() =>
          start(async () => {
            const r = await createSandboxAction(campaignId);
            if (r.ok) router.push(`/admin/c/${r.id}`);
            else toast('error', msg(r.error));
          })
        }
      >
        {t('Sandbox anlegen')}
      </button>
      {list.length > 0 && (
        <ul className="mt-3 divide-y divide-line/40 text-[15px]">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="text-ink">{s.name}</span>
                <span className="block font-mono text-[13px] text-faint">{t('{n} Schritt(e) · angelegt {date}', { n: s.steps, date: fmtDate(s.createdAt, true, lc) })}</span>
              </span>
              <Link className="btn btn-sm" href={`/admin/c/${s.id}`}>
                {t('Öffnen')}
              </Link>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busyId === s.id}
                onClick={async () => {
                  const ok = await ask({ title: t('Sandbox verwerfen'), text: t('Die Sandbox und alle ihre Schritte werden gelöscht. Die Kampagne bleibt unverändert.'), confirmLabel: t('Verwerfen'), danger: true });
                  if (ok === null) return;
                  setBusyId(s.id);
                  const r = await discardSandboxAction(s.id);
                  setBusyId(null);
                  if (r.ok) {
                    toast('ok', t('Sandbox verworfen'));
                    router.refresh();
                  } else toast('error', msg(r.error));
                }}
              >
                {t('Verwerfen')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </Panel>
  );
}
