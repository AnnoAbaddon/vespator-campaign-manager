'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaignAction } from '@/app/actions/campaign';
import { Field, TabPanel, Tabs } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { SaveIcon } from '@/components/icons';
import { useMsg, useT } from '@/i18n/client';

/** Kampagnen-Vorlage in der Auswahl (NTH2 2.6) */
export type CampaignTemplateOption = { id: string; name: string; phaseCount: number; allianceCount: 2 | 3; mapName: string };

export function NewCampaignForm({
  finished,
  mapTemplates = [],
  campaignTemplates = [],
  followUp,
}: {
  finished: { id: string; name: string }[];
  mapTemplates?: { id: string; name: string }[];
  campaignTemplates?: CampaignTemplateOption[];
  followUp?: string | null;
}) {
  const [err, action, pending] = useActionState(createCampaignAction, null);
  const t = useT();
  const msg = useMsg();
  const prev = finished.find((c) => c.id === followUp);
  // Vorlage belegt Allianz- und Phasenzahl vor und ersetzt die Kartenwahl
  const [tplId, setTplId] = useState('');
  const [alliances, setAlliances] = useState('3');
  const [phases, setPhases] = useState('6');
  const tpl = campaignTemplates.find((x) => x.id === tplId);
  return (
    <div className="@container">
      {prev && <p className="notice mb-3">{t('Folgekampagne zu „{name}“: Spieler, Allianzen und Medaillen werden übernommen.', { name: prev.name })}</p>}
      <form action={action} className="grid gap-3 @[20rem]:grid-cols-2" aria-label={t('Neue Kampagne')}>
        <div className="@[20rem]:col-span-2">
          <Field label={t('Name')}>
            <input className="input" name="name" required placeholder={t('z. B. Vespator Front – Herbst 2026')} />
          </Field>
        </div>
        {campaignTemplates.length > 0 && (
          <div className="@[20rem]:col-span-2">
            <Field label={t('Kampagnen-Vorlage')} hint={t('Übernimmt Hausregeln, Karte, Missionen, Spielgrößen, Phasenrhythmus und Texte.')}>
              <select
                className="select"
                name="campaignTemplate"
                value={tplId}
                onChange={(e) => {
                  setTplId(e.target.value);
                  const x = campaignTemplates.find((c) => c.id === e.target.value);
                  if (x) {
                    setAlliances(String(x.allianceCount));
                    setPhases(String(x.phaseCount));
                  }
                }}
              >
                <option value="">{t('– keine –')}</option>
                {campaignTemplates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label={t('Allianzen')}>
          <select className="select" name="allianceCount" value={alliances} onChange={(e) => setAlliances(e.target.value)}>
            <option value="3">{t('{n} Allianzen', { n: 3 })}</option>
            <option value="2">{t('{n} Allianzen', { n: 2 })}</option>
          </select>
        </Field>
        <Field label={t('Phasen')} hint={t('Empfohlen 4–6. Nach dem Start fix.')}>
          <input className="input" name="phaseCount" type="number" min={1} max={20} value={phases} onChange={(e) => setPhases(e.target.value)} required />
        </Field>
        <Field label={t('Karte')} hint={tpl ? t('Karte aus der Vorlage: {name}', { name: tpl.mapName }) : t('Eigene Karten speicherst du im Karteneditor (Setup) als Vorlage.')}>
          <select className="select" name="mapTemplate" defaultValue="vespator" disabled={!!tpl}>
            <option value="vespator">Vespator Front</option>
            {mapTemplates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <Field label={t('Vorkampagne (Spieler & Medaillen übernehmen)')}>
            <select className="select" name="previous" defaultValue={prev?.id ?? ''}>
              <option value="">{t('– keine –')}</option>
              {finished.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="@[20rem]:col-span-2">
          <Field label={t('Intro (Markdown, optional)')}>
            <textarea className="textarea" name="intro" rows={3} />
          </Field>
        </div>
        {err && (
          <p className="notice notice-danger @[20rem]:col-span-2" role="alert">
            {msg(err)}
          </p>
        )}
        <div className="@[20rem]:col-span-2">
          <button className="btn btn-primary w-full" disabled={pending}>
            {t('Anlegen')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ImportForm() {
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const t = useT();
  const msg = useMsg();
  return (
    <form
      aria-label={t('Backup importieren')}
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const file = fd.get('file');
        if (!(file instanceof File) || !file.size) return setErr(t('Keine Datei gewählt'));
        setPending(true);
        setErr(null);
        try {
          const res = await fetch(`/api/import?name=${encodeURIComponent(String(fd.get('name') ?? ''))}`, { method: 'POST', body: file });
          const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
          if (res.ok && j.id) router.push(`/admin/c/${j.id}`);
          else setErr(j.error ? msg(j.error) : t('Import fehlgeschlagen ({status})', { status: res.status }));
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-[15px] text-dim">{t('Ein Backup (ZIP inkl. Bilder oder JSON) wird immer als neue Kampagne angelegt – bestehende Kampagnen werden nie überschrieben.')}</p>
      <Field label={t('Backup-Datei (.zip oder .json)')}>
        <input className="input" type="file" name="file" accept="application/json,.json,application/zip,.zip" required />
      </Field>
      <Field label={t('Name (optional)')} hint={t('Ohne Angabe: Name des Backups mit dem Zusatz „(Kopie <Datum>)“.')}>
        <input className="input" name="name" />
      </Field>
      {err && (
        <p className="notice notice-danger" role="alert">
          {err}
        </p>
      )}
      <button className="btn w-full" disabled={pending}>
        {pending ? t('Importiere…') : t('Importieren')}
      </button>
    </form>
  );
}

/**
 * Anlegen und Importieren als umschaltbares Seitenpanel. Desktop: immer offen, Register wählt das Formular.
 * Mobil: zunächst eingeklappt – nur die beiden benannten Aktionen; ein Tipp öffnet das Formular.
 */
export function CampaignActions({
  finished,
  mapTemplates,
  campaignTemplates = [],
  followUp,
}: {
  finished: { id: string; name: string }[];
  mapTemplates: { id: string; name: string }[];
  campaignTemplates?: CampaignTemplateOption[];
  followUp?: string | null;
}) {
  const t = useT();
  const [sel, setSel] = useState<'new' | 'import'>('new');
  // mit ?folge=<id> (Endbildschirm „Folgekampagne anlegen“) gleich das vorbelegte Formular zeigen
  const [open, setOpen] = useState(!!followUp);
  return (
    <div className="space-y-4">
      {/* Mobil eingeklappt: klare Rangfolge – Anlegen als Hauptaktion, Import als Nebenaktion */}
      {!open && (
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSel('new');
              setOpen(true);
            }}
          >
            <GameIcon name="ui_PLANET" size={16} /> {t('Neue Kampagne')}
          </button>
          <button
            type="button"
            className="btn px-2 font-semibold text-dim"
            onClick={() => {
              setSel('import');
              setOpen(true);
            }}
          >
            <SaveIcon size={16} /> {t('Backup importieren')}
          </button>
        </div>
      )}
      <div className={open ? '' : 'hidden lg:block'}>
        <Tabs
          idBase="create"
          label={t('Anlegen & Importieren')}
          value={sel}
          onChange={(v) => {
            setSel(v);
            setOpen(true);
          }}
          tabs={[
            { id: 'new', label: t('Neue Kampagne'), icon: <GameIcon name="ui_PLANET" size={16} /> },
            { id: 'import', label: t('Backup importieren'), icon: <SaveIcon size={16} /> },
          ]}
        />
      </div>
      <TabPanel idBase="create" value={sel} className={open ? '' : 'hidden lg:block'}>
        {sel === 'new' ? <NewCampaignForm finished={finished} mapTemplates={mapTemplates} campaignTemplates={campaignTemplates} followUp={followUp} /> : <ImportForm />}
        <button type="button" className="btn btn-sm btn-ghost mt-3 w-full lg:hidden" onClick={() => setOpen(false)}>
          {t('Einklappen')}
        </button>
      </TabPanel>
    </div>
  );
}
