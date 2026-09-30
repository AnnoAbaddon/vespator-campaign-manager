import { INFRA, MEDALS, recommendedFleets, type InfraType, type MedalId } from './data/vespator';
import { house } from './houseRules';
import { forkMap, mapOf, mapWarnings, registryConflicts, validateMap, VESPATOR_MAP, type MapDef } from './map';
import { fail, log, randomPick, warn, type Ctx } from './ctx';
import { allianceName, build, increase, minPL, planet, planetName, powerSum, campaignPoints, countInfra } from './board';
import { newPhase } from './init';
import { carryCommanders, currentAllianceOf, playersOfAlliance } from './players';
import type { CampaignState, SetupInfraChoice, SetupStep } from './types';
import { carryPlanetImages } from './p2Commands';

function requireSetup(ctx: Ctx, step: SetupStep) {
  const s = ctx.state.stage;
  if (s.kind !== 'SETUP' || s.step !== step) fail(`Aktion nur im Setup-Schritt ${step} möglich`);
}

function inheritedFor(ctx: Ctx, medal: MedalId): string | null {
  if (!ctx.state.toggles.medals) return null;
  return ctx.state.inheritedMedals.find((m) => m.medal === medal && m.assignedAllianceId)?.assignedAllianceId ?? null;
}

export function setFleetCount(ctx: Ctx, allianceId: string, n: number) {
  const st0 = ctx.state.stage;
  const lateSetup = st0.kind === 'SETUP' && !['W0', 'W1', 'W2', 'W3'].includes(st0.step);
  if (lateSetup || st0.kind !== 'SETUP') {
    warn(ctx, 'Die Flottenzahl wird nach dem Setup geändert. Neue Flotten müssen danach unter „Allianzen & Spieler → Flotten“ platziert werden, sonst können sie keine Befehle erhalten.');
  }
  if (n < 1 || n > 20) fail('Flottenzahl muss zwischen 1 und 20 liegen');
  // Reserveflotten zählen nicht mit (eigener Zähler, N2.5) – auch aktivierte nicht, die bleiben immer erhalten
  const fleets = ctx.state.fleets.filter((f) => f.allianceId === allianceId && !f.reserve && !f.activated);
  const aName = allianceName(ctx.state, allianceId);
  // Flottennamen in der Kampagnensprache (umbenennbar, daher beim Anlegen festgelegt)
  const word = (ctx.state.meta.locale ?? 'de') === 'de' ? 'Flotte' : 'Fleet';
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
  if (n > fleets.length) {
    for (let i = fleets.length; i < n; i++) {
      let name = `${aName} ${word} ${roman[i]}`;
      let k = i;
      while (ctx.state.fleets.some((f) => f.name === name)) name = `${aName} ${word} ${roman[++k] ?? k + 1}`;
      ctx.state.fleets.push({ id: ctx.newId('fleet'), allianceId, name, planetId: null, commanders: {} });
    }
  } else if (n < fleets.length) {
    const remove = fleets.slice(n).map((f) => f.id);
    const used = remove.filter((id) => ctx.state.phases.some((p) => p.operations.some((o) => o.fleetId === id)));
    if (used.length) fail(`Flotten mit Operationen in der Historie können nicht entfernt werden: ${used.map((id) => ctx.state.fleets.find((f) => f.id === id)?.name).join(', ')}`);
    if (ctx.state.setup.fleetsRevealed) warn(ctx, 'Flotten werden entfernt, obwohl die Startpositionen bereits aufgedeckt sind');
    ctx.state.fleets = ctx.state.fleets.filter((f) => !remove.includes(f.id));
    for (const id of remove) delete ctx.state.setup.fleetStarts[id];
  }
  ctx.state.setup.fleetsPerAlliance[allianceId] = n;
  log(ctx, `${aName}: ${n} Flotten`);
}

