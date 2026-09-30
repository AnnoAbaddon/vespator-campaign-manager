/**
 * Legt Testszenarien für die E2E-Tests an (nur für Tests gedacht).
 * Nutzung: npx tsx scripts/seed-scenarios.ts <DATA_DIR> <OUT_JSON>
 *
 * Szenarien:
 *  - xeno:     Phase 1, Schritt RESULTS, offenes Event Xenobeast Migration (FW_31)
 *  - fate:     Phase 1, Schritt RESULTS, offenes Event Machinations of Fate (FW_32)
 *  - bargain:  Phase 1, Schritt RESULTS, offenes Event A Costly Bargain (DM_1, zurückliegende Allianz)
 *  - ending:   letzte Phase (1/1), Schritt RESULTS, Gleichstand aller Allianzen mit intakten Strongholds
 */
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from '../src/server/schema-sql';
import { executeCommand, type Command } from '../src/engine/commands';
import { createCampaignState } from '../src/engine/init';
import type { CampaignState } from '../src/engine/types';

const dataDir = process.argv[2] ?? path.join(process.cwd(), 'data');
const outFile = process.argv[3] ?? path.join(dataDir, 'scenarios.json');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec(SCHEMA_SQL);

class Builder {
  s: CampaignState;
  revs: { cmd: unknown; state: CampaignState; summary: string; log: string[] }[] = [];
  constructor(name: string, phaseCount: number) {
    this.s = createCampaignState({ name, phaseCount, allianceCount: 3 });
    this.revs.push({ cmd: { type: 'CREATE' }, state: this.s, summary: 'Kampagne angelegt', log: ['Kampagne angelegt'] });
  }
  run(cmd: Command, dice: number[] = []) {
    const r = executeCommand(this.s, cmd, {
      force: true,
      reason: 'E2E-Seed',
      dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: (n) => crypto.randomInt(1, n + 1) },
    });
    if (!r.ok) throw new Error(`${cmd.type}: ${JSON.stringify(r)}`);
    this.s = r.state;
    this.revs.push({ cmd, state: this.s, summary: r.summary, log: r.log });
    return this;
  }
  /** Setup wie im Engine-Test-Helfer: 3 Allianzen, je 1 Spieler und 1 Flotte, gleiche Punktzahl */
  setup() {
    this.run({ type: 'ALLIANCE_UPSERT', name: 'Imperium', color: '#3e9bff' });
    this.run({ type: 'ALLIANCE_UPSERT', name: 'Chaos', color: '#e5484d' });
    this.run({ type: 'ALLIANCE_UPSERT', name: 'Xenos', color: '#46c46e' });
    const [a, b, c] = this.s.alliances.map((x) => x.id);
    this.run({ type: 'PLAYER_UPSERT', data: { nickname: 'Konrad', faction: 'Space Marines' }, allianceId: a });
    this.run({ type: 'PLAYER_UPSERT', data: { nickname: 'Dario', faction: 'Death Guard' }, allianceId: b });
    this.run({ type: 'PLAYER_UPSERT', data: { nickname: 'Ayla', faction: 'Necrons' }, allianceId: c });
    for (const id of [a, b, c]) this.run({ type: 'FLEET_SET_COUNT', allianceId: id, count: 1 });
    this.run({ type: 'SETUP_W0_DONE' });
    this.run({ type: 'SETUP_STRONGHOLDS', allianceId: a, strongholdPlanetId: 'norallus', pl3: ['masnet', 'karabas', 'kryndaer'], pl2: ['felgris-secundas', 'caltus-novem', 'marvinius', 'vikus-decima'] });
    this.run({ type: 'SETUP_STRONGHOLDS', allianceId: b, strongholdPlanetId: 'jawardet', pl3: ['tarkad-vindix', 'astarthem', 'ikaron-prime'], pl2: ['novamagnor', 'felgris-secundas', 'masnet', 'vikus-decima'] });
    this.run({ type: 'SETUP_STRONGHOLDS', allianceId: c, strongholdPlanetId: 'caltus-novem', pl3: ['vikus-decima', 'marvinius', 'novamagnor'], pl2: ['kryndaer', 'karabas', 'ikaron-prime', 'astarthem'] });
    this.run({ type: 'SETUP_REVEAL_STRONGHOLDS' });
    this.run({ type: 'SETUP_W2_DONE' });
    this.run({ type: 'SETUP_INFRA', allianceId: a, items: [{ type: 'FORTIFICATION_LINE', planetId: 'masnet' }, { type: 'SUPPORT_FACILITY', planetId: 'karabas' }, { type: 'STAGING_GROUNDS', planetId: 'kryndaer' }] });
    this.run({ type: 'SETUP_INFRA', allianceId: b, items: [{ type: 'FORTIFICATION_LINE', planetId: 'tarkad-vindix' }, { type: 'SUPPORT_FACILITY', planetId: 'astarthem' }, { type: 'STAGING_GROUNDS', planetId: 'ikaron-prime' }] });
    this.run({ type: 'SETUP_INFRA', allianceId: c, items: [{ type: 'FORTIFICATION_LINE', planetId: 'marvinius' }, { type: 'SUPPORT_FACILITY', planetId: 'vikus-decima' }, { type: 'STAGING_GROUNDS', planetId: 'novamagnor' }] });
    this.run({ type: 'SETUP_REVEAL_INFRA' });
    this.run({ type: 'SETUP_W3_DONE' });
    const [fa, fb, fc] = this.s.fleets.map((f) => f.id);
    this.run({ type: 'SETUP_FLEET_STARTS', starts: { [fa]: 'kryndaer', [fb]: 'novamagnor', [fc]: 'caltus-novem' } });
    this.run({ type: 'SETUP_REVEAL_FLEETS' });
    this.run({ type: 'SETUP_W4_DONE' });
    this.run({ type: 'SETUP_START' });
    return this;
  }
  /** Bis zu Schritt 3 (Punkte & Events) weiterschalten, ohne Operationen */
  toResults() {
    for (let i = 0; i < 20 && !(this.s.stage.kind === 'PHASE' && this.s.stage.step === 'RESULTS'); i++) this.run({ type: 'ADVANCE' });
    return this;
  }
  save() {
    const id = crypto.randomBytes(9).toString('base64url');
    const token = crypto.randomBytes(32).toString('base64url');
    const ts = new Date().toISOString();
    db.prepare('INSERT INTO campaign(id, name, public_token, current_rev, created_at, updated_at) VALUES(?,?,?,?,?,?)').run(id, this.s.meta.name, token, this.revs.length, ts, ts);
    const ins = db.prepare('INSERT INTO revision(campaign_id, number, parent_number, command, state, summary, log, created_at) VALUES(?,?,?,?,?,?,?,?)');
    this.revs.forEach((r, i) => ins.run(id, i + 1, i === 0 ? null : i, JSON.stringify(r.cmd), JSON.stringify(r.state), r.summary, JSON.stringify(r.log), ts));
    return { id, token };
  }
}

