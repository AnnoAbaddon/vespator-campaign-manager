'use client';

import { useState } from 'react';
import { playersOfAlliance, stagePhase } from '@/engine/players';
import type { SkirmishInput } from '@/engine/skirmish';
import type { CampaignState, Skirmish } from '@/engine/types';
import { AllianceTag, Field, fromLocalInput } from '@/components/ui';
import { useIntlLocale, useT } from '@/i18n/client';

/**
 * Formular für ein freies Gefecht (B5). Spieler: eigene Allianz fest, eigener Name vorausgewählt.
 * Spielleiter: beide Allianzen frei wählbar.
 */
export function SkirmishForm({ state, me, allianceId, busy, onSubmit }: { state: CampaignState; me?: string; allianceId?: string; busy: boolean; onSubmit: (input: SkirmishInput) => Promise<boolean> }) {
  const t = useT();
  const phase = Math.max(1, stagePhase(state));
  const [a, setA] = useState(allianceId ?? state.alliances[0]?.id ?? '');
  const [b, setB] = useState(state.alliances.find((x) => x.id !== (allianceId ?? state.alliances[0]?.id))?.id ?? '');
  const [pa, setPa] = useState<string[]>(me ? [me] : []);
  const [pb, setPb] = useState<string[]>([]);
  const [vpA, setVpA] = useState('');
  const [vpB, setVpB] = useState('');
  const [winner, setWinner] = useState<'A' | 'B' | 'DRAW' | ''>('');
  const [playedAt, setPlayedAt] = useState('');
  const [mission, setMission] = useState('');
  const [note, setNote] = useState('');
  const vp = vpA !== '' && vpB !== '' ? { a: Number(vpA), b: Number(vpB) } : null;
  const ok = a && b && a !== b && pa.length && pb.length && (vp || winner);
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
  const side = (which: 'A' | 'B', al: string, sel: string[], set: (v: string[]) => void, fixed: boolean, label: string) => (
    <fieldset className="min-w-0 space-y-1">
      <legend className="label">{label}</legend>
      {fixed ? (
        <p className="text-[15px]">
          <AllianceTag alliance={state.alliances.find((x) => x.id === al)} />
        </p>
      ) : (
        <select
          className="select"
          value={al}
          aria-label={label}
          onChange={(e) => {
            if (which === 'A') setA(e.target.value);
            else setB(e.target.value);
            set([]);
          }}
        >
          {state.alliances.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap gap-x-3">
        {playersOfAlliance(state, al, phase).map((p) => (
          <label key={p.id} className="inline-flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="h-4 w-4 accent-[#dda94d]" checked={sel.includes(p.id)} disabled={p.id === me} onChange={(e) => set(toggle(sel, p.id, e.target.checked))} />
            {p.nickname}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        const done = await onSubmit({
          aAllianceId: a,
          aPlayerIds: pa,
          bAllianceId: b,
          bPlayerIds: pb,
          playedAt: playedAt ? fromLocalInput(playedAt) : null,
          vp,
          winner: vp ? undefined : winner || undefined,
          mission,
          note,
        });
        if (done) {
          setPb([]);
          setVpA('');
          setVpB('');
          setWinner('');
          setMission('');
          setNote('');
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {side('A', a, pa, setPa, !!allianceId, allianceId ? t('Deine Seite') : t('Seite A'))}
        {side('B', b, pb, setPb, false, allianceId ? t('Gegner') : t('Seite B'))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={allianceId ? t('Deine VP') : t('VP Seite A')}>
          <input className="input" type="number" min={0} inputMode="numeric" value={vpA} onChange={(e) => setVpA(e.target.value)} />
        </Field>
        <Field label={allianceId ? t('VP Gegner') : t('VP Seite B')}>
          <input className="input" type="number" min={0} inputMode="numeric" value={vpB} onChange={(e) => setVpB(e.target.value)} />
        </Field>
        <Field label={t('Sieger (ohne VP)')}>
          <select className="select" value={winner} disabled={!!vp} onChange={(e) => setWinner(e.target.value as typeof winner)}>
            <option value="">–</option>
            <option value="A">{allianceId ? t('Deine Seite') : t('Seite A')}</option>
            <option value="B">{allianceId ? t('Gegner') : t('Seite B')}</option>
            <option value="DRAW">{t('Unentschieden')}</option>
          </select>
        </Field>
        <Field label={t('Gespielt am')}>
          <input className="input" type="datetime-local" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" value={mission} maxLength={80} placeholder={t('Mission (optional)')} aria-label={t('Mission')} onChange={(e) => setMission(e.target.value)} />
        <input className="input" value={note} maxLength={500} placeholder={t('Notiz (optional)')} aria-label={t('Notiz')} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy || !ok}>
        {me ? t('Freies Gefecht melden') : t('Freies Gefecht eintragen')}
      </button>
    </form>
  );
}

/** Eine Zeile „Rot (P1) vs. Blau (P2): 60:20 – Rot siegt“ */
export function SkirmishLine({ state, s }: { state: CampaignState; s: Skirmish }) {
  const t = useT();
  const il = useIntlLocale();
  const al = (id: string) => state.alliances.find((a) => a.id === id);
  const names = (l: Skirmish['a']['players']) => l.map((p) => state.players.find((x) => x.id === p.playerId)?.nickname ?? '?').join(' & ');
  const res = s.winner === 'DRAW' ? t('Unentschieden') : t('{name} siegt', { name: al((s.winner === 'A' ? s.a : s.b).allianceId)?.name ?? '?' });
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-faint">{t('Phase {n}', { n: s.phaseNumber })}</span>
      <AllianceTag alliance={al(s.a.allianceId)} />
      <span className="text-dim">({names(s.a.players)})</span>
      <span className="text-faint">vs.</span>
      <AllianceTag alliance={al(s.b.allianceId)} />
      <span className="text-dim">({names(s.b.players)})</span>
      <span>
        {s.vp ? `${s.vp.a}:${s.vp.b} VP – ` : ''}
        {res}
      </span>
      {s.mission && <span className="text-dim">· {s.mission}</span>}
      {s.playedAt && <span className="text-faint">· {new Date(s.playedAt).toLocaleDateString(il, { timeZone: state.meta.timezone })}</span>}
    </span>
  );
}
