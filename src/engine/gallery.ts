import { fail, log, type Ctx } from './ctx';
import { planetName } from './map';
import { ATTACK_TYPES } from './data/vespator';
import { allianceOf } from './players';
import type { Battle, CampaignState } from './types';

/**
 * Galerie und „Bild der Phase“ (NTH2 4.3 + D1): alle Schlacht- und Spielfotos einer Kampagne mit Filtern nach
 * Phase, Planet und Allianz. Der Warmaster wählt je Phase ein Bild; optional stimmen die Spieler über ihren
 * Link ab (je Spieler eine Stimme, das meistgewählte Foto gilt, solange der Warmaster keines festlegt).
 * Die Galerie arbeitet auf der jeweiligen Projektion – in der Leseansicht erscheinen nur öffentliche Fotos.
 */

export interface PhasePhoto {
  uploadId: string;
  caption: string;
}

export interface PhotoVote {
  playerId: string;
  uploadId: string;
}

export interface GalleryPhoto {
  uploadId: string;
  phase: number;
  /** Herkunft: Schlacht (mit Einzelspiel) oder Bemal-Chronik */
  source: 'BATTLE' | 'HOBBY';
  battleId: string | null;
  gameIndex: number | null;
  planetId: string | null;
  allianceIds: string[];
  /** kurzer Titel („Seize Ground · Masnet“ bzw. „Hobby: Einheit“) */
  label: string;
  playerIds: string[];
}

const battleLabel = (b: Battle) =>
  b.kind === 'FINAL_TIEBREAK' ? 'Entscheidungsschlacht' : b.kind === 'KILL_TEAM' ? 'Kill Team' : b.kind === 'INTERCEPT' ? 'Abfanggefecht' : b.attackType ? ATTACK_TYPES[b.attackType].name : 'Schlacht';

/** Alle Fotos (Schlachten, Einzelspiele und Bemal-Chronik), neueste Phase zuerst, ohne Duplikate */
export function galleryPhotos(st: CampaignState): GalleryPhoto[] {
  const out: GalleryPhoto[] = [];
  const seen = new Set<string>();
  const push = (p: GalleryPhoto) => {
    if (seen.has(p.uploadId)) return;
    seen.add(p.uploadId);
    out.push(p);
  };
  for (const b of [...st.battles].sort((x, y) => y.phaseNumber - x.phaseNumber || y.createdSeq - x.createdSeq)) {
    if (b.status === 'VOID') continue;
    const base = {
      phase: b.phaseNumber,
      source: 'BATTLE' as const,
      battleId: b.id,
      planetId: b.planetId,
      allianceIds: [b.attackerAllianceId, b.defenderAllianceId],
      label: `${battleLabel(b)}${b.planetId ? ` · ${planetName(b.planetId)}` : ''}`,
    };
    for (const id of b.photos ?? []) push({ ...base, uploadId: id, gameIndex: null, playerIds: [...b.attackers, ...b.defenders].map((p) => p.playerId) });
    (b.games ?? []).forEach((g, i) => {
      for (const id of g.photos ?? []) push({ ...base, uploadId: id, gameIndex: i, playerIds: [...g.attackers, ...g.defenders].map((p) => p.playerId) });
    });
  }
  for (const p of st.players) {
    for (const h of p.hobby ?? []) {
      if (!h.photo) continue;
      const phase = h.phase ?? 0;
      const al = allianceOf(p, phase || 1);
      push({ uploadId: h.photo, phase, source: 'HOBBY', battleId: null, gameIndex: null, planetId: null, allianceIds: al ? [al] : [], label: `Hobby: ${h.unit}`, playerIds: [p.id] });
    }
  }
  return out.sort((a, b) => b.phase - a.phase);
}

export interface GalleryFilter {
  phase?: number | null;
  planetId?: string | null;
  allianceId?: string | null;
}

export function filterPhotos(list: GalleryPhoto[], f: GalleryFilter): GalleryPhoto[] {
  return list.filter((p) => (f.phase == null || p.phase === f.phase) && (!f.planetId || p.planetId === f.planetId) && (!f.allianceId || p.allianceIds.includes(f.allianceId)));
}