const out: Record<string, { id: string; token: string }> = {};

// Xenobeast Migration: kein Dominanz-/Rückstands-Wurf (alle 29 Punkte) → Fortunes W6=4, W33 = 3,1
out.xeno = new Builder('E2E Xenobeast', 3).setup().toResults().run({ type: 'SCORE' }).run({ type: 'EVENTS_GENERATE' }, [4, 3, 1]).save();

// Machinations of Fate: W33 = 3,2
out.fate = new Builder('E2E Machinations', 3).setup().toResults().run({ type: 'SCORE' }).run({ type: 'EVENTS_GENERATE' }, [4, 3, 2]).save();

// A Costly Bargain: Xenos (dritte Allianz) liegt 6 Punkte zurück → Desperate Measures W6=4, W3=1; Fortunes W6=1 (kein Event)
{
  const b = new Builder('E2E Costly Bargain', 3).setup();
  const xen = b.s.alliances[2].id;
  // sechs Planeten ohne eigene Fortification Line um 1 senken (29 → 23 Punkte)
  const lower: [string, number][] = [
    ['vikus-decima', 2],
    ['novamagnor', 2],
    ['kryndaer', 1],
    ['karabas', 1],
    ['ikaron-prime', 1],
    ['astarthem', 1],
  ];
  for (const [pid, v] of lower) b.run({ type: 'OVERRIDE_PL', allianceId: xen, planetId: pid, value: v });
  b.toResults().run({ type: 'SCORE' }).run({ type: 'EVENTS_GENERATE' }, [4, 1, 1]);
  out.bargain = b.save();
}

// Kampagnenende mit Gleichstand (1 Phase, alle 29 Punkte, alle Strongholds intakt)
out.ending = new Builder('E2E Finale', 1).setup().toResults().run({ type: 'SCORE' }).save();

fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`Szenarien angelegt: ${Object.keys(out).join(', ')} → ${outFile}`);
