'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Battle, CampaignState, Player } from '@/engine/types';
import { battleReadyFromHobby, HOBBY_STATUS, HOBBY_STATUS_LABEL, paintedPoints, type HobbyStatus } from '@/engine/hobby';
import { battleSizes } from '@/engine/campaignRules';
import { galleryPhotos, photoOfPhase, voteTally } from '@/engine/gallery';
import { stagePhase } from '@/engine/players';
import { playerUploadAction } from '@/app/actions/player';
import { useCmd } from '@/components/admin/CommandProvider';
import { Field, uploadUrl } from '@/components/ui';
import { GameIcon } from '@/components/icons/GameIcon';
import { useIntlLocale, useMsg, useT } from '@/i18n/client';
import { rememberPlayerLink, readBattleAnchor } from './playerLinkStore';

/**
 * Bausteine der Spielerseite aus Block P2: Bemal-Chronik (D5), Abstimmung über das Bild der Phase (NTH2 4.3)
 * und der Sprung aus dem QR-Code eines Ergebnisbogens direkt ins Meldeformular einer Schlacht (NTH2 1.3).
 */

// ─── Bemal-Chronik ────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

export function HobbySection({ token, me }: { token: string; me: Player }) {
  const { run, busy, readOnly, toast } = useCmd();
  const t = useT();
  const msg = useMsg();
  const il = useIntlLocale();
  const [date, setDate] = useState('');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState<HobbyStatus>('DONE');
  const [points, setPoints] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const entries = [...(me.hobby ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  return (
    <section className="hud space-y-3 p-3 text-[15px]" aria-labelledby="hobby-title">
      <p id="hobby-title" className="section-title">
        {t('Bemal-Chronik')}
      </p>
      <p className="text-dim">{t('Halte deinen Hobby-Fortschritt fest. Die Chronik steht in deinem Profil und im Codex; fertig bemalte Punkte helfen beim Häkchen „Battle Ready“.')}</p>
      <p>
        {t('Fertig bemalt:')} <b className="font-mono">{paintedPoints(me)}</b> {t('Punkte')}
      </p>
      {!readOnly && (
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run({ type: 'HOBBY_ADD', playerId: me.id, entry: { date: date || today(), unit, status, photo, points: Number(points) || 0 } });
            if (ok) {
              setUnit('');
              setPoints('');
              setPhoto(null);
            }
          }}
        >
          <Field label={t('Einheit')}>
            <input className="input" value={unit} maxLength={120} required onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label={t('Datum')}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('Stand')}>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as HobbyStatus)}>
              {HOBBY_STATUS.map((s) => (
                <option key={s} value={s}>
                  {t(HOBBY_STATUS_LABEL[s])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Punkte')}>
            <input className="input" type="number" min={0} max={5000} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <label className="btn btn-sm cursor-pointer">
              {uploading ? t('Lädt…') : photo ? t('Foto ersetzen') : t('Foto hinzufügen')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                className="sr-only"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const fd = new FormData();
                  fd.set('file', file);
                  fd.set('kind', 'BATTLE_PHOTO');
                  const r = await playerUploadAction(token, fd);
                  setUploading(false);
                  if (r.ok) setPhoto(r.id);
                  else toast('error', msg(r.error));
                  e.target.value = '';
                }}
              />
            </label>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadUrl(photo, true)!} alt="" className="h-11 w-11 border border-line object-cover" />
            )}
            <button className="btn btn-sm btn-primary ml-auto" disabled={busy || uploading || !unit.trim()}>
              {t('Eintragen')}
            </button>
          </div>
        </form>
      )}
      {entries.length > 0 && (
        <ul className="divide-y divide-line/60 border-y border-line/60">
          {entries.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2">
              {h.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploadUrl(h.photo, true)!} alt="" className="h-12 w-12 shrink-0 border border-line object-cover" />
              ) : (
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center border border-dashed border-line">
                  <GameIcon name="ui_SKULL" size={20} color="#9a927f" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{h.unit}</span>
                <span className="block text-[14px] text-dim">
                  {new Date(h.date).toLocaleDateString(il, { timeZone: 'UTC' })} · {t(HOBBY_STATUS_LABEL[h.status])}
                  {h.points ? ` · ${t('{n} Punkte', { n: h.points })}` : ''}
                </span>
              </span>
              {!readOnly && (
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run({ type: 'HOBBY_DELETE', playerId: me.id, id: h.id })}>
                  {t('entfernen')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Bild der Phase: Abstimmung ────────────────────────────────────────────

/** Abstimmung über das Bild der Phase (nur, wenn der Warmaster sie eingeschaltet hat) */
export function PhotoVoteSection({ me }: { me: Player }) {
  const { state, run, busy, readOnly } = useCmd();
  const t = useT();
  if (!state.gallery?.vote) return null;
  const all = galleryPhotos(state);
  const cur = stagePhase(state);
  // laufende und letzte Phase mit Fotos
  const phases = [...new Set(all.map((p) => p.phase))]
    .filter((n) => n > 0 && n <= Math.max(1, cur))
    .sort((a, b) => b - a)
    .slice(0, 2);
  if (!phases.length) return null;
  return (
    <section className="hud space-y-3 p-3 text-[15px]" aria-labelledby="vote-title">
      <p id="vote-title" className="section-title">
        {t('Bild der Phase wählen')}
      </p>
      {phases.map((n) => {
        const mine = state.phases.find((p) => p.number === n)?.photoVotes?.find((v) => v.playerId === me.id)?.uploadId ?? null;
        const tally = new Map(voteTally(state, n).map((v) => [v.uploadId, v.votes]));
        const gm = state.phases.find((p) => p.number === n)?.photo;
        return (
          <div key={n} className="space-y-1.5">
            <p className="text-dim">
              {t('Phase {n}', { n })}
              {gm && ` · ${t('Der Warmaster hat bereits ein Bild gewählt.')}`}
            </p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {all
                .filter((p) => p.phase === n)
                .map((p) => {
                  const on = mine === p.uploadId;
                  return (
                    <li key={p.uploadId}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={busy || readOnly}
                        onClick={() => run({ type: 'PHOTO_VOTE', playerId: me.id, phase: n, uploadId: on ? null : p.uploadId })}
                        className={`inset block w-full overflow-hidden text-left ${on ? 'shadow-[inset_0_0_0_2px_#dda94d]' : ''}`}
                        aria-label={on ? t('Stimme zurückziehen: {label}', { label: p.label }) : t('Stimme für: {label}', { label: p.label })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uploadUrl(p.uploadId, true)!} alt="" className="block aspect-[4/3] w-full object-cover" />
                        <span className="flex items-center justify-between px-1.5 py-1 text-[13px]">
                          <span className={on ? 'font-semibold text-accent' : 'text-dim'}>{on ? t('deine Wahl') : t('wählen')}</span>
                          <span className="font-mono text-faint">{tally.get(p.uploadId) ?? 0}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/** Aktuelles Bild der Phase (Lage der Spielerseite) */
export function PhasePhotoCard({ state }: { state: CampaignState }) {
  const t = useT();
  const n = stagePhase(state);
  const list = [n, n - 1].filter((x) => x > 0).map((x) => ({ n: x, p: photoOfPhase(state, x) }));
  const hit = list.find((x) => x.p);
  if (!hit?.p) return null;
  return (
    <section className="hud space-y-1.5 p-3">
      <p className="section-title">{t('Bild der Phase {n}', { n: hit.n })}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={uploadUrl(hit.p.uploadId)!} alt={hit.p.caption || t('Bild der Phase {n}', { n: hit.n })} className="block max-h-60 w-full border border-line object-cover" />
      {hit.p.caption && <p className="text-[15px] italic text-dim">{hit.p.caption}</p>}
    </section>
  );
}

// ─── Sprung aus dem QR-Code des Ergebnisbogens ────────────────────────────

/**
 * Merkt sich den Spielerlink auf diesem Gerät (für den QR-Code der Ergebnisbögen) und liest den Schlacht-Anker
 * (?battle=… bzw. #battle-…). Ergebnis: die Schlacht, wenn der Spieler daran beteiligt ist (Meldeformular öffnen),
 * sonst ein Hinweis.
 */
export function useBattleAnchor(state: CampaignState, campaignId: string | null, token: string, isMine: (b: Battle) => boolean): { battleId: string | null; foreign: boolean } {
  useEffect(() => {
    if (campaignId) rememberPlayerLink(campaignId, token);
  }, [campaignId, token]);
  const anchor = useSyncExternalStore(
    () => () => undefined,
    () => readBattleAnchor(window.location),
    () => null,
  );
  if (!anchor) return { battleId: null, foreign: false };
  const b = state.battles.find((x) => x.id === anchor);
  if (b && isMine(b)) return { battleId: b.id, foreign: false };
  return { battleId: null, foreign: true };
}

// ─── Battle Ready aus der Bemal-Chronik ─────────────────────────────────────

/**
 * Vorschlag für das Häkchen „Battle Ready“ der eigenen Seite (D5): laut Chronik sind mindestens so viele Punkte
 * fertig bemalt wie die Spielgröße der Schlacht verlangt. Null ohne Spielgröße oder ohne Seite.
 */
export function hobbyReady(state: CampaignState, b: Battle, me: Player): { side: 'ATTACKER' | 'DEFENDER'; suggest: boolean; painted: number; needed: number } | null {
  const side = b.attackers.some((p) => p.playerId === me.id) ? 'ATTACKER' : b.defenders.some((p) => p.playerId === me.id) ? 'DEFENDER' : null;
  const needed = battleSizes(state).find((s) => s.id === b.size)?.points ?? 0;
  if (!side || !needed || !(me.hobby ?? []).length) return null;
  const painted = paintedPoints(me);
  return { side, suggest: battleReadyFromHobby(me, needed), painted, needed };
}

export function HobbyReadyHint({ hint }: { hint: ReturnType<typeof hobbyReady> }) {
  const t = useT();
  if (!hint) return null;
  return (
    <p className={`text-[14px] sm:col-span-2 ${hint.suggest ? 'text-ok' : 'text-dim'}`}>
      {hint.suggest
        ? t('Bemal-Chronik: {p} von {n} Punkten fertig bemalt – Battle Ready für deine Seite ist vorgeschlagen.', { p: hint.painted, n: hint.needed })
        : t('Bemal-Chronik: {p} von {n} Punkten fertig bemalt.', { p: hint.painted, n: hint.needed })}
    </p>
  );
}
