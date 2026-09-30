import { fail, log, type Ctx } from './ctx';
import { planet, planetName } from './board';
import { setDecreeBlocks, type DecreeBlock } from './decree';
import { setPhasePhoto, setVoteMode, votePhoto } from './gallery';
import { addHobby, deleteHobby, type HobbyInput } from './hobby';
import type { MapDef } from './map';
import type { CampaignState, PlanetState, Player } from './types';

/**
 * Nice-to-have 2, Block P2 (Inhalte und Atmosphäre): Commands für Dekret-Bausteine (4.1), eigene
 * Planetenbilder (4.2), Galerie und Bild der Phase (4.3/D1) und die Bemal-Chronik (D5).
 * Die zweisprachigen Texte (7.3) hängen als optionale Felder an den bestehenden Text-Commands.
 */
export type P2Command =
  | { type: 'DECREE_BLOCKS_SET'; blocks: DecreeBlock[] }
  | { type: 'PLANET_IMAGE_SET'; planetId: string; portrait?: string | null; landscape?: string | null }
  | { type: 'PHASE_PHOTO_SET'; phase: number; uploadId: string | null; caption?: string }
  | { type: 'PHOTO_VOTE_MODE'; enabled: boolean }
  | { type: 'PHOTO_VOTE'; playerId: string; phase: number; uploadId: string | null }
  | { type: 'HOBBY_ADD'; playerId: string; entry: HobbyInput }
  | { type: 'HOBBY_DELETE'; playerId: string; id: string };

export const P2_TYPES = new Set<P2Command['type']>(['DECREE_BLOCKS_SET', 'PLANET_IMAGE_SET', 'PHASE_PHOTO_SET', 'PHOTO_VOTE_MODE', 'PHOTO_VOTE', 'HOBBY_ADD', 'HOBBY_DELETE']);

const UPLOAD_RE = /^[A-Za-z0-9_-]{8,40}$/;

function imageId(v: string | null | undefined): string | null | undefined {
  if (v === undefined || v === null) return v;
  if (!UPLOAD_RE.test(v)) fail('Ungültige Bild-ID');
  return v;
}

export function setPlanetImage(ctx: Ctx, planetId: string, portrait: string | null | undefined, landscape: string | null | undefined) {
  const p = planet(ctx.state, planetId);
  const por = imageId(portrait);
  const land = imageId(landscape);
  if (por !== undefined) p.portrait = por;
  if (land !== undefined) p.landscape = land;
  log(ctx, `Bilder von ${planetName(planetId)} aktualisiert`);
}

/**
 * Karteneditor (NTH2 4.2): Die Bilder stehen im Entwurf an den Planeten-Stammdaten und wandern mit MAP_SET in den
 * Planetenzustand (die Stammdaten bleiben frei davon – die Registry ist nach Planeten-ID global). Ohne Angabe im
 * Entwurf bleiben die bisherigen Bilder erhalten.
 */
export function carryPlanetImages(map: MapDef, planets: PlanetState[], prevOf: (id: string) => PlanetState | undefined) {
  for (const d of map.planets) {
    const ps = planets.find((p) => p.id === d.id);
    const prev = prevOf(d.id);
    if (ps) {
      const por = d.portrait !== undefined ? d.portrait : prev?.portrait;
      const land = d.landscape !== undefined ? d.landscape : prev?.landscape;
      if (por && UPLOAD_RE.test(por)) ps.portrait = por;
      if (land && UPLOAD_RE.test(land)) ps.landscape = land;
      if (prev?.loreTr) ps.loreTr = prev.loreTr;
    }
    delete d.portrait;
    delete d.landscape;
  }
}

export function dispatchP2(ctx: Ctx, cmd: P2Command) {
  switch (cmd.type) {
    case 'DECREE_BLOCKS_SET':
      return setDecreeBlocks(ctx, cmd.blocks);
    case 'PLANET_IMAGE_SET':
      return setPlanetImage(ctx, cmd.planetId, cmd.portrait, cmd.landscape);
    case 'PHASE_PHOTO_SET':
      return setPhasePhoto(ctx, cmd.phase, cmd.uploadId, cmd.caption ?? '');
    case 'PHOTO_VOTE_MODE':
      return setVoteMode(ctx, !!cmd.enabled);
    case 'PHOTO_VOTE':
      return votePhoto(ctx, cmd.playerId, cmd.phase, cmd.uploadId);
    case 'HOBBY_ADD':
      return addHobby(ctx, cmd.playerId, cmd.entry);
    case 'HOBBY_DELETE':
      return deleteHobby(ctx, cmd.playerId, cmd.id);
    default:
      fail('Unbekannter Befehl');
  }
}

/** Commands aus P2, die ein Spieler über seinen Link auslösen darf (immer nur im eigenen Namen) */
export const P2_PLAYER_COMMANDS = new Set<P2Command['type']>(['PHOTO_VOTE', 'HOBBY_ADD', 'HOBBY_DELETE']);

/** Berechtigung für P2-Commands eines Spielers; null = erlaubt */
export function authorizeP2(_st: CampaignState, player: Player, cmd: P2Command): string | null {
  if (!P2_PLAYER_COMMANDS.has(cmd.type)) return 'Diese Aktion ist dem Spielleiter vorbehalten';
  if ('playerId' in cmd && cmd.playerId === player.id) return null;
  return 'Nur im eigenen Namen';
}

/** Spielersicht (P2): die eigene Stimme bleibt erkennbar (Anzeige „deine Wahl“) */
export function p2PlayerView(s: CampaignState, orig: CampaignState, playerId: string) {
  for (const ph of s.phases) {
    const o = orig.phases.find((x) => x.number === ph.number)?.photoVotes;
    if (o && ph.photoVotes) ph.photoVotes = o.map((v) => ({ playerId: v.playerId === playerId ? playerId : '', uploadId: v.uploadId }));
  }
}
