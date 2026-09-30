'use client';

import { useState } from 'react';
import { ALLIANCE_COLORS } from '@/engine/data/vespator';
import type { Alliance } from '@/engine/types';
import { playersOfAlliance } from '@/engine/players';
import { Field, UploadButton, uploadUrl } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { ALLIANCE_EMBLEMS, DEFAULT_EMBLEMS, allianceEmblem } from '@/components/icons/registry';
import { useCmd } from '../CommandProvider';
import { useT } from '@/i18n/client';
import { TrInlineField } from '../texts/TrFields';
import type { TextTr } from '@/engine/contentLang';

/** Formular zum Anlegen/Bearbeiten einer Allianz */
export function AllianceEditor({ alliance, onDone, showLeader = true }: { alliance?: Alliance; onDone?: () => void; showLeader?: boolean }) {
  const { state, run, campaignId, busy } = useCmd();
  const t = useT();
  const used = state.alliances.filter((a) => a.id !== alliance?.id).map((a) => a.color.toLowerCase());
  const [name, setName] = useState(alliance?.name ?? '');
  const [color, setColor] = useState(alliance?.color ?? ALLIANCE_COLORS.find((c) => !used.includes(c)) ?? ALLIANCE_COLORS[0]);
  const [logo, setLogo] = useState<string | null>(alliance?.logo ?? null);
  const [emblem, setEmblem] = useState<string>(alliance ? allianceEmblem(alliance) : DEFAULT_EMBLEMS[state.alliances.length % DEFAULT_EMBLEMS.length]);
  const [lore, setLore] = useState(alliance?.lore ?? '');
  // NTH2 7.3: Lore in weiteren Sprachen
  const [loreTr, setLoreTr] = useState<TextTr>(() => ({ ...(alliance?.loreTr ?? {}) }));
  const [leader, setLeader] = useState<string | null>(alliance?.leaderPlayerId ?? null);
  const members = alliance ? playersOfAlliance(state, alliance.id) : [];
  const logoUrl = uploadUrl(logo, true);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run({
          type: 'ALLIANCE_UPSERT',
          id: alliance?.id,
          name,
          color,
          logo,
          emblem,
          lore,
          loreTr,
          ...(alliance && showLeader ? { leaderPlayerId: leader } : {}),
        });
        if (ok) {
          if (!alliance) {
            setName('');
            setLore('');
            setLogo(null);
          }
          onDone?.();
        }
      }}
    >
      <div className="grid gap-3 @lg:grid-cols-2">
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t('Farbe')}>
          <div className="flex flex-wrap items-center gap-1.5">
            {ALLIANCE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('Farbe {c}', { c })}
                className={`h-7 w-7 border-2 ${color.toLowerCase() === c ? 'border-white' : 'border-black'} ${used.includes(c) ? 'opacity-30' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
            <input type="color" className="h-7 w-9 cursor-pointer border border-line bg-deep" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t('Eigene Farbe')} />
          </div>
          {used.includes(color.toLowerCase()) && <span className="mt-1 block text-[13px] text-warn">{t('Farbe wird bereits verwendet')}</span>}
        </Field>
      </div>
      <Field label={t('Wappen')}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Wappen')}>
          {ALLIANCE_EMBLEMS.map((e) => (
            <button
              key={e.key}
              type="button"
              role="radio"
              aria-checked={emblem === e.key}
              title={t(e.label)}
              aria-label={t(e.label)}
              onClick={() => setEmblem(e.key)}
              className={`flex h-11 w-11 items-center justify-center border ${emblem === e.key ? 'border-accent bg-accent/15' : 'border-line bg-black/30 hover:border-line-bright'}`}
            >
              <GameIcon name={e.key} size={28} color={emblem === e.key ? color : '#bba77f'} />
            </button>
          ))}
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={t('Logo')} className="h-12 w-12 border border-line object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center border border-line text-[13px] text-faint">{t('Logo')}</span>
        )}
        <UploadButton kind="ALLIANCE_LOGO" campaignId={campaignId} onUploaded={setLogo} label={t('Logo hochladen')} />
        {logo && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLogo(null)}>
            {t('Logo entfernen')}
          </button>
        )}
      </div>
      {alliance && showLeader && (
        <Field label={t('Anführer (nur Info)')}>
          <select className="select" value={leader ?? ''} onChange={(e) => setLeader(e.target.value || null)}>
            <option value="">{t('– keiner –')}</option>
            {members.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={t('Lore (Markdown)')}>
        <textarea className="textarea" rows={3} value={lore} onChange={(e) => setLore(e.target.value)} />
      </Field>
      <TrInlineField value={loreTr} onChange={setLoreTr} label={t('Lore – Übersetzung')} />
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {alliance ? t('Speichern') : t('Allianz anlegen')}
        </button>
        {onDone && alliance && (
          <button type="button" className="btn" onClick={onDone}>
            {t('Abbrechen')}
          </button>
        )}
      </div>
    </form>
  );
}
