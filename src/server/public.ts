import 'server-only';
import { cache } from 'react';
import { atPhaseEnd, getCampaign, listRevisionChain, loadState, phaseSnapshots } from './campaigns';
import { requireViewer } from './authz';
import { toPublicView } from '@/engine/publicView';
import type { CampaignState } from '@/engine/types';
import { VESPATOR_MAP } from '@/engine/map';
import type { TimelapseData } from '@/components/public/Timelapse';

type PublicData = { state: CampaignState; current: CampaignState; snapshots: { phase: number; revision: number }[]; token: string; viewingPhase: number | null };

/**
 * Lädt die öffentliche Projektion einer Kampagne; optional den Snapshot am Ende einer Phase. Je Anfrage nur einmal
 * (React cache): Layout, Metadaten und Seite teilen sich das Ergebnis – bitte nicht verändern.
 */
export const loadPublic = cache(loadPublicUncached);

function loadPublicUncached(token: string, phase?: number | null): PublicData {
  // Link zuerst prüfen (nur die Kampagnenzeile), dann den Zustand laden
  const row = requireViewer(token);
  const snapshots = phaseSnapshots(row.id);
  const raw = loadState(row.id, row.current_rev);
  const current = toPublicView(raw);
  // C1: Nach Kampagnenende sind auch die Phasenstände ohne Nebel über dem Punktestand
  const reveal = raw.stage.kind === 'ENDED';
  let state = current;
  let viewingPhase: number | null = null;
  if (phase) {
    const snap = snapshots.find((s) => s.phase === phase);
    if (snap) {
      state = toPublicView(atPhaseEnd(loadState(row.id, snap.revision), phase), { reveal });
      viewingPhase = phase;
    }
  }
  return { state, current, snapshots, token, viewingPhase };
}

export interface TimelineFrame {
  /** 0 = Kampagnenstart, n = Ende von Phase n, -1 = aktueller Stand */
  phase: number;
  label: string;
  state: CampaignState;
  /** Zeitpunkt der zugrunde liegenden Revision (ISO) */
  at?: string;
}

/**
 * Zeitleiste der Kampagne (öffentliche Projektion): Start nach dem Setup, Ende jeder Phase und der
 * aktuelle Stand. Grundlage für Codex (N3.1), Zeitraffer (N3.2) und Präsentation (N3.3).
 */
export const loadTimeline = cache(loadTimelineUncached);

function loadTimelineUncached(campaignId: string): TimelineFrame[] {
  const revs = listRevisionChain(campaignId).filter((r) => r.active);
  const frames: TimelineFrame[] = [];
  const row = getCampaign(campaignId);
  // C1: Nach Kampagnenende ist der Nebel über dem Punktestand auch für frühere Stände aufgehoben
  const reveal = !!row && loadState(campaignId, row.current_rev).stage.kind === 'ENDED';
  const start = revs.filter((r) => r.type === 'SETUP_START').sort((a, b) => a.number - b.number)[0];
  const at = (n: number) => revs.find((r) => r.number === n)?.created_at;
  if (start) frames.push({ phase: 0, label: 'Kampagnenstart', state: toPublicView(loadState(campaignId, start.number), { reveal }), at: start.created_at });
  for (const s of phaseSnapshots(campaignId)) frames.push({ phase: s.phase, label: `Ende Phase ${s.phase}`, state: toPublicView(atPhaseEnd(loadState(campaignId, s.revision), s.phase), { reveal }), at: at(s.revision) });
  if (row) {
    const cur = toPublicView(loadState(campaignId, row.current_rev));
    const last = frames.at(-1);
    if (cur.stage.kind === 'PHASE' || !last) frames.push({ phase: -1, label: cur.stage.kind === 'PHASE' ? `Aktuell (Phase ${cur.stage.phase})` : 'Aktuell', state: cur, at: at(row.current_rev) });
  }
  return frames;
}

/** Schlanke Bilder für den Zeitraffer (nur Planeten, Flotten, Punkte) */
export function timelapseData(campaignId: string): TimelapseData {
  const frames = loadTimeline(campaignId);
  const cur = frames.at(-1)?.state;
  const base = cur ? { map: cur.map, alliances: cur.alliances, meta: cur.meta } : ({ map: VESPATOR_MAP, alliances: [], meta: { name: '' } } as unknown as TimelapseData['base']);
  return {
    base,
    frames: frames.map((f) => ({
      label: f.label,
      at: f.at,
      stage: f.state.stage,
      planets: f.state.planets.map((p) => ({ ...p, lore: '', notes: '' })),
      fleets: f.state.fleets.filter((x) => !x.reserve).map((x) => ({ id: x.id, allianceId: x.allianceId, name: x.name, planetId: x.planetId, commanders: {} })),
      points: f.state.pointsHistory.at(-1)?.points ?? null,
    })),
  };
}
