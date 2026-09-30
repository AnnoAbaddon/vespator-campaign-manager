// NTH2 3.3: Minimales Beispiel-Regelmodul („Demo-Modul“) als Test-Fixture und Vorlage für docs/MODULE.md.
// Zwei Angriffsarten, eine einfache Punkteregel, ein Setup-Schritt und drei Phasenschritte.
// Eigene Mechanik in eigenen Worten – kein Regeltext aus Büchern.

import { fail, log, type Ctx } from '@/engine/ctx';
import { defaultToggles, newPhase } from '@/engine/init';
import type { MapDef } from '@/engine/map';
import type { CampaignModule, ModuleOpInput } from '@/engine/modules/types';
import type { CampaignState } from '@/engine/types';

/** Angriffsarten des Demo-Moduls: Punkte für den Angreifer bei Sieg */
export const DEMO_ATTACKS = {
  RAID: { name: 'Überfall', points: 1 },
  SIEGE: { name: 'Belagerung', points: 2 },
} as const;
type DemoAttackType = keyof typeof DEMO_ATTACKS;

export interface DemoAttack {
  id: string;
  phase: number;
  fleetId: string;
  allianceId: string;
  attackType: DemoAttackType;
  targetAllianceId: string;
  targetPlanetId: string;
  winner: 'ATTACKER' | 'DEFENDER' | null;
}

interface DemoState {
  attacks: DemoAttack[];
  /** laufende Punkte je Allianz */
  points: Record<string, number>;
}

export const DEMO_MAP: MapDef = {
  name: 'Demo-Sektor',
  template: null,
  background: null,
  // Die Kartenprüfung des Kerns verlangt mindestens 6 Planeten mit je einem Theatre
  planets: [
    { id: 'demo-nord', name: 'Nord', system: 'Demo', slots: 1, theatres: ['DEAD_LANDS'], x: 50, y: 10 },
    { id: 'demo-mitte', name: 'Mitte', system: 'Demo', slots: 1, theatres: ['DEAD_LANDS'], x: 50, y: 50 },
    { id: 'demo-sued', name: 'Süd', system: 'Demo', slots: 1, theatres: ['DEAD_LANDS'], x: 50, y: 90 },
    { id: 'demo-ost', name: 'Ost', system: 'Demo', slots: 1, theatres: ['DEAD_LANDS'], x: 90, y: 50 },
    { id: 'demo-west', name: 'West', system: 'Demo', slots: 1, theatres: ['DEAD_LANDS'], x: 10, y: 50 },
    { id: 'demo-tiefe', name: 'Tiefe', system: 'Demo', slots: 1, theatres: ['DEAD_LANDS'], x: 70, y: 90 },
  ],
  connections: [
    ['demo-nord', 'demo-mitte'],
    ['demo-mitte', 'demo-sued'],
    ['demo-west', 'demo-mitte'],
    ['demo-mitte', 'demo-ost'],
    ['demo-sued', 'demo-tiefe'],
  ],
};

/** Modul-eigener Zustand (liegt unter state.moduleState.demo) */
export function demoState(st: CampaignState): DemoState {
  const ms = (st.moduleState ??= {});
  return (ms.demo ??= { attacks: [], points: {} }) as DemoState;
}

/** Schlacht → Outcome: Sieger-Angreifer erhält die Punkte der Angriffsart, ein siegreicher Verteidiger 1 Punkt */
export function outcomePoints(a: DemoAttack): { allianceId: string; points: number } {
  if (a.winner === 'ATTACKER') return { allianceId: a.allianceId, points: DEMO_ATTACKS[a.attackType].points };
  return { allianceId: a.targetAllianceId, points: 1 };
}

function curPhaseNumber(ctx: Ctx, step?: string): number {
  const s = ctx.state.stage;
  if (s.kind !== 'PHASE') fail('Keine laufende Phase');
  if (step && s.step !== step) fail(`Aktion nur in Schritt ${step} möglich`);
  return s.phase;
}

