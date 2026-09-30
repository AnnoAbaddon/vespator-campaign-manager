/**
 * Legt eine Demo-Kampagne an (3 Allianzen, 9 Spieler, Setup abgeschlossen, Phase 1 mit Operationen).
 * Nutzung: npx tsx scripts/seed-demo.ts [DATA_DIR]
 */
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from '../src/server/schema-sql';
import { executeCommand, type Command } from '../src/engine/commands';
import { createCampaignState } from '../src/engine/init';
import type { CampaignState } from '../src/engine/types';

const dataDir = process.argv[2] ?? process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'app.db'));

const revs: { cmd: unknown; state: CampaignState; summary: string; log: string[] }[] = [];
let s = createCampaignState({ name: 'Demo: Krieg an der Vespator-Front', intro: 'Die **Vespator-Front** brennt. Drei Allianzen ringen um dreizehn Welten.', phaseCount: 5, allianceCount: 3 });
revs.push({ cmd: { type: 'CREATE' }, state: s, summary: 'Kampagne angelegt', log: ['Kampagne angelegt'] });

function run(cmd: Command, dice: number[] = []) {
  const r = executeCommand(s, cmd, { force: true, reason: 'Demo', dice: { mode: dice.length ? 'MANUAL' : 'DIGITAL', manual: dice, random: (n) => crypto.randomInt(1, n + 1) } });
  if (!r.ok) throw new Error(`${cmd.type}: ${JSON.stringify(r)}`);
  s = r.state;
  revs.push({ cmd, state: s, summary: r.summary, log: r.log });
}

