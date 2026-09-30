'use client';

import { useState } from 'react';
import type { Battle, BattleGame } from '@/engine/types';
import { aggregateGames, gameVictor } from '@/engine/missions';
import { battleSizes } from '@/engine/campaignRules';
import { playersOfAlliance } from '@/engine/players';
import { Field, UploadButton, uploadUrl } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { useCmd } from '../CommandProvider';
import { useT } from '@/i18n/client';

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const newGame = (b: Battle, n: number): BattleGame => ({
  id: `g${Date.now().toString(36)}${n}`,
  attackers: b.attackers.slice(0, 1),
  defenders: b.defenders.slice(0, 1),
  playedAt: null,
  size: b.size,
  missionName: '',
  vp: null,
  battleReady: { attacker: false, defender: false },
  report: '',
});

/**
 * Mehrere Einzelspiele je Battle Operation (N2.3). Gesamtsieger: Mehrheit der Einzelsiege,
 * dann VP-Summe (inkl. Battle Ready), sonst Unentschieden; Datum = spätestes Spiel.
 */
export function GamesEditor({ battle: b }: { battle: Battle }) {
  const { state, run, busy, campaignId } = useCmd();
  const t = useT();
  const [games, setGames] = useState<BattleGame[]>(() => structuredClone(b.games ?? []));
  const dirty = JSON.stringify(games) !== JSON.stringify(b.games ?? []);
  const agg = aggregateGames(games);
  const A = playersOfAlliance(state, b.attackerAllianceId, b.phaseNumber);
  const D = playersOfAlliance(state, b.defenderAllianceId, b.phaseNumber);
  const upd = (i: number, patch: Partial<BattleGame>) => setGames((l) => l.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const processed = b.status === 'PROCESSED';
  const who = (v: ReturnType<typeof gameVictor>) => t(v === 'ATTACKER' ? 'Angreifer' : v === 'DEFENDER' ? 'Verteidiger' : v === 'DRAW' ? 'Unentschieden' : 'offen');
  return (
    <details className="fold inset px-3 py-1 text-[15px]" open={games.length > 0}>
      <summary>
        <span className="hud-title">{t('Mehrere Einzelspiele')}</span> <span className="text-dim">({games.length})</span>
      </summary>
      <p className="mt-1 text-[13px] text-faint">{t('Gesamtsieger nach Mehrheit der Einzelsiege, dann VP-Summe inkl. Battle Ready. Mit Einzelspielen ersetzt das Gesamtergebnis die VP-Felder unten.')}</p>
      <fieldset disabled={processed} className="mt-2 space-y-3 pb-2">
        {games.map((g, i) => (
          <div key={g.id} className="slab space-y-2 p-2.5">
            <p className="flex items-center justify-between">
              <b>{t('Spiel {n}', { n: i + 1 })}</b> <span className="text-dim">{t('Sieger: {who}', { who: who(gameVictor(g)) })}</span>
            </p>
            <div className="grid gap-2 @lg:grid-cols-2 @4xl:grid-cols-4">
              <Field label={t('Angreifer')}>
                <select
                  className="select"
                  value={g.attackers[0]?.playerId ?? ''}
                  onChange={(e) => upd(i, { attackers: e.target.value ? [{ playerId: e.target.value, faction: state.players.find((p) => p.id === e.target.value)?.faction ?? '' }] : [] })}
                >
                  <option value="">–</option>
                  {A.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Verteidiger')}>
                <select
                  className="select"
                  value={g.defenders[0]?.playerId ?? ''}
                  onChange={(e) => upd(i, { defenders: e.target.value ? [{ playerId: e.target.value, faction: state.players.find((p) => p.id === e.target.value)?.faction ?? '' }] : [] })}
                >
                  <option value="">–</option>
                  {D.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('VP Angreifer')}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={g.vp?.attacker ?? ''}
                  onChange={(e) => upd(i, { vp: e.target.value === '' ? null : { attacker: Number(e.target.value), defender: g.vp?.defender ?? 0 } })}
                />
              </Field>
              <Field label={t('VP Verteidiger')}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={g.vp?.defender ?? ''}
                  onChange={(e) => upd(i, { vp: e.target.value === '' ? null : { attacker: g.vp?.attacker ?? 0, defender: Number(e.target.value) } })}
                />
              </Field>
              <Field label={t('Gespielt am')}>
                <input className="input" type="datetime-local" value={toLocal(g.playedAt)} onChange={(e) => upd(i, { playedAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </Field>
              <Field label={t('Größe')}>
                <select className="select" value={g.size ?? ''} onChange={(e) => upd(i, { size: e.target.value || null })}>
                  <option value="">–</option>
                  {battleSizes(state).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Mission')}>
                <input className="input" value={g.missionName} onChange={(e) => upd(i, { missionName: e.target.value })} placeholder={t('wie Schlacht')} />
              </Field>
              <div className="flex flex-col justify-end gap-1">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={g.battleReady.attacker} onChange={(e) => upd(i, { battleReady: { ...g.battleReady, attacker: e.target.checked } })} /> {t('BR Angreifer')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={g.battleReady.defender} onChange={(e) => upd(i, { battleReady: { ...g.battleReady, defender: e.target.checked } })} /> {t('BR Verteidiger')}
                </label>
              </div>
            </div>
            {/* Bericht und Fotos je Einzelspiel (N2.3) */}
            <Field label={t('Bericht zu diesem Spiel')}>
              <textarea className="textarea" rows={2} value={g.report} onChange={(e) => upd(i, { report: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {(g.photos ?? []).map((p) => (
                <span key={p} className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uploadUrl(p, true)!} alt={t('Schlachtfoto')} className="h-14 w-14 border border-line object-cover" />
                  <button
                    type="button"
                    className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-panel text-danger"
                    aria-label={t('Foto entfernen')}
                    onClick={() => upd(i, { photos: (g.photos ?? []).filter((x) => x !== p) })}
                  >
                    <CloseIcon size={10} />
                  </button>
                </span>
              ))}
              <UploadButton
                kind="BATTLE_PHOTO"
                campaignId={campaignId}
                multiple
                label={t('Fotos hinzufügen')}
                onUploaded={(id) => setGames((l) => l.map((x, j) => (j === i ? { ...x, photos: [...(x.photos ?? []), id] } : x)))}
              />
            </div>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setGames((l) => l.filter((_, j) => j !== i))}>
              {t('Spiel entfernen')}
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGames((l) => [...l, newGame(b, l.length)])}>
            {t('+ Einzelspiel')}
          </button>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !dirty} onClick={() => run({ type: 'BATTLE_UPDATE', battleId: b.id, update: { games } })}>
            {t('Einzelspiele speichern')}
          </button>
          {games.length > 0 && (
            <span className="text-dim">
              {t('Gesamt: {vp}', { vp: agg.vp ? `${agg.vp.attacker}:${agg.vp.defender}` : t('offen') })} · {who(agg.victor)}
            </span>
          )}
        </div>
      </fieldset>
    </details>
  );
}
