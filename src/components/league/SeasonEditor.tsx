'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSeasonAction, deleteSeasonAction, seasonTokenAction, updateSeasonAction } from '@/app/actions/league';
import { identityKey, type SeasonConfig, type SeasonData, type SeasonPlayer } from '@/server/leagueCompute';
import { CopyField } from '@/components/admin/settings/CopyField';
import { Sect } from '@/components/admin/settings/AccountSections';
import { ExternalIcon, SaveIcon } from '@/components/icons';
import { Field } from '@/components/ui';
import { useMsg, useT } from '@/i18n/client';

export interface CampaignChoice {
  id: string;
  name: string;
  ended: boolean;
  archived: boolean;
  /** Leseansicht eingeschaltet – nur dann erscheint die Kampagne in der Ruhmeshalle der Saison (F5) */
  public?: boolean;
  players: { id: string; nickname: string }[];
}

/** Neue Saison anlegen */
export function NewSeasonForm() {
  const t = useT();
  const msg = useMsg();
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createSeasonAction(name);
          if (!r.ok) return setError(msg(r.error));
          setName('');
          setError(null);
          router.push(`/admin/liga?s=${r.id}`);
        });
      }}
    >
      <Field label={t('Neue Saison')}>
        <input className="input w-64" value={name} maxLength={80} required placeholder={t('z. B. Saison 2026')} onChange={(e) => setName(e.target.value)} />
      </Field>
      <button className="btn btn-primary" disabled={pending || !name.trim()}>
        {t('Anlegen')}
      </button>
      {error && (
        <p className="basis-full text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

const CFG: [keyof SeasonConfig, string][] = [
  ['win', 'Sieg'],
  ['draw', 'Unentschieden'],
  ['loss', 'Niederlage'],
  ['participation', 'Teilnahme je Kampagne'],
  ['medal', 'Medaille'],
  ['campaignWin', 'Kampagnensieg der Allianz'],
];

/**
 * Saison bearbeiten (NTH2 3.1): Name, Kampagnen, Punkte der Rangliste, Ruhmeshalle und die Zuordnung der
 * Spieler über Kampagnen hinweg (Standard: Nickname; der Admin kann zusammenführen oder trennen).
 */
export function SeasonEditor({ id, name: name0, data, hallUrl, campaigns, standings }: { id: string; name: string; data: SeasonData; hallUrl: string; campaigns: CampaignChoice[]; standings: SeasonPlayer[] }) {
  const t = useT();
  const msg = useMsg();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(name0);
  const [d, setD] = useState<SeasonData>(data);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = name !== name0 || JSON.stringify(d) !== JSON.stringify(data);
  const keys = useMemo(() => [...new Set(standings.map((s) => s.key))].sort(), [standings]);
  const save = () =>
    start(async () => {
      const r = await updateSeasonAction(id, { name, data: d });
      setError(r.ok ? null : msg(r.error));
      if (r.ok) router.refresh();
    });
  const toggleCampaign = (cid: string, on: boolean) => setD({ ...d, campaignIds: on ? [...d.campaignIds, cid] : d.campaignIds.filter((x) => x !== cid) });
  const chosen = campaigns.filter((c) => d.campaignIds.includes(c.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('Name der Saison')}>
          <input className="input w-72" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={pending || !dirty} onClick={save}>
          <SaveIcon /> {t('Saison speichern')}
          {dirty && <span className="lamp lamp-on ml-1" aria-hidden />}
        </button>
        {error && (
          <p className="basis-full text-[14px] text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <Sect title={t('Kampagnen der Saison')}>
        {campaigns.length === 0 && <p className="text-[15px] text-faint">{t('Noch keine Kampagnen.')}</p>}
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
                <input type="checkbox" className="h-4 w-4 accent-[#dda94d]" checked={d.campaignIds.includes(c.id)} onChange={(e) => toggleCampaign(c.id, e.target.checked)} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.public === false && d.campaignIds.includes(c.id) && (
                  <span className="chip text-warn" title={t('Die Leseansicht dieser Kampagne ist ausgeschaltet – sie fehlt in der Ruhmeshalle der Saison.')}>
                    {t('nicht öffentlich')}
                  </span>
                )}
                <span className={`chip ${c.ended ? '' : 'text-dim'}`}>{c.ended ? t('beendet') : t('läuft')}</span>
              </label>
            </li>
          ))}
        </ul>
      </Sect>

      <Sect title={t('Punkte der Rangliste')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CFG.map(([k, label]) => (
            <Field key={k} label={t(label)}>
              <input type="number" className="input w-24" min={-10} max={50} value={d.config[k]} onChange={(e) => setD({ ...d, config: { ...d.config, [k]: Number(e.target.value) || 0 } })} />
            </Field>
          ))}
        </div>
      </Sect>

      <Sect title={t('Ruhmeshalle der Saison')}>
        <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
          <input type="checkbox" className="h-4 w-4 accent-[#dda94d]" checked={d.public} onChange={(e) => setD({ ...d, public: e.target.checked })} />
          {t('Öffentliche Ruhmeshalle (Link ohne Anmeldung, nicht in Suchmaschinen)')}
        </label>
        {data.public && (
          <>
            <CopyField value={hallUrl} label={t('Link zur Ruhmeshalle der Saison')} masked />
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-sm" href={hallUrl} target="_blank" rel="noreferrer">
                {t('Öffnen')} <ExternalIcon />
              </a>
              <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => void (await seasonTokenAction(id), router.refresh()))}>
                {t('Link neu erzeugen')}
              </button>
            </div>
          </>
        )}
        <Field label={t('Einleitung (öffentlich)')}>
          <textarea className="textarea" rows={3} maxLength={2000} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
        </Field>
      </Sect>

      <Sect title={t('Spieler über Kampagnen zuordnen')}>
        <p className="text-[14px] text-dim">{t('Standard: gleicher Nickname = gleiche Person. Gleiche Kennung in mehreren Zeilen führt Spieler zusammen, eine eigene Kennung trennt sie.')}</p>
        <datalist id="season-identities">
          {keys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        {chosen.length === 0 && <p className="text-[15px] text-faint">{t('Zuerst Kampagnen wählen und speichern.')}</p>}
        <div className="space-y-3">
          {chosen.map((c) => (
            <div key={c.id}>
              <p className="font-serif text-[15px] font-semibold text-ink">{c.name}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {c.players.map((p) => {
                  const k = `${c.id}:${p.id}`;
                  const value = d.identity[k] ?? identityKey(p.nickname);
                  return (
                    <label key={p.id} className="flex items-center gap-2 text-[14px]">
                      <span className="w-32 shrink-0 truncate">{p.nickname}</span>
                      <input
                        className="input min-w-0 flex-1"
                        list="season-identities"
                        aria-label={t('Kennung für {name}', { name: p.nickname })}
                        value={value}
                        onChange={(e) => {
                          const v = e.target.value;
                          const identity = { ...d.identity };
                          if (!v.trim() || v.trim().toLowerCase() === identityKey(p.nickname)) delete identity[k];
                          else identity[k] = v;
                          setD({ ...d, identity });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {standings.length > 0 && (
          <div className="space-y-1.5">
            <p className="label">{t('Anzeigename je Kennung')}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {standings.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-[14px]">
                  <span className="w-32 shrink-0 truncate font-mono text-dim">{s.key}</span>
                  <input
                    className="input min-w-0 flex-1"
                    value={d.names[s.key] ?? ''}
                    placeholder={s.name}
                    aria-label={t('Anzeigename für {key}', { key: s.key })}
                    onChange={(e) => setD({ ...d, names: { ...d.names, [s.key]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </Sect>

      <div className="border-t border-line/60 pt-4">
        {confirmDel ? (
          <button className="btn btn-danger" disabled={pending} onClick={() => start(async () => void (await deleteSeasonAction(id), router.push('/admin/liga')))}>
            {t('Saison wirklich löschen (Kampagnen bleiben erhalten)')}
          </button>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>
            {t('Saison löschen')}
          </button>
        )}
      </div>
    </div>
  );
}
