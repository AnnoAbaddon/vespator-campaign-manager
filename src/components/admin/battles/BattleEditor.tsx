'use client';

import { useState } from 'react';
import { ATTACK_TYPES, THEATRES, twistIndex, type TheatreId } from '@/engine/data/vespator';
import { battleSizes } from '@/engine/campaignRules';
import { effectiveVictor } from '@/engine/outcomes';
import { playersOfAlliance } from '@/engine/players';
import { computeVictor } from '@/engine/phase';
import type { Battle, Participant, Victor } from '@/engine/types';
import { AllianceTag, AttackIcon, Field, fromLocalInput, Markdown, toLocalInput, UploadButton, uploadUrl } from '@/components/ui';
import { TheatreBadge } from '@/components/map/icons';
import { CloseIcon, DiceIcon, ExternalIcon } from '@/components/icons';
import { useCmd } from '../CommandProvider';
import { OutcomeEditor } from './OutcomeEditor';
import { battleTitle, StatusChip, vpText } from './common';
import { planetDef } from '@/engine/map';
import { PlayerInput } from './PlayerInput';
import { battlesPerPlayer } from '@/engine/playerActions';
import { rankDefenders } from '@/engine/pairings';
import { missionFromId, missionKey, missionPool, missionRepeat } from '@/engine/missionPool';
import { GuestEditor } from './GuestEditor';
import { GamesEditor } from './GamesEditor';
import { allMissions } from '@/engine/missions';
import { useT } from '@/i18n/client';

const CHOOSER: Record<string, string> = {
  ATTACKER: 'Angreifer wählt',
  DEFENDER_AUXILIA: 'Verteidiger wählt (Logistical Auxilia)',
  RANDOM: 'zufällig (Sinister Omens)',
};

function Participants({
  label,
  allianceId,
  phase,
  value,
  onChange,
  commanders,
  battleId,
  opponents = [],
}: {
  label: string;
  allianceId: string;
  phase: number;
  value: Participant[];
  onChange: (v: Participant[]) => void;
  /** Angreiferseite: Kommandanten der angreifenden Flotten (stehen durch den Befehl fest) */
  commanders?: string[];
  /** A3/A4: Schlacht (wird bei der Zählung ausgenommen) und gegnerische Spieler für die Paarungs-Historie */
  battleId?: string;
  opponents?: string[];
}) {
  const { state } = useCmd();
  const t = useT();
  const members = playersOfAlliance(state, allianceId, phase);
  const others = state.players.filter((p) => p.active && !members.some((m) => m.id === p.id));
  const al = state.alliances.find((a) => a.id === allianceId);
  // N1.6: Verteidiger mit den wenigsten Schlachten dieser Phase vorschlagen. Den Angreifer legt die Flotte fest –
  // dort nur deren Kommandanten anbieten, solange sie noch nicht eingetragen sind.
  const load = battlesPerPlayer(state, phase);
  // A3/A4: Rangfolge nach Spiellast, Paarungs-Historie und Gesamtzahl; Spieler an der harten Obergrenze nie vorschlagen
  const ranked = commanders ? [] : rankDefenders(state, allianceId, phase, opponents, battleId);
  const best = ranked[0] && !ranked[0].capped && !value.length ? ranked[0] : null;
  const capped = new Set(ranked.filter((r) => r.capped).map((r) => r.playerId));
  const sugIds = commanders ? commanders.filter((id) => !value.some((p) => p.playerId === id)) : best ? [best.playerId] : [];
  const sugPlayers = sugIds.map((id) => state.players.find((p) => p.id === id)).filter((p) => !!p);
  const nick = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '?';
  const why = best
    ? best.fresh.length
      ? t('noch nie gegen {names} gespielt', { names: best.fresh.map(nick).join(' & ') })
      : opponents.length
        ? t('{n} Paarung(en) mit dem Gegner', { n: best.pairings })
        : ''
    : '';
  return (
    <div>
      <span className="label">
        {label} · <AllianceTag alliance={al} />
        {sugPlayers.map((sp) => (
          <button key={sp.id} type="button" className="btn btn-sm btn-ghost ml-2" onClick={() => onChange([...value.filter((p) => p.playerId), { playerId: sp.id, faction: sp.faction }])}>
            {commanders ? t('Flottenkommandant: {name}', { name: sp.nickname }) : t('Vorschlag: {name} ({n} Schlacht(en) diese Phase)', { name: sp.nickname, n: load[sp.id] ?? 0 })}
            {!commanders && why ? ` · ${why}` : ''}
          </button>
        ))}
      </span>
      <div className="space-y-2">
        {value.map((p, i) => (
          <div key={i} className="flex gap-2">
            <select
              className="select"
              value={p.playerId}
              aria-label={t('{side}: Spieler {n}', { side: label, n: i + 1 })}
              onChange={(e) => {
                const pl = state.players.find((x) => x.id === e.target.value);
                onChange(value.map((x, j) => (j === i ? { playerId: e.target.value, faction: pl?.faction || x.faction } : x)));
              }}
            >
              <option value="">{t('– Spieler –')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nickname}
                  {capped.has(m.id) ? ` – ${t('Obergrenze erreicht')}` : ''}
                </option>
              ))}
              {others.length > 0 && (
                <optgroup label={t('Andere Allianzen')}>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nickname}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <input
              className="input"
              list="faction-list"
              placeholder={t('Fraktion')}
              aria-label={t('{side}: Fraktion {n}', { side: label, n: i + 1 })}
              value={p.faction}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, faction: e.target.value } : x)))}
            />
            <button type="button" className="btn btn-sm" aria-label={t('{side}: Spieler {n} entfernen', { side: label, n: i + 1 })} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <CloseIcon />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => onChange([...value, { playerId: members[0]?.id ?? '', faction: members[0]?.faction ?? '' }])}>
          {t('+ Spieler')}
        </button>
      </div>
    </div>
  );
}