run({ type: 'ALLIANCE_UPSERT', name: 'Imperium', color: '#3e9bff', lore: 'Die Streitkräfte des Imperiums unter dem Banner der Ultramarines.' });
run({ type: 'ALLIANCE_UPSERT', name: 'Chaos', color: '#e5484d', lore: 'Verräter und Kultisten der Dunklen Götter.' });
run({ type: 'ALLIANCE_UPSERT', name: 'Xenos', color: '#46c46e', lore: 'Nekrons, Orks und Aeldari – ein Zweckbündnis.' });
const [imp, cha, xen] = s.alliances.map((a) => a.id);
const players: [string, string, string][] = [
  ['Konrad', 'Space Marines', imp],
  ['Mira', 'Astra Militarum', imp],
  ['Sven', 'Adepta Sororitas', imp],
  ['Dario', 'Chaos Space Marines', cha],
  ['Lena', 'Death Guard', cha],
  ['Tobi', 'World Eaters', cha],
  ['Ayla', 'Necrons', xen],
  ['Jonas', 'Orks', xen],
  ['Pia', 'Aeldari', xen],
];
for (const [n, f, a] of players) run({ type: 'PLAYER_UPSERT', data: { nickname: n, faction: f }, allianceId: a });
for (const a of [imp, cha, xen]) run({ type: 'FLEET_SET_COUNT', allianceId: a, count: 3 });
run({ type: 'SETUP_W0_DONE' });
run({ type: 'SETUP_STRONGHOLDS', allianceId: imp, strongholdPlanetId: 'caltus-novem', pl3: ['kryndaer', 'marvinius', 'vikus-decima'], pl2: ['karabas', 'norallus', 'novamagnor', 'ikaron-prime'] });
run({ type: 'SETUP_STRONGHOLDS', allianceId: cha, strongholdPlanetId: 'norallus', pl3: ['masnet', 'karabas', 'felgris-secundas'], pl2: ['kryndaer', 'tarkad-vindix', 'caltus-novem', 'marvinius'] });
run({ type: 'SETUP_STRONGHOLDS', allianceId: xen, strongholdPlanetId: 'jawardet', pl3: ['tarkad-vindix', 'astarthem', 'ikaron-prime'], pl2: ['novamagnor', 'felgris-secundas', 'masnet', 'vikus-decima'] });
run({ type: 'SETUP_REVEAL_STRONGHOLDS' });
run({ type: 'SETUP_W2_DONE' });
run({ type: 'SETUP_INFRA', allianceId: imp, items: [{ type: 'FORTIFICATION_LINE', planetId: 'caltus-novem' }, { type: 'SUPPORT_FACILITY', planetId: 'vikus-decima' }, { type: 'STAGING_GROUNDS', planetId: 'kryndaer' }] });
run({ type: 'SETUP_INFRA', allianceId: cha, items: [{ type: 'FORTIFICATION_LINE', planetId: 'norallus' }, { type: 'SUPPORT_FACILITY', planetId: 'masnet' }, { type: 'STAGING_GROUNDS', planetId: 'karabas' }] });
run({ type: 'SETUP_INFRA', allianceId: xen, items: [{ type: 'FORTIFICATION_LINE', planetId: 'astarthem' }, { type: 'SUPPORT_FACILITY', planetId: 'ikaron-prime' }, { type: 'STAGING_GROUNDS', planetId: 'tarkad-vindix' }] });
run({ type: 'SETUP_REVEAL_INFRA' });
run({ type: 'SETUP_W3_DONE' });
const fl = (a: string) => s.fleets.filter((f) => f.allianceId === a).map((f) => f.id);
const [i1, i2, i3] = fl(imp);
const [c1, c2, c3] = fl(cha);
const [x1, x2, x3] = fl(xen);
run({
  type: 'SETUP_FLEET_STARTS',
  starts: { [i1]: 'kryndaer', [i2]: 'caltus-novem', [i3]: 'vikus-decima', [c1]: 'norallus', [c2]: 'masnet', [c3]: 'karabas', [x1]: 'tarkad-vindix', [x2]: 'ikaron-prime', [x3]: 'astarthem' },
});
run({ type: 'SETUP_REVEAL_FLEETS' });
run({ type: 'SETUP_W4_DONE' });
const now = Date.now();
run({ type: 'SETUP_START', startDate: new Date(now).toISOString(), opsDeadline: new Date(now + 5 * 86400000).toISOString(), battlesDeadline: new Date(now + 30 * 86400000).toISOString() });
run({ type: 'DISPATCH_UPSERT', title: 'Die Front erwacht', body: 'Willkommen zur Kampagne! Bitte schickt eure **Operationen** bis Freitag.', pinned: true, public: true });
run({ type: 'OP_SET', fleetId: i1, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'norallus', targetAllianceId: cha } });
run({ type: 'OP_SET', fleetId: c2, slot: 1, op: { type: 'BATTLE', attackType: 'ORBITAL_INVASION', targetPlanetId: 'tarkad-vindix', targetAllianceId: xen } });
run({ type: 'OP_SET', fleetId: x2, slot: 1, op: { type: 'BATTLE', attackType: 'SEIZE_POWER_BASE', targetPlanetId: 'caltus-novem', targetAllianceId: imp } });
run({ type: 'OP_SET', fleetId: i3, slot: 1, op: { type: 'RAISE_EDIFICES', infraType: 'FORTIFICATION_LINE' } });
run({ type: 'OP_SET', fleetId: c3, slot: 1, op: { type: 'KILL_TEAMS', killTeamPlanetId: 'kryndaer' } });
run({ type: 'OP_SET', fleetId: x3, slot: 1, op: { type: 'VOID_LEAP', destinationPlanetId: 'marvinius' } });

const id = crypto.randomBytes(9).toString('base64url');
const token = crypto.randomBytes(32).toString('base64url');
const ts = new Date().toISOString();
db.exec(SCHEMA_SQL);
db.prepare('INSERT INTO campaign(id, name, public_token, current_rev, created_at, updated_at) VALUES(?,?,?,?,?,?)').run(id, s.meta.name, token, revs.length, ts, ts);
const ins = db.prepare('INSERT INTO revision(campaign_id, number, parent_number, command, state, summary, log, created_at) VALUES(?,?,?,?,?,?,?,?)');
revs.forEach((r, i) => ins.run(id, i + 1, i === 0 ? null : i, JSON.stringify(r.cmd), JSON.stringify(r.state), r.summary, JSON.stringify(r.log), ts));
console.log(`Demo-Kampagne angelegt: /admin/c/${id}`);
console.log(`Öffentlich: /v/${token}`);