/** Stimmen je Foto einer Phase (absteigend; bei Gleichstand die zuerst abgegebene Stimme vorn) */
export function voteTally(st: CampaignState, phase: number): { uploadId: string; votes: number }[] {
  const votes = st.phases.find((p) => p.number === phase)?.photoVotes ?? [];
  const order: string[] = [];
  const n = new Map<string, number>();
  for (const v of votes) {
    if (!n.has(v.uploadId)) order.push(v.uploadId);
    n.set(v.uploadId, (n.get(v.uploadId) ?? 0) + 1);
  }
  return order.map((id) => ({ uploadId: id, votes: n.get(id)! })).sort((a, b) => b.votes - a.votes || order.indexOf(a.uploadId) - order.indexOf(b.uploadId));
}

/**
 * Bild der Phase: die Wahl des Warmasters, sonst (bei aktiver Abstimmung) das meistgewählte Foto.
 * Nur Fotos, die in dieser Projektion vorkommen (die Leseansicht zeigt nie ein verborgenes Foto).
 */
export function photoOfPhase(st: CampaignState, phase: number): (PhasePhoto & { by: 'GM' | 'VOTE'; votes?: number }) | null {
  const known = new Set(galleryPhotos(st).map((p) => p.uploadId));
  const ph = st.phases.find((p) => p.number === phase);
  if (ph?.photo && known.has(ph.photo.uploadId)) return { ...ph.photo, by: 'GM' };
  if (!st.gallery?.vote) return null;
  const top = voteTally(st, phase).find((v) => known.has(v.uploadId));
  return top ? { uploadId: top.uploadId, caption: '', by: 'VOTE', votes: top.votes } : null;
}

/** Zuletzt gekürtes Bild (für Startseite und Präsentation): jüngste Phase mit Bild */
export function latestPhotoOfPhase(st: CampaignState): { phase: number; photo: NonNullable<ReturnType<typeof photoOfPhase>> } | null {
  for (const ph of [...st.phases].sort((a, b) => b.number - a.number)) {
    const p = photoOfPhase(st, ph.number);
    if (p) return { phase: ph.number, photo: p };
  }
  return null;
}

// ─── Commands ─────────────────────────────────────────────────────────────

const phaseOf = (ctx: Ctx, n: number) => {
  const ph = ctx.state.phases.find((p) => p.number === n);
  if (!ph) fail('Phase nicht gefunden');
  return ph;
};

const photoIds = (st: CampaignState) => new Set(galleryPhotos(st).map((p) => p.uploadId));

export function setPhasePhoto(ctx: Ctx, phase: number, uploadId: string | null, caption: string) {
  const ph = phaseOf(ctx, phase);
  if (uploadId === null) {
    ph.photo = null;
    log(ctx, `Bild der Phase ${phase} entfernt`);
    return;
  }
  if (!photoIds(ctx.state).has(uploadId)) fail('Foto nicht gefunden');
  ph.photo = { uploadId, caption: caption.trim().slice(0, 200) };
  log(ctx, `Bild der Phase ${phase} gewählt`);
}

export function setVoteMode(ctx: Ctx, enabled: boolean) {
  ctx.state.gallery = { ...(ctx.state.gallery ?? { vote: false }), vote: enabled };
  log(ctx, enabled ? 'Abstimmung über das Bild der Phase eingeschaltet' : 'Abstimmung über das Bild der Phase ausgeschaltet');
}

export function votePhoto(ctx: Ctx, playerId: string, phase: number, uploadId: string | null) {
  const st = ctx.state;
  if (!st.gallery?.vote) fail('Die Abstimmung über das Bild der Phase ist nicht aktiv');
  const p = st.players.find((x) => x.id === playerId);
  if (!p) fail('Spieler nicht gefunden');
  const ph = phaseOf(ctx, phase);
  if (st.stage.kind === 'PHASE' && phase > st.stage.phase) fail('Diese Phase hat noch nicht begonnen');
  const list = (ph.photoVotes ?? []).filter((v) => v.playerId !== playerId);
  if (uploadId !== null) {
    const photo = galleryPhotos(st).find((x) => x.uploadId === uploadId);
    if (!photo || photo.phase !== phase) fail('Foto gehört nicht zu dieser Phase');
    list.push({ playerId, uploadId });
    log(ctx, `${p.nickname} stimmt für ein Bild der Phase ${phase}`);
  } else log(ctx, `${p.nickname} zieht die Stimme für Phase ${phase} zurück`);
  ph.photoVotes = list;
}