interface Form {
  attackers: Participant[];
  defenders: Participant[];
  playedAt: string;
  size: string;
  missionSource: Battle['mission']['source'];
  missionName: string;
  missionId: string;
  theatre: TheatreId | '';
  vpA: string;
  vpD: string;
  readyA: boolean;
  readyD: boolean;
  victorOverride: Victor | '';
  report: string;
  notes: string;
  photos: string[];
}

function toForm(b: Battle): Form {
  return {
    attackers: b.attackers,
    defenders: b.defenders,
    playedAt: toLocalInput(b.playedAt ?? b.scheduledAt ?? null),
    size: b.size ?? '',
    missionSource: b.mission.source,
    missionName: b.mission.externalName,
    missionId: b.mission.missionId ?? '',
    theatre: b.theatre ?? '',
    vpA: b.vp ? String(b.vp.attacker) : '',
    vpD: b.vp ? String(b.vp.defender) : '',
    readyA: b.battleReady.attacker,
    readyD: b.battleReady.defender,
    victorOverride: b.victorOverride && b.victor ? b.victor : '',
    report: b.report,
    notes: b.notes,
    photos: b.photos,
  };
}

export function BattleEditor(props: { battle: Battle; onClose?: () => void }) {
  // Nur bei Wechsel der Schlacht neu mounten; Serveränderungen werden feldweise eingemischt
  return <BattleEditorInner key={props.battle.id} {...props} />;
}