function validate(ctx: Ctx, fleetId: string, input: ModuleOpInput) {
  const st = ctx.state;
  curPhaseNumber(ctx, 'OPS');
  const f = st.fleets.find((x) => x.id === fleetId);
  if (!f?.planetId) fail('Flotte ohne Position');
  if (input.type !== 'BATTLE') fail('Im Demo-Modul gibt es nur Angriffe');
  if (!input.attackType || !(input.attackType in DEMO_ATTACKS)) fail('Unbekannte Angriffsart');
  if (!input.targetAllianceId || input.targetAllianceId === f.allianceId) fail('Gegnerische Allianz wählen');
  if (!st.map.planets.some((p) => p.id === input.targetPlanetId)) fail('Zielplanet wählen');
}

export const demoModule: CampaignModule = {
  id: 'demo',
  name: 'Demo-Modul',
  version: '0.1.0',
  description: 'Beispielmodul: zwei Angriffsarten, Punkte für Siege, Ende nach der letzten Phase.',
  data: { attackTypes: DEMO_ATTACKS, opTypes: { BATTLE: { name: 'Angriff' } } },
  defaultMap: () => DEMO_MAP,
  setupSteps: [{ id: 'W0', label: 'Allianzen & Spieler' }],
  phaseSteps: [
    { id: 'OPS', label: 'Angriffe erklären' },
    { id: 'BATTLES', label: 'Schlachten' },
    { id: 'RESULTS', label: 'Wertung' },
  ],
  defaultToggles: (n) => ({ ...defaultToggles(n), events: { fortunesOfWar: false, perilsOfPower: false, desperateMeasures: false, disabled: [] }, medals: false, theatreTwists: false }),
  houseRules: [],
  initState: (st) => void demoState(st),

  startCampaign(ctx, dates) {
    const st = ctx.state;
    if (st.stage.kind !== 'SETUP') fail('Die Kampagne läuft bereits');
    if (st.alliances.length !== st.meta.allianceCount) fail(`Diese Kampagne braucht ${st.meta.allianceCount} Allianzen`);
    // Startaufstellung: Flotten der n-ten Allianz stehen auf dem n-ten Planeten
    st.alliances.forEach((a, i) => {
      for (const f of st.fleets.filter((x) => x.allianceId === a.id)) f.planetId = st.map.planets[i % st.map.planets.length].id;
    });
    const ds = demoState(st);
    ds.points = Object.fromEntries(st.alliances.map((a) => [a.id, 0]));
    st.pointsHistory = [{ phaseNumber: 0, points: { ...ds.points }, powerSum: {} }];
    st.phases = [Object.assign(newPhase(1), { startDate: dates.startDate ?? null })];
    st.stage = { kind: 'PHASE', phase: 1, step: 'OPS' };
    log(ctx, 'Demo-Kampagne gestartet');
  },

  operations: {
    validate: (ctx, fleetId, _slot, input) => validate(ctx, fleetId, input),
    set(ctx, fleetId, slot, input) {
      if (slot !== 1) fail('Nur ein Befehl je Flotte');
      validate(ctx, fleetId, input);
      const st = ctx.state;
      const n = curPhaseNumber(ctx);
      const f = st.fleets.find((x) => x.id === fleetId)!;
      const ds = demoState(st);
      ds.attacks = ds.attacks.filter((a) => !(a.phase === n && a.fleetId === fleetId));
      ds.attacks.push({
        id: ctx.newId('demo'),
        phase: n,
        fleetId,
        allianceId: f.allianceId,
        attackType: input.attackType as DemoAttackType,
        targetAllianceId: input.targetAllianceId!,
        targetPlanetId: input.targetPlanetId!,
        winner: null,
      });
      log(ctx, `${f.name}: Angriff erklärt`);
    },
    clear(ctx, fleetId) {
      const n = curPhaseNumber(ctx, 'OPS');
      const ds = demoState(ctx.state);
      ds.attacks = ds.attacks.filter((a) => !(a.phase === n && a.fleetId === fleetId));
    },
  },

  advance(ctx) {
    const st = ctx.state;
    const s = st.stage;
    if (s.kind !== 'PHASE') fail('Keine laufende Phase');
    const ds = demoState(st);
    const mine = ds.attacks.filter((a) => a.phase === s.phase);
    switch (s.step) {
      case 'OPS':
        st.stage = { kind: 'PHASE', phase: s.phase, step: 'BATTLES' };
        log(ctx, `Phase ${s.phase}: ${mine.length} Angriff(e)`);
        return;
      case 'BATTLES': {
        if (mine.some((a) => !a.winner)) fail('Noch nicht alle Schlachten haben ein Ergebnis');
        for (const a of mine) {
          const o = outcomePoints(a);
          ds.points[o.allianceId] = (ds.points[o.allianceId] ?? 0) + o.points;
        }
        st.stage = { kind: 'PHASE', phase: s.phase, step: 'RESULTS' };
        log(ctx, `Phase ${s.phase}: Ergebnisse ausgewertet`);
        return;
      }
      case 'RESULTS': {
        if (s.phase >= st.meta.phaseCount) fail('Letzte Phase – Kampagne beenden');
        st.phases.push(newPhase(s.phase + 1));
        st.stage = { kind: 'PHASE', phase: s.phase + 1, step: 'OPS' };
        return;
      }
      default:
        fail('Unbekannter Schritt');
    }
  },

  scorePhase(ctx) {
    const n = curPhaseNumber(ctx, 'RESULTS');
    const st = ctx.state;
    const ds = demoState(st);
    st.pointsHistory = st.pointsHistory.filter((p) => p.phaseNumber !== n);
    st.pointsHistory.push({ phaseNumber: n, points: { ...ds.points }, powerSum: {} });
    st.phases.find((p) => p.number === n)!.flags.scored = true;
    log(ctx, `Punkte Phase ${n}: ${st.alliances.map((a) => `${a.name} ${ds.points[a.id] ?? 0}`).join(', ')}`);
  },

  endCampaign(ctx) {
    const n = curPhaseNumber(ctx, 'RESULTS');
    const st = ctx.state;
    if (n < st.meta.phaseCount) fail(`Die Kampagne hat ${st.meta.phaseCount} Phasen`);
    if (!st.phases.find((p) => p.number === n)!.flags.scored) fail('Erst Punkte berechnen');
    const pts = demoState(st).points;
    const max = Math.max(...Object.values(pts));
    const tied = Object.keys(pts).filter((a) => pts[a] === max);
    st.result = { winnerAllianceId: tied.length === 1 ? tied[0] : null, tiebreak: 'NONE', tied: tied.length > 1 ? tied : [] };
    st.stage = { kind: 'ENDED' };
    log(ctx, 'Demo-Kampagne beendet');
  },

  action(ctx, action, data) {
    if (action !== 'RESULT') fail(`Unbekannte Aktion ${action}`);
    curPhaseNumber(ctx, 'BATTLES');
    const a = demoState(ctx.state).attacks.find((x) => x.id === data.attackId);
    if (!a) fail('Angriff nicht gefunden');
    if (data.winner !== 'ATTACKER' && data.winner !== 'DEFENDER') fail('Sieger wählen');
    a.winner = data.winner;
    log(ctx, `Ergebnis: ${DEMO_ATTACKS[a.attackType].name} – ${a.winner === 'ATTACKER' ? 'Angreifer' : 'Verteidiger'} siegt`);
  },

  publicView(full) {
    // Allowlist: öffentlicher Modulzustand neu aufgebaut – Angriffe der laufenden Befehlsphase sind verdeckt
    const s = full.stage;
    const d = structuredClone(demoState(structuredClone(full)));
    if (s.kind === 'PHASE' && s.step === 'OPS') d.attacks = d.attacks.filter((a) => a.phase !== s.phase);
    return { setup: structuredClone(full.setup), moduleState: { demo: d } };
  },

};
