'use client';

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import { ATTACK_TYPES } from '@/engine/data/vespator';
import type { CampaignState, Operation } from '@/engine/types';
import type { MapArrow } from '@/components/map/MapSvg';

export interface MapFocus {
  selected: string | null;
  setSelected: (id: string | null) => void;
  highlight: string[];
  setHighlight: (ids: string[]) => void;
  /** Fokus-Pfeile aus den Panels (Operation in Bearbeitung oder unter dem Zeiger); die übrigen Routen werden abgeschwächt */
  extraArrows: MapArrow[];
  setExtraArrows: Dispatch<SetStateAction<MapArrow[]>>;
  /** Wechsel in ein Kapitel der Verwaltung (z. B. von der 2.3-Liste in den Reiter „Schlachten“) */
  openChapter?: (id: 'battles') => void;
}

export const MapFocusCtx = createContext<MapFocus | null>(null);

/** Panels können Planeten auf der Karte hervorheben oder auswählen */
export function useMapFocus(): MapFocus {
  const c = useContext(MapFocusCtx);
  if (!c) throw new Error('MapFocus fehlt');
  return c;
}

/**
 * Kartenpfeil einer Operation (Schlacht, Void Leap, Kill Teams); null für Operationen ohne Ziel.
 * `draft`: Entwurf aus dem Formular – immer gestrichelt, unabhängig vom Status.
 */
export function opArrow(
  state: CampaignState,
  o: Pick<Operation, 'allianceId' | 'originPlanetId' | 'type' | 'attackType' | 'targetPlanetId' | 'destinationPlanetId' | 'killTeamPlanetId' | 'revealed' | 'status'>,
  draft = false,
): MapArrow | null {
  const al = state.alliances.find((a) => a.id === o.allianceId);
  if (!al || !o.originPlanetId) return null;
  const planned = draft || o.status === 'PLANNED';
  if (o.type === 'BATTLE' && o.targetPlanetId) return { from: o.originPlanetId, to: o.targetPlanetId, color: al.color, label: o.attackType ? ATTACK_TYPES[o.attackType].name : undefined, dashed: draft || !o.revealed };
  if (o.type === 'VOID_LEAP' && o.destinationPlanetId && planned) return { from: o.originPlanetId, to: o.destinationPlanetId, color: al.color, label: 'Void Leap', dashed: true };
  if (o.type === 'KILL_TEAMS' && o.killTeamPlanetId && planned) return { from: o.originPlanetId, to: o.killTeamPlanetId, color: al.color, label: 'Kill Teams', dashed: true };
  return null;
}
