import { describe, expect, it } from 'vitest';
import { createCampaignState } from '@/engine/init';
import { toPublicView } from '@/engine/publicView';
import { validateState } from '@/engine/schema';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { ids, run, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

function twoAllianceW2(withLaurel = true) {
  let s = createCampaignState({ name: 'X', phaseCount: 3, allianceCount: 2 });
  s = run(s, { type: 'ALLIANCE_UPSERT', name: 'R', color: '#f00' });
  s = run(s, { type: 'ALLIANCE_UPSERT', name: 'B', color: '#00f' });
  s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'P' }, allianceId: s.alliances[0].id });
  if (withLaurel) s.inheritedMedals = [{ medal: 'LAUREL', fromCampaignId: 'old', holderPlayerIds: [s.players[0].id], assignedAllianceId: undefined }];
  for (const a of s.alliances) s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a.id, count: 1 });
  s = run(s, { type: 'SETUP_W0_DONE' });
  if (withLaurel) {
    s = run(s, { type: 'SETUP_MEDAL_SUGGEST' });
    s = run(s, { type: 'SETUP_W1_DONE' });
  }
  return s;
}

describe('Review-Korrekturen', () => {
  it('Laurel-Planet nachträglich gewählt: kollidierende Wahlen anderer Allianzen werden zurückgesetzt', () => {
    let s = twoAllianceW2();
    const [a, b] = s.alliances.map((x) => x.id);
    s = run(s, { type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'masnet', pl3: ['tarkad-vindix', 'astarthem', 'ikaron-prime'], pl2: ['novamagnor', 'felgris-secundas', 'jawardet', 'vikus-decima'] });
    s = run(s, { type: 'SETUP_LAUREL_PLANET', planetId: 'masnet' });
    expect(s.setup.strongholds[b].strongholdPlanetId).toBeNull();
    expect(s.setup.strongholds[a].strongholdPlanetId).toBe('masnet');
  });

  it('Bündeln mit doppelter ID löscht die Schlacht nicht', () => {
    let s = startedCampaign();
    const { fa, c } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    s = toStep(s, 'REVEAL');
    s = run(s, { type: 'REVEAL_OPS' });
    s = toStep(s, 'BATTLES');
    const id = s.battles[0].id;
    expect(tryRun(s, { type: 'BATTLE_BUNDLE', battleIds: [id, id] }).ok).toBe(false);
    expect(s.battles).toHaveLength(1);
  });

  it('Würfe tragen ihre Phase; Setup-Würfe sind privat', () => {
    let s = startedCampaign();
    const { fb } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fb, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'novamagnor' } });
    s = toStep(s, 'RESISTANCE');
    s = run(s, { type: 'RESOLVE_KILL_TEAMS' }, [5, 2]);
    const kt = s.dice.filter((d) => d.context.startsWith('Kill Teams'));
    expect(kt.every((d) => d.phaseNumber === 1 && d.public)).toBe(true);

    let t = twoAllianceW2(false);
    const [a, b] = t.alliances.map((x) => x.id);
    const pl3 = ['norallus', 'karabas', 'kryndaer'];
    const pl2 = ['felgris-secundas', 'caltus-novem', 'marvinius', 'vikus-decima'];
    // 2 Allianzen wollen auf Masnet (2 Slots) – kein Konflikt; erzwinge Konflikt über 1-Slot-Situation per Override
    t = run(t, { type: 'OVERRIDE_SLOT', planetId: 'masnet', slot: 1, destroyed: true, infra: null }, [], { reason: 'x' });
    t = run(t, { type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'masnet', pl3, pl2 });
    t = run(t, { type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'masnet', pl3, pl2 });
    t = run(t, { type: 'SETUP_REVEAL_STRONGHOLDS' }, [6, 1]);
    expect(t.setup.strongholdsRevealed).toBe(false);
    expect(t.dice.length).toBeGreaterThan(0);
    const pub = toPublicView(t);
    expect(pub.dice).toHaveLength(0);
    expect(pub.setup.messages).toHaveLength(0);
  });

  it('Flotten mit Operationen können nicht entfernt werden', () => {
    let s = startedCampaign();
    const { fa, a } = ids(s);
    s = run(s, { type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'LOGISTICAL_AUXILIA' } });
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 2 });
    const r = tryRun(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 0 });
    expect(r.ok).toBe(false);
  });

  it('Flottenzahl während einer Phase erzeugt eine Warnung', async () => {
    const s = startedCampaign();
    const { a } = ids(s);
    const { executeCommand } = await import('@/engine/commands');
    const r = executeCommand(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('confirm');
  });

  it('Import-Validierung', () => {
    expect(validateState(startedCampaign())).toBeNull();
    expect(validateState({ schemaVersion: 1 })).not.toBeNull();
    const broken = startedCampaign();
    broken.planets = broken.planets.slice(1);
    expect(validateState(broken)).toMatch(/passen nicht zur Karte/);
  });
});

