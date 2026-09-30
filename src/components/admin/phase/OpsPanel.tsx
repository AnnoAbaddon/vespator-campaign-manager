'use client';

import { useEffect, useState } from 'react';
import { ATTACK_TYPES, INFRA, OP_TYPES, type AttackType, type InfraType } from '@/engine/data/vespator';
import { canBuild } from '@/engine/board';
import { edificeTypes } from '@/components/buildOptions';
import { modifierActive, selfOrConnected } from '@/engine/graph';
import { describeOp, type OpInput } from '@/engine/phase';
import { allianceOf, playersOfAlliance } from '@/engine/players';
import type { Fleet, Operation, Phase } from '@/engine/types';
import { AllianceTag, OpIcon, Panel, planetName, PlanetSelect } from '@/components/ui';
import { useMsg, useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { BoardingTarget } from './BoardingTarget';
import { opArrow, useMapFocus } from '../mapFocus';
import { planetIds } from '@/engine/map';
import { GameIcon } from '@/components/icons/GameIcon';
import { CloseIcon, SaveIcon } from '@/components/icons';

type OpType = Operation['type'];

function OpForm({ fleet, slot, phase, existing }: { fleet: Fleet; slot: 1 | 2; phase: Phase; existing?: Operation }) {
  const { state, run, busy } = useCmd();
  const focus = useMapFocus();
  const n = phase.number;
  const tg = state.toggles.operations;
  const t = useT();
  const msg = useMsg();
  // Befehle erscheinen als kurze Zusammenfassung; das Formular öffnet sich erst beim Erteilen oder Ändern
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<OpInput>(() => (existing ? { ...existing } : { type: '' as OpType }));
  // Während der Bearbeitung steht der Entwurf als Fokus-Pfeil auf der Karte, die übrigen Routen treten zurück
  const { setExtraArrows } = focus;
  const draftKey = editing ? `${d.type}|${d.attackType ?? ''}|${d.targetPlanetId ?? ''}|${d.destinationPlanetId ?? ''}|${d.killTeamPlanetId ?? ''}` : '';
  useEffect(() => {
    if (!draftKey) return;
    const id = `edit:${fleet.id}:${slot}`;
    const [type, attackType, targetPlanetId, destinationPlanetId, killTeamPlanetId] = draftKey.split('|');
    const draft = opArrow(
      state,
      {
        allianceId: fleet.allianceId,
        originPlanetId: fleet.planetId,
        type: type as OpType,
        attackType: (attackType || undefined) as AttackType | undefined,
        targetPlanetId: targetPlanetId || undefined,
        destinationPlanetId: destinationPlanetId || undefined,
        killTeamPlanetId: killTeamPlanetId || undefined,
        revealed: false,
        status: 'PLANNED',
      },
      true,
    );
    // ohne Ziel eine unsichtbare Marke, damit die übrigen Routen trotzdem zurücktreten
    const mark = draft ? { ...draft, id } : { from: fleet.planetId!, to: fleet.planetId!, color: 'transparent', id };
    setExtraArrows((prev) => [...prev.filter((a) => a.id !== id), mark]);
    return () => setExtraArrows((prev) => prev.filter((a) => a.id !== id));
  }, [draftKey, fleet.id, fleet.allianceId, fleet.planetId, slot, state, setExtraArrows]);

  const from = fleet.planetId!;
  const alive = (id: string) => !state.planets.find((p) => p.id === id)?.destroyed;
  const reach = selfOrConnected(state, fleet.allianceId, from, n).filter(alive);
  const types: { id: OpType; ok: boolean }[] = [
    { id: 'BATTLE', ok: Object.values(tg.attackTypes).some(Boolean) },
    { id: 'VOID_LEAP', ok: tg.voidLeap && !modifierActive(state, 'NO_VOID_LEAP', n) },
    { id: 'RAISE_EDIFICES', ok: tg.raiseEdifices && alive(from) },
    { id: 'LOGISTICAL_AUXILIA', ok: tg.logisticalAuxilia && !modifierActive(state, 'NO_LOGISTICAL_AUXILIA', n) },
    { id: 'KILL_TEAMS', ok: tg.killTeams },
  ];
  const attackTypes = (Object.keys(ATTACK_TYPES) as AttackType[]).filter((a) => tg.attackTypes[a]);
  const opponents = state.alliances.filter((a) => a.id !== fleet.allianceId);

  if (!editing) {
    return existing ? (
      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        {/* Bei Platzmangel rutscht die Aktionsgruppe unter die Befehlsbeschreibung statt die Taste zu quetschen */}
        <span className={`inline-flex min-w-[11rem] flex-1 items-center gap-1.5 ${existing.isDefault ? 'text-warn' : 'text-ink'}`}>
          <OpIcon op={existing} /> <span className="min-w-0">{msg(describeOp({ state }, existing))}</span>
          {existing.revealed && <span className="chip shrink-0">{t('offengelegt')}</span>}
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          <button className="btn btn-sm min-w-[5rem] whitespace-nowrap" onClick={() => setEditing(true)}>
            {t('Ändern')}
          </button>
          <button
            className="btn btn-sm btn-ghost text-danger"
            disabled={busy}
            onClick={() => run({ type: 'OP_CLEAR', fleetId: fleet.id, slot })}
            aria-label={t('Befehl von {fleet} löschen', { fleet: fleet.name })}
            title={t('Befehl löschen')}
          >
            <CloseIcon />
          </button>
        </span>
      </div>
    ) : (
      <div className="flex items-center gap-2 text-[15px]">
        <span className="hint min-w-0 flex-1">{t('Noch kein Befehl erteilt.')}</span>
        <button className="btn btn-sm shrink-0 whitespace-nowrap" onClick={() => setEditing(true)}>
          {t('Befehl erteilen')}
        </button>
      </div>
    );
  }

  const save = () => {
    const op: OpInput = { type: d.type };
    if (d.type === 'BATTLE')
      Object.assign(op, {
        attackType: d.attackType,
        targetPlanetId: d.targetPlanetId,
        targetAllianceId: d.targetAllianceId,
        ...(d.attackType === 'BOARDING_ACTION' && d.targetFleetId ? { targetFleetId: d.targetFleetId } : {}),
      });
    if (d.type === 'VOID_LEAP') op.destinationPlanetId = d.destinationPlanetId;
    if (d.type === 'RAISE_EDIFICES') op.infraType = d.infraType;
    if (d.type === 'KILL_TEAMS') Object.assign(op, { killTeamPlanetId: d.killTeamPlanetId, killTeamMode: d.killTeamMode ?? 'DICE' });
    run({ type: 'OP_SET', fleetId: fleet.id, slot, op }).then((ok) => ok && focus.setHighlight([]));
  };

  const edErr = d.type === 'RAISE_EDIFICES' && d.infraType ? canBuild(state, fleet.allianceId, d.infraType, from) : null;

  return (
    // Container-Queries: das Formular steht in einer schmalen Spalte, die Breite des Viewports sagt darüber nichts
    <div className="@container">
      <div className="grid gap-2 @md:grid-cols-2 @3xl:grid-cols-4">
        <select className="select" value={d.type} onChange={(e) => setD({ type: e.target.value as OpType })} aria-label={t('Operation')}>
          <option value="">{t('– Operation –')}</option>
          {types
            .filter((x) => x.ok)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {OP_TYPES[x.id as keyof typeof OP_TYPES].name}
              </option>
            ))}
        </select>
        {d.type === 'BATTLE' && (
          <>
            <select className="select" value={d.attackType ?? ''} onChange={(e) => setD({ ...d, attackType: (e.target.value || undefined) as AttackType })} aria-label={t('Attack Type')}>
              <option value="">{t('– Attack Type –')}</option>
              {attackTypes.map((a) => (
                <option key={a} value={a}>
                  {ATTACK_TYPES[a].name}
                </option>
              ))}
            </select>
            <span onFocus={() => focus.setHighlight(reach)}>
              <PlanetSelect value={d.targetPlanetId} options={reach} placeholder={t('– Zielplanet –')} onChange={(p) => setD({ ...d, targetPlanetId: p || undefined })} />
            </span>
            <select className="select" value={d.targetAllianceId ?? ''} onChange={(e) => setD({ ...d, targetAllianceId: e.target.value || undefined })} aria-label={t('Gegner')}>
              <option value="">{t('– Gegner –')}</option>
              {opponents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {d.attackType === 'BOARDING_ACTION' && d.targetPlanetId && d.targetAllianceId && (
              <BoardingTarget value={d.targetFleetId} planetId={d.targetPlanetId} allianceId={d.targetAllianceId} onChange={(id) => setD({ ...d, targetFleetId: id })} className="@md:col-span-2 @3xl:col-span-4" />
            )}
          </>
        )}
        {d.type === 'VOID_LEAP' && (
          <span onFocus={() => focus.setHighlight(planetIds(state).filter(alive))}>
            <PlanetSelect value={d.destinationPlanetId} options={planetIds(state).filter(alive)} placeholder={t('– Ziel –')} onChange={(p) => setD({ ...d, destinationPlanetId: p || undefined })} />
          </span>
        )}
        {d.type === 'RAISE_EDIFICES' && (
          <>
            <select className="select" value={d.infraType ?? ''} onChange={(e) => setD({ ...d, infraType: (e.target.value || undefined) as InfraType })} aria-label={t('Infrastruktur')}>
              <option value="">{t('– Typ –')}</option>
              {edificeTypes(state, fleet.allianceId, from).map((x) => (
                <option key={x} value={x}>
                  {INFRA[x].name}
                </option>
              ))}
            </select>
            <span className="self-center text-[13px] text-dim">{t('auf {planet}', { planet: planetName(from) })}</span>
            {edErr && <p className="text-[13px] text-warn @md:col-span-2">{t('Wird voraussichtlich scheitern: {error}', { error: msg(edErr) })}</p>}
          </>
        )}
        {d.type === 'KILL_TEAMS' && (
          <span onFocus={() => focus.setHighlight(reach)}>
            <PlanetSelect value={d.killTeamPlanetId} options={reach} placeholder={t('– Planet –')} onChange={(p) => setD({ ...d, killTeamPlanetId: p || undefined })} />
          </span>
        )}
        {d.type === 'KILL_TEAMS' && (
          <select className="select" value={d.killTeamMode ?? 'DICE'} onChange={(e) => setD({ ...d, killTeamMode: e.target.value as 'DICE' | 'GAME' })} aria-label={t('Kill-Team-Modus')}>
            <option value="DICE">{t('Würfeln (Regel)')}</option>
            <option value="GAME">{t('Kill-Team-Spiel')}</option>
          </select>
        )}
        <div className="flex gap-2 @md:col-span-2 @3xl:col-span-4">
          <button className="btn btn-sm" disabled={busy || !d.type} onClick={save}>
            <SaveIcon />
            {t('Speichern')}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setEditing(false);
              setD(existing ? { ...existing } : { type: '' as OpType });
              focus.setHighlight([]);
            }}
          >
            {t('Abbrechen')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OpsPanel({ phase }: { phase: Phase }) {
  const { state, run, busy } = useCmd();
  const { setExtraArrows } = useMapFocus();
  const t = useT();
  // Zeiger oder Tastaturfokus auf einer Flotte: deren erteilte Operation hervorheben
  const hover = (ops: (Operation | undefined)[]) => {
    const list = ops.map((o) => (o ? opArrow(state, o) : null)).filter((a): a is NonNullable<typeof a> => !!a);
    setExtraArrows((prev) => [...prev.filter((a) => a.id !== 'hover'), ...list.map((a) => ({ ...a, id: 'hover' }))]);
  };
  const unhover = () => setExtraArrows((prev) => (prev.some((a) => a.id === 'hover') ? prev.filter((a) => a.id !== 'hover') : prev));
  useEffect(() => unhover, []); // eslint-disable-line react-hooks/exhaustive-deps
  const n = phase.number;
  const tome = state.modifiers.find((m) => m.kind === 'OPEN_TOME' && m.phaseNumber === n);
  const fleets = state.fleets.filter((f) => !f.reserve).sort((a, b) => (state.alliances.find((x) => x.id === a.allianceId)?.order ?? 0) - (state.alliances.find((x) => x.id === b.allianceId)?.order ?? 0));
  const placed = fleets.filter((f) => f.planetId);
  const done = placed.filter((f) => phase.operations.some((o) => o.fleetId === f.id && o.slot === 1)).length;
  const laAllowed = state.toggles.operations.logisticalAuxilia && !modifierActive(state, 'NO_LOGISTICAL_AUXILIA', n);
  const unplaced = fleets.length - placed.length;
  // Inaktive Mitglieder der Allianzen in dieser Phase: ihre Flotten hat ein aktives Mitglied übernommen
  const inactive = state.players.filter((p) => !p.active && state.alliances.some((a) => allianceOf(p, n) === a.id));

  return (
    <Panel title={t('Befehle: {done} von {n} erteilt', { done, n: placed.length })} icon={<GameIcon name="op_BATTLE" size={18} />}>
      <p className="hint mb-3">
        {laAllowed
          ? t('Eingaben sind verdeckt, bis zum Reveal. Flotten ohne Befehl erhalten beim Weiterschalten automatisch Logistical Auxilia.')
          : t('Eingaben sind verdeckt, bis zum Reveal. Flotten ohne Befehl erhalten beim Weiterschalten automatisch keine Operation (Logistical Auxilia ist gesperrt).')}
        {unplaced > 0 && <span className="text-warn"> {t('{n} Flotte(n) ohne Position können keine Befehle erhalten – unter „Allianzen & Spieler → Flotten“ platzieren.', { n: unplaced })}</span>}
      </p>
      {inactive.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[14px] text-dim">
          {inactive.map((p) => (
            <span key={p.id} className="chip border-warn text-warn">
              {p.nickname} · {t('inaktiv')}
            </span>
          ))}
          <span>{t('Ihre Flotten führen aktive Mitglieder der Allianz.')}</span>
        </p>
      )}
      {tome && (
        <div className="notice mb-3 flex-wrap items-center">
          {t('An Open Tome: {name} muss zuerst erklären.', { name: state.alliances.find((a) => a.id === tome.allianceId)?.name })}
          {phase.openTomeRevealed ? (
            <span className="chip border-ok text-ok">{t('offengelegt')}</span>
          ) : (
            <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'OPEN_TOME_REVEAL' })}>
              {t('Operationen offenlegen')}
            </button>
          )}
        </div>
      )}
      <div className="space-y-2">
        {fleets.map((f) => {
          const al = state.alliances.find((a) => a.id === f.allianceId);
          const players = playersOfAlliance(state, f.allianceId, n);
          // Kommandant ist inaktiv (z. B. mitten in der Phase deaktiviert): sichtbar machen statt leerer Auswahl
          const cmdInactive = state.players.find((p) => p.id === f.commanders[String(n)] && !p.active) ?? null;
          const zeal = modifierActive(state, 'DEFIANT_ZEAL', n, f.allianceId);
          const op1 = phase.operations.find((o) => o.fleetId === f.id && o.slot === 1);
          const op2 = phase.operations.find((o) => o.fleetId === f.id && o.slot === 2);
          return (
            <div
              key={f.id}
              className="slab px-2.5 py-2"
              data-done={op1 ? 'true' : undefined}
              onMouseEnter={() => hover([op1, op2])}
              onMouseLeave={unhover}
              onFocus={() => hover([op1, op2])}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) unhover();
              }}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
                <span className={`lamp ${op1 ? 'lamp-ok' : 'lamp-on'}`} aria-hidden />
                <span className="sr-only">{op1 ? t('erteilt') : t('offen')}</span>
                <AllianceTag alliance={al} className="[&>span]:sr-only" />
                <b className="min-w-0 truncate">{f.name}</b>
                <span className="text-dim">@ {planetName(f.planetId)}</span>
                {cmdInactive && <span className="chip border-warn text-warn">{t('{name} inaktiv', { name: cmdInactive.nickname })}</span>}
                <select
                  className="select ml-auto w-auto min-w-0 max-w-[9.5rem] py-1 text-[14px]"
                  value={f.commanders[String(n)] ?? ''}
                  aria-label={t('Kommandant')}
                  onChange={(e) => run({ type: 'FLEET_COMMANDER', fleetId: f.id, phase: n, playerId: e.target.value || null }, { silent: true })}
                >
                  <option value="">{t('– Kommandant –')}</option>
                  {cmdInactive && (
                    <option value={cmdInactive.id} disabled>
                      {cmdInactive.nickname} ({t('inaktiv')})
                    </option>
                  )}
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                    </option>
                  ))}
                </select>
              </div>
              {f.planetId ? (
                <>
                  <OpForm key={JSON.stringify(op1 ?? null)} fleet={f} slot={1} phase={phase} existing={op1} />
                  {zeal && (
                    <div className="mt-2 border-t border-line/50 pt-2">
                      <p className="label">{t('Zweite Operation (Defiant Zeal)')}</p>
                      <OpForm key={JSON.stringify(op2 ?? null)} fleet={f} slot={2} phase={phase} existing={op2} />
                    </div>
                  )}
                </>
              ) : (
                <p className="notice">{t('Flotte hat keine Position – per Override auf der Karte setzen.')}</p>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
