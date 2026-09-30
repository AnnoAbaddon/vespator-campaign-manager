'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCampaignTemplateAction, saveCampaignTemplateAction } from '@/app/actions/gmTools';
import { Panel, fmtDate } from '@/components/ui';
import { SaveIcon } from '@/components/icons';
import { useLocale, useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import type { CampaignInfo } from '../types';
import { useActionDialog, useBusy } from './ActionDialog';

/** Einstellungen → Kampagne: Stand als Kampagnen-Vorlage speichern (NTH2 2.6) */
export function TemplatePanel({ info }: { info: CampaignInfo }) {
  const { campaignId, state, toast } = useCmd();
  const t = useT();
  const msg = useMsg();
  const lc = useLocale();
  const router = useRouter();
  const [name, setName] = useState(state.meta.sandbox?.originalName ?? state.meta.name);
  const [pending, start] = useBusy();
  const { ask, dialog } = useActionDialog();
  const list = info.campaignTemplates ?? [];
  const exists = list.some((x) => x.name === name.trim());
  return (
    <Panel title={t('Kampagnen-Vorlage')} icon={<SaveIcon size={18} />}>
      <p className="text-[15px] text-dim">
        {t(
          'Speichert Hausregeln und Schalter, Karte, Missionen, Spielgrößen, Phasenrhythmus und Texte (Intro, Allianzen, Planeten, Dispatches, eigene Ereignisse) als Vorlage. Neue Kampagnen lassen sich daraus anlegen; Spieler und Spielstand gehören nicht dazu.',
        )}
      </p>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveCampaignTemplateAction(campaignId, name);
            if (r.ok) {
              toast('ok', t('Vorlage gespeichert'));
              router.refresh();
            } else toast('error', msg(r.error ?? 'Fehler'));
          });
        }}
      >
        <input className="input min-w-0 flex-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label={t('Name der Vorlage')} required />
        <button className="btn btn-sm" disabled={pending || !name.trim() || (exists && !info.isAdmin)}>
          <SaveIcon size={15} /> {exists ? t('Vorlage überschreiben') : t('Als Vorlage speichern')}
        </button>
      </form>
      {list.length > 0 && (
        <ul className="mt-3 divide-y divide-line/40 text-[15px]">
          {list.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="text-ink">{x.name}</span>
                <span className="block font-mono text-[13px] text-faint">
                  {fmtDate(x.createdAt, true, lc)}
                  {x.createdBy ? ` · ${x.createdBy}` : ''}
                </span>
              </span>
              {info.isAdmin && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if ((await ask({ title: t('Vorlage löschen'), text: t('Vorlage „{name}“ löschen? Bestehende Kampagnen bleiben unverändert.', { name: x.name }), confirmLabel: t('Löschen'), danger: true })) === null)
                        return;
                      await deleteCampaignTemplateAction(x.id);
                      toast('ok', t('Vorlage gelöscht'));
                      router.refresh();
                    })
                  }
                >
                  {t('Löschen')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </Panel>
  );
}
