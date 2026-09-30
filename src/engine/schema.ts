import { z } from 'zod';
import { validateMap, type MapDef } from './map';
import { DEFAULT_MODULE_ID, getModule, hasModule } from './modules/registry';

/**
 * Strukturprüfung für importierte Zustände (SPEC 4.2/18.2). Prüft die Felder, auf die
 * Engine und UI sich verlassen; unbekannte Zusatzfelder bleiben erlaubt.
 */
const id = z.string().min(1);
const participant = z.looseObject({ playerId: z.string() });
const phaseStep = z.enum(['OPS', 'REVEAL', 'EDIFICES', 'BATTLES', 'PROCESS', 'ARRIVAL', 'RESISTANCE', 'RESULTS', 'MOVE', 'BUILD']);

export const campaignStateSchema = z.looseObject({
  schemaVersion: z.number().int().min(1),
  map: z
    .looseObject({
      name: z.string(),
      planets: z.array(z.looseObject({ id, name: z.string(), slots: z.number().int(), theatres: z.array(z.string()), x: z.number(), y: z.number() })),
      connections: z.array(z.tuple([z.string(), z.string()])),
    })
    .optional(),
  meta: z.looseObject({
    name: z.string().min(1),
    intro: z.string(),
    phaseCount: z.number().int().min(1).max(50),
    allianceCount: z.union([z.literal(2), z.literal(3)]),
  }),
  toggles: z.looseObject({
    events: z.looseObject({ fortunesOfWar: z.boolean(), perilsOfPower: z.boolean(), desperateMeasures: z.boolean(), disabled: z.array(z.string()) }),
    theatreTwists: z.boolean(),
    medals: z.boolean(),
    operations: z.looseObject({ attackTypes: z.record(z.string(), z.boolean()) }),
    setupInfraCount: z.number().int(),
  }),
  alliances: z.array(z.looseObject({ id, name: z.string(), color: z.string(), strongholdDestroyed: z.boolean(), order: z.number() })).max(3),
  players: z.array(z.looseObject({ id, nickname: z.string(), memberships: z.array(z.looseObject({ allianceId: id, fromPhase: z.number(), toPhase: z.number().nullable() })) })),
  fleets: z.array(z.looseObject({ id, allianceId: id, name: z.string(), planetId: z.string().nullable(), commanders: z.record(z.string(), z.string()) })),
  planets: z
    .array(
      z.looseObject({
        id,
        power: z.record(z.string(), z.number().int().min(0).max(5)),
        destroyed: z.boolean(),
        slots: z.array(z.looseObject({ destroyed: z.boolean(), infra: z.looseObject({ type: z.string(), allianceId: id }).nullable() })),
      }),
    ),
  phases: z.array(z.looseObject({ number: z.number().int(), operations: z.array(z.looseObject({ id, fleetId: id, type: z.string() })) })),
  stage: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('SETUP'), step: z.enum(['W0', 'W1', 'W2', 'W3', 'W4', 'W5']) }),
    z.object({ kind: z.literal('PHASE'), phase: z.number().int().min(1), step: phaseStep }),
    z.object({ kind: z.literal('TIEBREAK') }),
    z.object({ kind: z.literal('ENDED') }),
  ]),
  // Review: alle Felder, die die Engine ungeprüft liest – sonst legt eine unvollständige Schlacht die Kampagne lahm
  battles: z.array(
    z.looseObject({
      id,
      phaseNumber: z.number(),
      kind: z.string(),
      status: z.string(),
      operationIds: z.array(z.string()),
      attackerAllianceId: z.string(),
      defenderAllianceId: z.string(),
      attackers: z.array(participant),
      defenders: z.array(participant),
      createdSeq: z.number(),
      mission: z.looseObject({ source: z.string() }),
      vp: z.looseObject({ attacker: z.number(), defender: z.number() }).nullable(),
      battleReady: z.looseObject({ attacker: z.boolean(), defender: z.boolean() }),
      decisions: z.record(z.string(), z.looseObject({ type: z.string() })),
      report: z.string(),
      photos: z.array(z.string()),
    }),
  ),
  battleSeq: z.number(),
  events: z.array(z.looseObject({ id, code: z.string(), status: z.string() })),
  modifiers: z.array(z.looseObject({ id, kind: z.string(), phaseNumber: z.number() })),
  dice: z.array(z.looseObject({ id, final: z.number() })),
  dispatches: z.array(z.looseObject({ id, title: z.string(), body: z.string() })),
  medals: z.array(z.looseObject({ medal: z.string(), allianceId: z.string() })),
  inheritedMedals: z.array(z.looseObject({ medal: z.string() })),
  setup: z.looseObject({ strongholds: z.record(z.string(), z.unknown()), infra: z.array(z.unknown()), fleetStarts: z.record(z.string(), z.string()) }),
  pointsHistory: z.array(z.looseObject({ phaseNumber: z.number(), points: z.record(z.string(), z.number()) })),
});

export function validateState(raw: unknown): string | null {
  const r = campaignStateSchema.safeParse(raw);
  if (r.success) {
    const s = r.data;
    if (s.stage.kind === 'PHASE' && !s.phases.some((p) => p.number === (s.stage as { phase: number }).phase)) return 'Aktuelle Phase fehlt in phases';
    // NTH2 3.3: Regelmodul muss in dieser App vorhanden sein (fehlend = Vespator)
    const modId = (s.meta as { module?: unknown }).module ?? DEFAULT_MODULE_ID;
    if (typeof modId !== 'string' || !hasModule(modId)) return `meta.module: Unbekanntes Regelmodul „${String(modId)}“`;
    // Planetenzustand muss zur Karte passen (ältere Stände ohne Karte: Standardkarte des Moduls)
    const map = (s.map as MapDef | undefined) ?? getModule(modId).defaultMap();
    const mapErr = validateMap(map);
    if (mapErr.length) return `map: ${mapErr[0]}`;
    const ps = s.planets;
    if (ps.length !== map.planets.length || !map.planets.every((d) => ps.some((p) => p.id === d.id && p.slots.length === d.slots))) return 'planets: Planeten passen nicht zur Karte';
    return null;
  }
  const i = r.error.issues[0];
  return `${i.path.join('.') || '(Wurzel)'}: ${i.message}`;
}
