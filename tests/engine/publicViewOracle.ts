import type { CampaignState } from '@/engine/types';
import { applyFog, fogActive } from '@/engine/fog';

/**
 * Frühere Fassung der öffentlichen Projektion (Denylist: klonen und bekannte private Felder löschen), nur noch als
 * Orakel für Tests (Architektur-Review S3). Die neue Allowlist-Projektion muss für Vespator-Kampagnen dasselbe liefern
 * – bis auf bewusst zusätzlich verborgene Felder (Crusade-Notizen, Modulzustand, Sandbox-Herkunft).
 */
export function oldPublicView(state: CampaignState, opts: { reveal?: boolean } = {}): CampaignState {
  const s = structuredClone(state);
  for (const p of s.players) {
    p.email = '';
    p.discord = '';
    p.realName = '';
    p.notes = '';
  }
  for (const p of s.planets) p.notes = '';
  for (const ph of s.phases) {
    ph.notes = '';
    ph.operations = ph.operations.map((o) =>
      o.revealed ? o : { id: o.id, fleetId: o.fleetId, allianceId: o.allianceId, slot: o.slot, type: 'NONE', originPlanetId: o.originPlanetId, isDefault: false, revealed: false, status: 'PLANNED', hidden: true },
    );
    if (!ph.flags.movesApplied) ph.moves = {};
  }
  for (const p of s.players) delete p.notify;
  for (const b of s.battles) {
    b.notes = '';
    b.draft = null;
  }
  s.allianceNotes = [];
  if (s.skirmishes) s.skirmishes = s.skirmishes.filter((x) => x.status === 'CONFIRMED');
  for (const m of s.inheritedMedals) m.fromCampaignId = '';
  for (const e of s.events) {
    if (e.status === 'PENDING') e.data = {};
    delete e.inputs;
  }
  s.dice = s.dice.filter((d) => d.public);
  delete s.customEvents;
  s.dispatches = s.dispatches.filter((d) => d.public);
  // Vespator-Modul (alte Fassung des Hooks)
  const su = s.setup;
  if (!su.strongholdsRevealed) for (const k of Object.keys(su.strongholds)) su.strongholds[k] = { strongholdPlanetId: null, pl3: [], pl2: [] };
  su.infra = su.infra.filter((i) => i.built);
  su.messages = [];
  if (!su.fleetsRevealed) su.fleetStarts = {};
  // r2PublicView
  const ended = state.stage.kind === 'ENDED' || !!opts.reveal;
  for (const p of s.players) {
    delete p.absences;
    if (!ended) delete p.goals;
    for (const h of p.honors ?? []) if (h.goal && !ended) h.reason = '';
  }
  for (const ph of s.phases) delete ph.pulse;
  delete s.goalList;
  if (s.objectives) s.objectives = s.objectives.filter((o) => !o.secret || o.status !== 'OPEN');
  if (fogActive(state, opts.reveal)) applyFog(s, state);
  // p2PublicView
  delete s.decreeBlocks;
  for (const ph of s.phases) if (ph.photoVotes) ph.photoVotes = ph.photoVotes.map((v) => ({ playerId: '', uploadId: v.uploadId }));
  return s;
}