function BattleEditorInner({ battle, onClose }: { battle: Battle; onClose?: () => void }) {
  const { state, run, busy, campaignId } = useCmd();
  const t = useT();
  const [f, setF] = useState<Form>(() => toForm(battle));
  const server = toForm(battle);
  const key = JSON.stringify(server);
  // Server-Stand hat sich geändert (Würfeln, Foto, Speichern): unveränderte Felder übernehmen,
  // ungespeicherte Eingaben der SL bleiben erhalten.
  const [lastServer, setLastServer] = useState<Form>(server);
  if (JSON.stringify(lastServer) !== key) {
    const merged = { ...f } as Record<string, unknown>;
    for (const k of Object.keys(server) as (keyof Form)[]) {
      if (JSON.stringify(f[k]) === JSON.stringify(lastServer[k])) merged[k] = server[k];
    }
    setLastServer(server);
    setF(merged as unknown as Form);
  }
  const [preview, setPreview] = useState(false);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const campaign = battle.kind === 'CAMPAIGN';
  const processed = battle.status === 'PROCESSED';
  const theatres = battle.planetId ? (planetDef(battle.planetId)?.theatres ?? []) : [];
  const boarding = battle.attackType === 'BOARDING_ACTION';
  const dirty = JSON.stringify(f) !== key;

  const vp = f.vpA !== '' && f.vpD !== '' ? { attacker: Number(f.vpA), defender: Number(f.vpD) } : null;
  // „Gespielt am“ ist mit dem vereinbarten Termin vorbelegt; gespeichert wird er erst mit einem Ergebnis oder nach Änderung
  const prefilled = !battle.playedAt && battle.scheduledAt ? toLocalInput(battle.scheduledAt) : null;
  const playedAtOut = !vp && prefilled !== null && f.playedAt === prefilled ? null : fromLocalInput(f.playedAt);
  // Angreifer stehen durch die Flotten der Operationen fest (Kommandant der Phase)
  const ops = state.phases.find((p) => p.number === battle.phaseNumber)?.operations ?? [];
  const commanders = [
    ...new Set(
      battle.operationIds
        .map((id) => ops.find((o) => o.id === id)?.fleetId)
        .map((fid) => state.fleets.find((x) => x.id === fid)?.commanders[String(battle.phaseNumber)])
        .filter((x): x is string => !!x),
    ),
  ];
  // Theatre und Twist in einem Zug: ein noch nicht gespeichertes Theatre wird mit dem Twist übernommen
  const theatreDirty = f.theatre !== (battle.theatre ?? '');
  const twistTheatre = f.theatre || null;
  const rollTwist = async (manual?: number) => {
    if (manual) return run({ type: 'BATTLE_UPDATE', battleId: battle.id, update: theatreDirty ? { theatre: twistTheatre, twistRoll: manual } : { twistRoll: manual } });
    if (theatreDirty && !(await run({ type: 'BATTLE_UPDATE', battleId: battle.id, update: { theatre: twistTheatre } }))) return false;
    return run({ type: 'BATTLE_ROLL', battleId: battle.id, what: 'TWIST' });
  };
  const autoVictor = computeVictor({ ...battle, vp, battleReady: { attacker: f.readyA, defender: f.readyD } });
  // A1: Missions-Pool der Angriffsart und Wiederholungs-Hinweis für die gewählte Mission
  const pool = missionPool(state, battle.attackType);
  const formMission: Battle['mission'] = { source: f.missionSource, externalName: f.missionName, ...(f.missionSource === 'LIST' ? { missionId: f.missionId } : {}) };
  const formKey = missionKey({ mission: formMission, attackType: battle.attackType });
  const repeat = missionRepeat(state, battle, formMission);
  const repeatLocked = !!repeat && !!state.toggles.missionRepeatLock && repeat.alternative;

  const save = async () => {
    const ok = await run({
      type: 'BATTLE_UPDATE',
      battleId: battle.id,
      update: {
        attackers: f.attackers.filter((p) => p.playerId),
        defenders: f.defenders.filter((p) => p.playerId),
        playedAt: playedAtOut,
        size: f.size || null,
        mission: { source: f.missionSource, externalName: f.missionName, ...(f.missionSource === 'LIST' ? { missionId: f.missionId } : {}) },
        ...(campaign && !boarding ? { theatre: f.theatre || null } : {}),
        ...(processed ? {} : { vp, battleReady: { attacker: f.readyA, defender: f.readyD }, victorOverride: f.victorOverride || null }),
        report: f.report,
        notes: f.notes,
        photos: f.photos,
      },
    });
    return ok;
  };

  return (
    <div className="space-y-4">
      <PlayerInput battle={battle} />
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="hud-title inline-flex items-center gap-2">
          <AttackIcon type={battle.attackType} size={22} /> {battleTitle(battle, t)}
        </h3>
        <StatusChip status={battle.status} />
        {battle.operationIds.length > 1 && <span className="chip border-accent text-accent">{t('{n} Ops gebündelt', { n: battle.operationIds.length })}</span>}
        {battle.postponedFrom && <span className="chip">{t('verschoben')}</span>}
        <span className="chip">{t('Phase {n}', { n: battle.phaseNumber })}</span>
        {campaign && (
          <a className="link inline-flex items-center gap-1 text-[13px]" href={`/admin/c/${campaignId}/briefing/${battle.id}`} target="_blank" rel="noreferrer">
            Briefing <ExternalIcon size={13} />
            <span className="sr-only">{t('(öffnet in neuem Tab)')}</span>
          </a>
        )}
        {onClose && (
          <button type="button" className="btn btn-sm ml-auto" onClick={onClose}>
            {t('Schließen')}
          </button>
        )}
      </div>

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Participants
          label={t('Angreifer')}
          allianceId={battle.attackerAllianceId}
          phase={battle.phaseNumber}
          value={f.attackers}
          onChange={(v) => set({ attackers: v })}
          commanders={battle.kind === 'CAMPAIGN' || battle.kind === 'KILL_TEAM' || battle.kind === 'INTERCEPT' ? commanders : undefined}
        />
        <Participants
          label={t('Verteidiger')}
          allianceId={battle.defenderAllianceId}
          phase={battle.phaseNumber}
          value={f.defenders}
          onChange={(v) => set({ defenders: v })}
          battleId={battle.id}
          opponents={f.attackers.map((p) => p.playerId).filter(Boolean)}
        />
      </div>
      <GuestEditor battle={battle} />

      <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
        <Field label={t('Gespielt am')} hint={prefilled !== null && f.playedAt === prefilled ? t('vorbelegt mit dem vereinbarten Termin') : undefined}>
          <input className="input" type="datetime-local" value={f.playedAt} onChange={(e) => set({ playedAt: e.target.value })} />
        </Field>
        <Field label="Battle Size">
          <select className="select" value={f.size} onChange={(e) => set({ size: e.target.value })}>
            <option value="">–</option>
            {battleSizes(state).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({t('{n} Pkt.', { n: s.points })})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Mission')}>
          <div className="flex gap-2">
            <select className="select w-auto" value={f.missionSource} onChange={(e) => set({ missionSource: e.target.value as Form['missionSource'] })} aria-label={t('Missionsquelle')}>
              <option value="VESPATOR">{battle.attackType ? `Vespator (${ATTACK_TYPES[battle.attackType].name})` : 'Vespator'}</option>
              <option value="LIST">{t('aus der Missionsliste')}</option>
              <option value="SPACE">{t('Raumkampf (extern)')}</option>
              <option value="EXTERNAL">{t('andere (Freitext)')}</option>
            </select>
            {f.missionSource === 'LIST' && (
              <select className="select" value={f.missionId} onChange={(e) => set({ missionId: e.target.value })} aria-label={t('Mission')}>
                <option value="">{t('– Mission –')}</option>
                {allMissions(state)
                  .filter((m) => !m.attackTypes.length || (battle.attackType && m.attackTypes.includes(battle.attackType)))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.source})
                    </option>
                  ))}
              </select>
            )}
            {(f.missionSource === 'EXTERNAL' || f.missionSource === 'SPACE') && (
              <input
                className="input"
                placeholder={f.missionSource === 'SPACE' ? t('z. B. Battlefleet Gothic') : t('Name der Mission')}
                aria-label={t('Name der Mission')}
                value={f.missionName}
                onChange={(e) => set({ missionName: e.target.value })}
              />
            )}
          </div>
          {pool.length > 0 && battle.attackType && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[14px]" role="group" aria-label={t('Missions-Pool')}>
              <span className="text-dim">{t('Pool:')}</span>
              {pool.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={formKey === m.id}
                  className={`btn btn-sm ${formKey === m.id ? 'border-accent bg-accent/15' : ''}`}
                  onClick={() => {
                    const next = missionFromId(battle.attackType!, m.id);
                    set({ missionSource: next.source, missionName: next.externalName, missionId: next.missionId ?? '' });
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          {repeat && (
            <p className={`mt-1 text-[14px] ${repeatLocked ? 'text-danger' : 'text-warn'}`}>
              {repeatLocked
                ? t('Wiederholungssperre: „{name}“ wurde zuletzt schon gespielt – Speichern nur per Override mit Begründung.', { name: repeat.mission })
                : t('Hinweis: „{name}“ wurde von dieser Allianz zuletzt schon gespielt.', { name: repeat.mission })}
            </p>
          )}
        </Field>
      </div>

      {campaign && !boarding && state.toggles.theatreTwists && (
        <div className="inset space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="hud-title">Theatre &amp; Twist</span>
            {battle.theatreChosenBy && <span className="chip">{t(CHOOSER[battle.theatreChosenBy])}</span>}
          </div>
          {battle.theatreChosenBy === 'RANDOM' && <p className="text-[14px] text-dim">{t('Sinister Omens: Das Theatre wird ausgewürfelt. Eine freie Wahl gilt als Override und braucht eine Begründung.')}</p>}
          <div className="flex flex-wrap items-end gap-2">
            {theatres.map((th) => (
              <button key={th} type="button" aria-pressed={f.theatre === th} className={`btn btn-sm ${f.theatre === th ? 'border-accent bg-accent/15' : ''}`} onClick={() => set({ theatre: th })}>
                <TheatreBadge id={th} size={22} /> {THEATRES[th].name}
              </button>
            ))}
            <button type="button" className="btn btn-sm" disabled={busy || processed} onClick={() => run({ type: 'BATTLE_ROLL', battleId: battle.id, what: 'THEATRE' })}>
              <DiceIcon /> {t('Theatre würfeln')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[15px]">
            <span>Twist:</span>
            {battle.twist ? (
              <b>
                {battle.twist.name} ({t('W6 {n}', { n: battle.twist.d6 })})
              </b>
            ) : (
              <span className="text-faint">–</span>
            )}
            <button type="button" className="btn btn-sm" disabled={busy || !twistTheatre} onClick={() => rollTwist()}>
              <DiceIcon /> {t('Twist würfeln')}
            </button>
            <select className="select w-auto" value="" aria-label={t('Twist-Wurf (W6) von Hand eintragen')} disabled={busy || !twistTheatre} onChange={(e) => e.target.value && rollTwist(Number(e.target.value))}>
              <option value="">{t('W6 manuell…')}</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} – {twistTheatre ? THEATRES[twistTheatre].twists[twistIndex(n)] : ''}
                </option>
              ))}
            </select>
            {theatreDirty && twistTheatre && <span className="text-[13px] text-dim">{t('Das gewählte Theatre wird mit dem Twist gespeichert.')}</span>}
          </div>
        </div>
      )}

      <GamesEditor key={JSON.stringify(battle.games ?? [])} battle={battle} />
      <fieldset disabled={processed || !!battle.games?.length} className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">
        <Field label={battle.games?.length ? t('VP Angreifer (Summe der Einzelspiele)') : t('VP Angreifer')}>
          <input className="input" type="number" min={0} inputMode="numeric" value={f.vpA} onChange={(e) => set({ vpA: e.target.value })} />
        </Field>
        <Field label={t('VP Verteidiger')}>
          <input className="input" type="number" min={0} inputMode="numeric" value={f.vpD} onChange={(e) => set({ vpD: e.target.value })} />
        </Field>
        <div className="flex flex-col justify-end gap-1 text-[15px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.readyA} onChange={(e) => set({ readyA: e.target.checked })} /> {t('Angreifer Battle Ready (+10)')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.readyD} onChange={(e) => set({ readyD: e.target.checked })} /> {t('Verteidiger Battle Ready (+10)')}
          </label>
        </div>
        <Field label={t('Sieger (automatisch: {v})', { v: autoVictor ? t({ ATTACKER: 'Angreifer', DEFENDER: 'Verteidiger', DRAW: 'Unentschieden' }[autoVictor]) : '–' })}>
          <select className="select" value={f.victorOverride} onChange={(e) => set({ victorOverride: e.target.value as Victor | '' })}>
            <option value="">{t('automatisch nach VP')}</option>
            <option value="ATTACKER">{t('Override: Angreifer')}</option>
            <option value="DEFENDER">{t('Override: Verteidiger')}</option>
            <option value="DRAW">{t('Override: Unentschieden')}</option>
          </select>
        </Field>
      </fieldset>
      {processed && <p className="text-[13px] text-dim">{t('Ergebnis ist verarbeitet ({vp}) – Änderungen am Ergebnis nur per Undo.', { vp: vpText(battle) })}</p>}

      <div className="grid gap-3 @2xl:grid-cols-2">
        <Field label={t('Schlachtbericht (Markdown, öffentlich)')}>
          <textarea className="textarea" rows={5} value={f.report} onChange={(e) => set({ report: e.target.value })} />
          <button type="button" className="btn btn-sm btn-ghost mt-1" onClick={() => setPreview((p) => !p)}>
            {preview ? t('Vorschau ausblenden') : t('Vorschau')}
          </button>
          {preview && <Markdown text={f.report} className="inset mt-2 p-2" />}
        </Field>
        <Field label={t('SL-Notiz (nie öffentlich)')}>
          <textarea className="textarea" rows={5} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>

      <div>
        <span className="label">{t('Fotos ({n}/10)', { n: f.photos.length })}</span>
        <div className="flex flex-wrap items-start gap-2">
          {f.photos.map((id) => (
            <div key={id} className="relative">
              <a href={uploadUrl(id)!} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadUrl(id, true)!} alt={t('Schlachtfoto')} className="h-24 w-24 border border-line object-cover" />
              </a>
              <button type="button" className="btn btn-sm absolute right-0 top-0 min-h-0 px-1 py-0.5" aria-label={t('Foto entfernen')} onClick={() => set({ photos: f.photos.filter((x) => x !== id) })}>
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
          {f.photos.length < 10 && <UploadButton kind="BATTLE_PHOTO" campaignId={campaignId} multiple label={t('+ Fotos')} onUploaded={(id) => setF((x) => ({ ...x, photos: [...x.photos, id].slice(0, 10) }))} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
          {t('Schlacht speichern')}
        </button>
        {dirty && <span className="text-[13px] text-warn">{t('ungespeicherte Änderungen')}</span>}
      </div>

      {campaign && effectiveVictor(battle) && (
        <div className="space-y-3">
          {battle.operationIds.map((opId, i) => (
            <div key={opId}>
              {battle.operationIds.length > 1 && <p className="label">{t('Operation {n}', { n: i + 1 })}</p>}
              <OutcomeEditor battle={battle} opId={opId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