describe('Flotten nachträglich platzieren', () => {
  it('FLEET_PLACE setzt nur Flotten ohne Position', () => {
    let s = startedCampaign();
    const { a, fa } = ids(s);
    s = run(s, { type: 'FLEET_SET_COUNT', allianceId: a, count: 2 });
    const neu = s.fleets.find((f) => f.allianceId === a && f.id !== fa)!;
    expect(neu.planetId).toBeNull();
    s = run(s, { type: 'FLEET_PLACE', fleetId: neu.id, planetId: 'karabas' });
    expect(s.fleets.find((f) => f.id === neu.id)!.planetId).toBe('karabas');
    expect(tryRun(s, { type: 'FLEET_PLACE', fleetId: fa, planetId: 'karabas' }).ok).toBe(false);
  });
});

describe('Armee-Historie', () => {
  it('Fraktionswechsel wird mit Phase protokolliert', () => {
    let s = startedCampaign();
    const { pa } = ids(s);
    expect(s.players.find((p) => p.id === pa)!.factionHistory).toEqual([{ faction: 'Orks', subfaction: '', fromPhase: 0 }]);
    s = run(s, { type: 'PLAYER_UPSERT', id: pa, data: { faction: 'Orks', subfaction: 'Goffs' } });
    s = run(s, { type: 'PLAYER_UPSERT', id: pa, data: { faction: 'Tyraniden', subfaction: '' } });
    const h = s.players.find((p) => p.id === pa)!.factionHistory!;
    expect(h.at(0)).toEqual({ faction: 'Orks', subfaction: '', fromPhase: 0 });
    expect(h.at(-1)).toEqual({ faction: 'Tyraniden', subfaction: '', fromPhase: 1 });
    expect(h).toHaveLength(2);
  });
});

describe('Drittes Review', () => {
  it('Armeewechsel nach den Schlachten gilt ab der nächsten Phase', () => {
    let s = startedCampaign();
    const { pa } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', id: pa, data: { faction: 'Necrons' } });
    for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === 'RESULTS'); i++) s = run(s, { type: 'ADVANCE' });
    s = run(s, { type: 'PLAYER_UPSERT', id: pa, data: { faction: 'Orks' } });
    const h = s.players.find((p) => p.id === pa)!.factionHistory!;
    expect(h.map((x) => `${x.faction}@${x.fromPhase}`)).toEqual(['Orks@0', 'Necrons@1', 'Orks@2']);
  });

  it('Migration legt die Armee-Historie für alte Stände an', async () => {
    const { migrateState } = await import('@/engine/migrate');
    const s = startedCampaign();
    for (const p of s.players) delete p.factionHistory;
    const m = migrateState(s);
    expect(m.players[0].factionHistory).toEqual([{ faction: 'Orks', subfaction: '', fromPhase: 0 }]);
  });

  it('Backup erfasst alle verwendeten Bilder', async () => {
    const { referencedUploadIds } = await import('@/engine/uploads');
    const s = startedCampaign();
    s.players[0].avatar = 'AVATARidFromOldCampaign';
    s.alliances[0].logo = 'LOGOid12345';
    s.dispatches.push({ id: 'd', at: '', title: 't', body: '![bild](/api/uploads/LOREimage123?thumb=1)', pinned: false, public: true });
    expect(referencedUploadIds(s).sort()).toEqual(['AVATARidFromOldCampaign', 'LOGOid12345', 'LOREimage123'].sort());
  });
});

describe('Allianzwechsel', () => {
  it('Spieler aus anderer Allianz zuweisen: Mitgliedschaft und Flottenkommando', () => {
    let s = startedCampaign();
    const { pa, b, fa } = ids(s);
    expect(s.fleets.find((f) => f.id === fa)!.commanders['1']).toBe(pa);
    s = run(s, { type: 'PLAYER_UPSERT', id: pa, data: {}, allianceId: b });
    const p = s.players.find((x) => x.id === pa)!;
    expect(p.memberships.at(-1)).toEqual({ allianceId: b, fromPhase: 1, toPhase: null });
    // die Flotte der alten Allianz hat keinen Kommandanten mehr aus der fremden Allianz
    expect(s.fleets.find((f) => f.id === fa)!.commanders['1']).not.toBe(pa);
  });
  it('Spieler ohne Allianz zuweisen', () => {
    let s = startedCampaign();
    const { c } = ids(s);
    s = run(s, { type: 'PLAYER_UPSERT', data: { nickname: 'Neu' }, allianceId: null });
    const id = s.players.find((x) => x.nickname === 'Neu')!.id;
    s = run(s, { type: 'PLAYER_UPSERT', id, data: {}, allianceId: c });
    expect(s.players.find((x) => x.id === id)!.memberships).toEqual([{ allianceId: c, fromPhase: 1, toPhase: null }]);
  });
});