export function suggestedFleetCount(ctx: Ctx): number {
  const players = ctx.state.players.filter((p) => p.active).length;
  return recommendedFleets(players, ctx.state.meta.allianceCount);
}

/** Vespator-Karte unverändert (Planeten und Verbindungen)? Dann bleiben die festen IDs erhalten. */
function isPristineVespator(map: MapDef): boolean {
  const norm = (m: MapDef) =>
    JSON.stringify({
      p: m.planets.map((p) => [p.id, p.name, p.system, p.slots, p.theatres.join(','), p.x, p.y]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      c: m.connections.map((c) => [...c].sort().join('|')).sort(),
    });
  return norm(map) === norm(VESPATOR_MAP);
}

/** Karte setzen (Karteneditor, N5.5) – nur in Setup-Schritt W0, danach ist die Karte gesperrt */
export function setMap(ctx: Ctx, input: MapDef) {
  requireSetup(ctx, 'W0');
  const st = ctx.state;
  let map: MapDef = structuredClone(input);
  map.name = map.name.trim();
  for (const p of map.planets) {
    p.name = p.name.trim();
    p.system = (p.system ?? '').trim();
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;
  }
  const errors = validateMap(map);
  if (errors.length) fail(errors.join(' '));
  // Veränderte Vespator-Planeten bekommen eigene IDs, damit die festen IDs eindeutig bleiben
  const rename: Record<string, string> = {};
  if (isPristineVespator(map)) map.template = 'vespator';
  else {
    map.template = null;
    const fixed = new Set(VESPATOR_MAP.planets.map((p) => p.id));
    for (const p of map.planets) if (fixed.has(p.id)) rename[p.id] = `${p.id}.${ctx.newId('m').slice(-6)}`;
    for (const p of map.planets) p.id = rename[p.id] ?? p.id;
    map.connections = map.connections.map(([a, b]) => [rename[a] ?? a, rename[b] ?? b]);
    // Die Registry ist global nach Planeten-ID geschlüsselt: Stehen die IDs dort schon mit anderem Inhalt
    // (z. B. Kampagne doppelt importiert, eine Kopie wird bearbeitet), bekommt die Karte eigene IDs.
    if (registryConflicts(map).length) {
      const f = forkMap(map, () => ctx.newId('m').slice(-6));
      for (const [cur, next] of Object.entries(f.rename)) {
        const orig = Object.keys(rename).find((k) => rename[k] === cur) ?? cur;
        rename[orig] = next;
      }
      map = f.map;
    }
  }
  for (const w of mapWarnings(map)) warn(ctx, w);
  const old = new Map(st.planets.map((p) => [p.id, p]));
  const back = Object.fromEntries(Object.entries(rename).map(([a, b]) => [b, a]));
  st.planets = map.planets.map((d) => {
    const prev = old.get(d.id) ?? old.get(back[d.id] ?? '');
    return { id: d.id, power: {}, destroyed: false, slots: Array.from({ length: d.slots }, () => ({ destroyed: false, infra: null })), lore: prev?.lore ?? '', notes: prev?.notes ?? '' };
  });
  // NTH2 4.2/7.3: eigene Planetenbilder aus dem Editor und übersetzte Lore übernehmen
  carryPlanetImages(map, st.planets, (id) => old.get(id) ?? old.get(back[id] ?? ''));
  // registriert wird erst, wenn der Command gilt (executeCommand) – nicht schon bei einer Rückfrage
  st.map = map;
  log(ctx, `Karte „${map.name}“ gesetzt: ${map.planets.length} Planeten, ${map.connections.length} Verbindungen`);
}

export function finishW0(ctx: Ctx) {
  requireSetup(ctx, 'W0');
  const st = ctx.state;
  if (st.alliances.length !== st.meta.allianceCount) fail(`Es müssen genau ${st.meta.allianceCount} Allianzen angelegt sein`);
  for (const a of st.alliances) {
    const fleets = st.fleets.filter((f) => f.allianceId === a.id && !f.reserve).length;
    if (fleets < 1) fail(`${a.name} hat keine Flotten`);
    const players = playersOfAlliance(st, a.id).length;
    if (players === 0) warn(ctx, `${a.name} hat noch keine Spieler`);
    if (players > fleets) warn(ctx, `${a.name} hat mehr Spieler (${players}) als Flotten (${fleets}) – jeder Spieler braucht mindestens eine Flotte`);
  }
  const colors = st.alliances.map((a) => a.color.toLowerCase());
  if (new Set(colors).size !== colors.length) warn(ctx, 'Zwei Allianzen haben dieselbe Farbe');
  for (const p of st.players) if (p.active && !currentAllianceOf(p)) warn(ctx, `${p.nickname} ist keiner Allianz zugeordnet`);
  for (const p of st.planets) for (const a of st.alliances) p.power[a.id] = 1;
  for (const a of st.alliances) st.setup.strongholds[a.id] ??= { strongholdPlanetId: null, pl3: [], pl2: [] };
  const hasMedals = st.toggles.medals && st.inheritedMedals.length > 0;
  st.stage = { kind: 'SETUP', step: hasMedals ? 'W1' : 'W2' };
  if (!hasMedals) initLaurel(ctx);
  log(ctx, 'Setup: Allianzen, Spieler und Flotten festgelegt');
}

export function assignMedal(ctx: Ctx, medal: MedalId, allianceId: string | null) {
  requireSetup(ctx, 'W1');
  const m = ctx.state.inheritedMedals.find((x) => x.medal === medal);
  if (!m) fail('Medaille nicht vorhanden');
  m.assignedAllianceId = allianceId;
  log(ctx, `${MEDALS[medal].name}: ${allianceId ? allianceName(ctx.state, allianceId) : 'verworfen'}`);
}

/** Vorschlag: Allianz mit den meisten Trägern (Gleichstand → Roll-off) */
export function suggestMedalAssignments(ctx: Ctx) {
  requireSetup(ctx, 'W1');
  for (const m of ctx.state.inheritedMedals) {
    const counts = ctx.state.alliances.map((a) => ({
      id: a.id,
      n: m.holderPlayerIds.filter((pid) => {
        const p = ctx.state.players.find((x) => x.id === pid);
        return p && currentAllianceOf(p) === a.id;
      }).length,
    }));
    const max = Math.max(...counts.map((c) => c.n));
    if (max === 0) {
      m.assignedAllianceId = null;
      log(ctx, `${MEDALS[m.medal].name}: kein Träger in einer Allianz – verworfen`);
      continue;
    }
    const top = counts.filter((c) => c.n === max).map((c) => c.id);
    const chosen = top.length > 1 ? randomPick(ctx, top, 1, `${MEDALS[m.medal].name}`, (id) => allianceName(ctx.state, id))[0] : top[0];
    m.assignedAllianceId = chosen;
    log(ctx, `${MEDALS[m.medal].name} → ${allianceName(ctx.state, chosen)} (${max} Träger)`);
  }
}

function initLaurel(ctx: Ctx) {
  const laurel = inheritedFor(ctx, 'LAUREL');
  ctx.state.setup.laurel = laurel ? { allianceId: laurel, planetId: null } : null;
}

export function finishW1(ctx: Ctx) {
  requireSetup(ctx, 'W1');
  for (const m of ctx.state.inheritedMedals) if (m.assignedAllianceId === undefined) fail(`${MEDALS[m.medal].name} ist noch nicht zugeordnet oder verworfen`);
  ctx.state.stage = { kind: 'SETUP', step: 'W2' };
  initLaurel(ctx);
}

export function setLaurelPlanet(ctx: Ctx, planetId: string) {
  requireSetup(ctx, 'W2');
  const l = ctx.state.setup.laurel;
  if (!l) fail('Keine Laurel of Victory zugeordnet');
  if (ctx.state.setup.strongholdsRevealed) fail('Strongholds sind bereits aufgedeckt');
  planet(ctx.state, planetId);
  l.planetId = planetId;
  // bereits gespeicherte Wahlen anderer Allianzen, die den Laurel-Planeten enthalten, müssen neu getroffen werden
  for (const [aid, c] of Object.entries(ctx.state.setup.strongholds)) {
    if (aid === l.allianceId) continue;
    if (c.strongholdPlanetId === planetId || c.pl3.includes(planetId) || c.pl2.includes(planetId)) {
      ctx.state.setup.strongholds[aid] = { strongholdPlanetId: null, pl3: [], pl2: [] };
      warn(ctx, `${allianceName(ctx.state, aid)} hatte ${planetName(planetId)} gewählt und muss neu wählen (Laurel of Victory)`);
    }
  }
  const ch = ctx.state.setup.strongholds[l.allianceId];
  ch.strongholdPlanetId = planetId;
  ch.pl3 = ch.pl3.filter((p) => p !== planetId);
  ch.pl2 = ch.pl2.filter((p) => p !== planetId);
  log(ctx, `Laurel of Victory: ${allianceName(ctx.state, l.allianceId)} wählt ${planetName(planetId)}`);
}

/**
 * Start-Power-Level je Allianz (Regelwerk: 1× PL 4, 3× PL 3, 4× PL 2). Auf kleinen Karten wird die Zahl
 * gekürzt, damit mindestens ein Planet auf PL 1 bleibt; der Laurel-Planet ist für andere Allianzen gesperrt.
 * Ab 9 Planeten entspricht das Ergebnis immer dem Regelwerk.
 */
export function strongholdQuota(state: Pick<CampaignState, 'map' | 'setup'>, allianceId: string): { pl3: number; pl2: number } {
  const laurel = state.setup.laurel;
  const available = mapOf(state).planets.length - (laurel && laurel.allianceId !== allianceId ? 1 : 0);
  const pl3 = Math.max(0, Math.min(3, available - 1));
  const pl2 = Math.max(0, Math.min(4, available - 1 - pl3));
  return { pl3, pl2 };
}

export function setStrongholdChoice(ctx: Ctx, allianceId: string, strongholdPlanetId: string | null, pl3: string[], pl2: string[]) {
  requireSetup(ctx, 'W2');
  const su = ctx.state.setup;
  if (su.strongholdsRevealed) fail('Strongholds sind bereits aufgedeckt');
  const all = [strongholdPlanetId, ...pl3, ...pl2].filter(Boolean) as string[];
  for (const id of all) planet(ctx.state, id);
  if (new Set(all).size !== all.length) fail('Jeder Planet darf nur einer Stufe zugeordnet werden');
  const q = strongholdQuota(ctx.state, allianceId);
  if (pl3.length > q.pl3) fail(`Höchstens ${q.pl3} Planeten mit Power Level 3`);
  if (pl2.length > q.pl2) fail(`Höchstens ${q.pl2} Planeten mit Power Level 2`);
  const l = su.laurel;
  if (l?.planetId) {
    if (l.allianceId === allianceId && strongholdPlanetId !== l.planetId) fail('Die Laurel-Allianz muss ihren Stronghold auf dem Laurel-Planeten bauen');
    if (l.allianceId !== allianceId && all.includes(l.planetId)) fail(`${planetName(l.planetId)} ist durch die Laurel of Victory gesperrt (max. PL 1 für andere Allianzen)`);
  }
  su.strongholds[allianceId] = { strongholdPlanetId, pl3, pl2 };
}

export function revealStrongholds(ctx: Ctx) {
  requireSetup(ctx, 'W2');
  const st = ctx.state;
  const su = st.setup;
  if (su.strongholdsRevealed) fail('Bereits aufgedeckt');
  if (su.laurel && !su.laurel.planetId) fail('Die Laurel-Allianz muss zuerst ihren Planeten wählen');
  if (su.laurel?.planetId) {
    const lp = su.laurel.planetId;
    for (const a of st.alliances) {
      const c = su.strongholds[a.id];
      if (a.id === su.laurel.allianceId && c?.strongholdPlanetId !== lp) fail(`${a.name} muss den Stronghold auf ${planetName(lp)} bauen (Laurel of Victory)`);
      if (a.id !== su.laurel.allianceId && c && (c.strongholdPlanetId === lp || c.pl3.includes(lp) || c.pl2.includes(lp))) fail(`${a.name}: ${planetName(lp)} ist durch die Laurel of Victory gesperrt`);
    }
  }
  for (const a of st.alliances) {
    const c = su.strongholds[a.id];
    const q = strongholdQuota(st, a.id);
    if (!c?.strongholdPlanetId || c.pl3.length !== q.pl3 || c.pl2.length !== q.pl2) fail(`${a.name}: Stronghold, ${q.pl3}× PL 3 und ${q.pl2}× PL 2 müssen gewählt sein`);
  }
  // Konflikte: mehr Strongholds als Locations
  su.messages = [];
  let conflict = false;
  for (const p of mapOf(st).planets) {
    const wanting = st.alliances.filter((a) => su.strongholds[a.id].strongholdPlanetId === p.id).map((a) => a.id);
    const free = planet(st, p.id).slots.filter((x) => !x.destroyed && !x.infra).length;
    if (wanting.length > free) {
      conflict = true;
      const keep = randomPick(ctx, wanting, free, `Stronghold-Konflikt ${p.name}`, (id) => allianceName(st, id));
      for (const id of wanting) {
        if (!keep.includes(id)) {
          su.strongholds[id] = { strongholdPlanetId: null, pl3: [], pl2: [] };
          su.messages.push(`${allianceName(st, id)} muss neu wählen (Stronghold-Konflikt auf ${p.name})`);
        }
      }
    }
  }
  if (conflict) {
    log(ctx, su.messages.join('; '));
    return;
  }
  for (const a of st.alliances) {
    const c = su.strongholds[a.id];
    for (const p of st.planets) p.power[a.id] = 1;
    planet(st, c.strongholdPlanetId!).power[a.id] = 4;
    for (const id of c.pl3) planet(st, id).power[a.id] = 3;
    for (const id of c.pl2) planet(st, id).power[a.id] = 2;
    build(ctx, a.id, 'STRONGHOLD', c.strongholdPlanetId!, { allowStronghold: true, why: 'Setup' });
  }
  if (su.laurel?.planetId) build(ctx, su.laurel.allianceId, 'FORTIFICATION_LINE', su.laurel.planetId, { why: 'Laurel of Victory' });
  su.strongholdsRevealed = true;
  log(ctx, 'Strongholds und Start-Power-Level aufgedeckt');
}

export function applyWreath(ctx: Ctx, planetIds: string[]) {
  requireSetup(ctx, 'W2');
  const w = inheritedFor(ctx, 'WREATH');
  if (!w) fail('Keine Penumbral Wreath zugeordnet');
  if (!ctx.state.setup.strongholdsRevealed) fail('Erst Strongholds aufdecken');
  if (ctx.state.setup.wreathApplied) fail('Bereits angewendet');
  if (planetIds.length !== 2 || planetIds[0] === planetIds[1]) fail('Zwei verschiedene Planeten wählen');
  for (const id of planetIds) increase(ctx, w, id, 2, 'Penumbral Wreath', house(ctx.state, 'F17_PL_FIVE') ? 5 : 4);
  ctx.state.setup.wreathApplied = true;
}

export function finishW2(ctx: Ctx) {
  requireSetup(ctx, 'W2');
  if (!ctx.state.setup.strongholdsRevealed) fail('Strongholds müssen aufgedeckt sein');
  if (inheritedFor(ctx, 'WREATH') && !ctx.state.setup.wreathApplied) warn(ctx, 'Penumbral Wreath wurde nicht angewendet');
  ctx.state.stage = { kind: 'SETUP', step: 'W3' };
}

export function setInfraChoice(ctx: Ctx, allianceId: string, items: { type: InfraType; planetId: string | null }[]) {
  requireSetup(ctx, 'W3');
  const su = ctx.state.setup;
  if (su.infraRevealed) fail('Infrastruktur bereits aufgedeckt');
  const built = su.infra.filter((i) => i.allianceId === allianceId && i.built);
  const total = built.length + items.length;
  if (total > ctx.state.toggles.setupInfraCount) fail(`Höchstens ${ctx.state.toggles.setupInfraCount} Start-Infrastrukturen`);
  for (const it of items) {
    if (it.type === 'STRONGHOLD') fail('Strongholds sind hier nicht erlaubt');
    if (it.planetId) {
      planet(ctx.state, it.planetId);
      if (su.laurel?.planetId === it.planetId && su.laurel.allianceId !== allianceId) fail(`${planetName(it.planetId)} ist durch die Laurel of Victory gesperrt`);
    }
  }
  for (const t of ['STAGING_GROUNDS', 'SUPPORT_FACILITY', 'FORTIFICATION_LINE'] as InfraType[]) {
    const n = countInfra(ctx.state, allianceId, t) + items.filter((i) => i.type === t).length;
    if (n > INFRA[t].max) fail(`Zu viele ${INFRA[t].name} (max. ${INFRA[t].max})`);
  }
  su.infra = su.infra.filter((i) => i.allianceId !== allianceId || i.built);
  for (const it of items) su.infra.push({ id: ctx.newId('si'), allianceId, type: it.type, planetId: it.planetId, built: false, bounced: false });
}

export function revealInfra(ctx: Ctx) {
  requireSetup(ctx, 'W3');
  const st = ctx.state;
  const su = st.setup;
  if (su.infraRevealed) fail('Bereits aufgedeckt');
  for (const a of st.alliances) {
    const n = su.infra.filter((i) => i.allianceId === a.id).length;
    if (n !== st.toggles.setupInfraCount) fail(`${a.name}: genau ${st.toggles.setupInfraCount} Infrastrukturen wählen (aktuell ${n})`);
    if (su.infra.some((i) => i.allianceId === a.id && !i.built && !i.planetId)) fail(`${a.name}: Planet für jede Infrastruktur wählen`);
  }
  su.messages = [];
  const pending = su.infra.filter((i) => !i.built);
  const byPlanet: Record<string, SetupInfraChoice[]> = {};
  for (const i of pending) (byPlanet[i.planetId!] ??= []).push(i);
  for (const [pid, list] of Object.entries(byPlanet)) {
    const free = planet(st, pid).slots.filter((s) => !s.destroyed && !s.infra).length;
    let chosen = list;
    if (list.length > free) {
      chosen = randomPick(ctx, list, free, `Infrastruktur-Konflikt ${planetName(pid)}`, (i) => `${allianceName(st, i.allianceId)} ${INFRA[i.type].name}`);
    }
    for (const i of list) {
      if (chosen.includes(i)) {
        build(ctx, i.allianceId, i.type, pid, { why: 'Setup' });
        i.built = true;
        i.bounced = false;
      } else {
        i.planetId = null;
        i.bounced = true;
        su.messages.push(`${allianceName(st, i.allianceId)}: ${INFRA[i.type].name} passt nicht mehr auf ${planetName(pid)} – neuen Planeten wählen`);
      }
    }
  }
  if (su.messages.length) {
    log(ctx, su.messages.join('; '));
    return;
  }
  su.infraRevealed = true;
  log(ctx, 'Start-Infrastruktur aufgedeckt');
}

/** Planet für eine zurückgewiesene Infrastruktur neu wählen */
export function rechooseInfra(ctx: Ctx, itemId: string, planetId: string) {
  requireSetup(ctx, 'W3');
  const i = ctx.state.setup.infra.find((x) => x.id === itemId);
  if (!i || i.built) fail('Element nicht gefunden oder bereits gebaut');
  const su = ctx.state.setup;
  if (su.laurel?.planetId === planetId && su.laurel.allianceId !== i.allianceId) fail('Planet ist durch die Laurel of Victory gesperrt');
  planet(ctx.state, planetId);
  i.planetId = planetId;
}

export function finishW3(ctx: Ctx) {
  requireSetup(ctx, 'W3');
  if (!ctx.state.setup.infraRevealed) fail('Infrastruktur muss aufgedeckt sein');
  ctx.state.stage = { kind: 'SETUP', step: 'W4' };
}

export function setFleetStarts(ctx: Ctx, starts: Record<string, string>) {
  requireSetup(ctx, 'W4');
  const su = ctx.state.setup;
  if (su.fleetsRevealed) fail('Flotten bereits aufgedeckt');
  for (const [fid, pid] of Object.entries(starts)) {
    const f = ctx.state.fleets.find((x) => x.id === fid);
    if (!f) fail('Unbekannte Flotte');
    planet(ctx.state, pid);
    if (su.laurel?.planetId === pid && su.laurel.allianceId !== f.allianceId) fail(`Keine fremden Flotten auf ${planetName(pid)} (Laurel of Victory)`);
    su.fleetStarts[fid] = pid;
  }
}

export function revealFleets(ctx: Ctx) {
  requireSetup(ctx, 'W4');
  const su = ctx.state.setup;
  for (const f of ctx.state.fleets) if (!f.reserve && !su.fleetStarts[f.id]) fail(`${f.name}: Startplanet fehlt`);
  for (const f of ctx.state.fleets) if (!f.reserve) f.planetId = su.fleetStarts[f.id];
  su.fleetsRevealed = true;
  log(ctx, 'Flotten-Startpositionen aufgedeckt');
}

export function daggerSwap(ctx: Ctx, a: string, b: string) {
  requireSetup(ctx, 'W4');
  const al = inheritedFor(ctx, 'DAGGER');
  if (!al) fail('Kein Sable Dagger zugeordnet');
  const su = ctx.state.setup;
  if (!su.fleetsRevealed) fail('Erst Flotten aufdecken');
  if (su.daggerSwaps >= 3) fail('Höchstens 3 Tausche');
  if (a === b) fail('Zwei verschiedene Planeten wählen');
  const pa = planet(ctx.state, a);
  const pb = planet(ctx.state, b);
  const va = pa.power[al];
  const vb = pb.power[al];
  pa.power[al] = vb;
  pb.power[al] = va;
  // Fortification-Minimum sicherstellen
  for (const p of [pa, pb]) {
    const min = minPL(ctx.state, al, p.id);
    if (p.power[al] < min) p.power[al] = min;
  }
  su.daggerSwaps++;
  log(ctx, `Sable Dagger: ${allianceName(ctx.state, al)} tauscht PL ${planetName(a)} (${va}) ↔ ${planetName(b)} (${vb})`);
}

export function finishW4(ctx: Ctx) {
  requireSetup(ctx, 'W4');
  if (!ctx.state.setup.fleetsRevealed) fail('Flotten müssen aufgedeckt sein');
  ctx.state.stage = { kind: 'SETUP', step: 'W5' };
}

export function startCampaign(ctx: Ctx, dates: { startDate?: string | null; opsDeadline?: string | null; battlesDeadline?: string | null; endDate?: string | null }) {
  requireSetup(ctx, 'W5');
  const st = ctx.state;
  st.pointsHistory = [
    {
      phaseNumber: 0,
      points: Object.fromEntries(st.alliances.map((a) => [a.id, campaignPoints(st, a.id)])),
      powerSum: Object.fromEntries(st.alliances.map((a) => [a.id, powerSum(st, a.id)])),
      planets: Object.fromEntries(st.planets.map((p) => [p.id, { ...p.power }])),
    },
  ];
  const ph = newPhase(1);
  Object.assign(ph, {
    startDate: dates.startDate ?? null,
    opsDeadline: dates.opsDeadline ?? null,
    battlesDeadline: dates.battlesDeadline ?? null,
    endDate: dates.endDate ?? null,
  });
  st.phases = [ph];
  st.stage = { kind: 'PHASE', phase: 1, step: 'OPS' };
  const star = inheritedFor(ctx, 'STAR');
  if (star) st.modifiers.push({ id: ctx.newId('mod'), source: 'medal:STAR', kind: 'STAR_OF_VOIDFARER', phaseNumber: 1, allianceId: star });
  carryCommanders(st, 1);
  log(ctx, 'Kampagne gestartet – Phase 1');
}

// ─── Reserveflotten (N2.5) ─────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Zahl der (noch nicht aktivierten) Reserveflotten einer Allianz setzen */
export function setReserveCount(ctx: Ctx, allianceId: string, n: number) {
  const st = ctx.state;
  if (!st.alliances.some((a) => a.id === allianceId)) fail('Unbekannte Allianz');
  if (!Number.isInteger(n) || n < 0 || n > 10) fail('0–10 Reserveflotten');
  const waiting = st.fleets.filter((f) => f.allianceId === allianceId && f.reserve);
  const aName = allianceName(st, allianceId);
  if (n > waiting.length) {
    for (let i = waiting.length; i < n; i++) {
      let k = i;
      let name = `${aName} Reserve ${ROMAN[k] ?? k + 1}`;
      while (st.fleets.some((f) => f.name === name)) name = `${aName} Reserve ${ROMAN[++k] ?? k + 1}`;
      st.fleets.push({ id: ctx.newId('fleet'), allianceId, name, planetId: null, commanders: {}, reserve: true, activated: null });
    }
  } else if (n < waiting.length) {
    const remove = new Set(waiting.slice(n).map((f) => f.id));
    st.fleets = st.fleets.filter((f) => !remove.has(f.id));
  }
  log(ctx, `${aName}: ${n} Reserveflotte(n)`);
}

/** Reserveflotte aktivieren: Platzierung bei eigener Flotte oder eigenem Stronghold */
export function activateReserve(ctx: Ctx, fleetId: string, planetId: string) {
  const st = ctx.state;
  if (st.stage.kind !== 'PHASE') fail('Reserveflotten werden während einer Phase aktiviert');
  const f = st.fleets.find((x) => x.id === fleetId);
  if (!f?.reserve) fail('Keine wartende Reserveflotte');
  const p = planet(st, planetId);
  if (p.destroyed) fail(`${planetName(planetId)} ist zerstört`);
  const ownFleet = st.fleets.some((x) => x.allianceId === f.allianceId && !x.reserve && x.planetId === planetId);
  const ownSh = p.slots.some((s) => !s.destroyed && s.infra?.type === 'STRONGHOLD' && s.infra.allianceId === f.allianceId);
  if (!ownFleet && !ownSh) fail('Nur auf einem Planeten mit eigener Flotte oder eigenem Stronghold');
  if (st.stage.step !== 'OPS') warn(ctx, 'Die Flotte kann erst in der nächsten Phase Befehle erhalten');
  f.reserve = false;
  f.planetId = planetId;
  f.activated = { phase: st.stage.phase, planetId };
  // Kommandant zuweisen (N2.5) – wie beim Phasenwechsel reihum unter den Spielern der Allianz
  carryCommanders(st, st.stage.phase);
  log(ctx, `Verstärkung für ${allianceName(st, f.allianceId)} bei ${planetName(planetId)}: ${f.name}`);
}
