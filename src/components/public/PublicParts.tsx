'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ATTACK_TYPES } from '@/engine/data/vespator';
import type { CampaignState } from '@/engine/types';
import type { MapArrow } from '@/components/map/MapSvg';

/** Lädt die Seite alle 60 s neu, solange der Tab sichtbar ist. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Pfeile der öffentlichen Karte: nur aufgedeckte Operationen der angezeigten Phase */
export function usePublicArrows(state: CampaignState): MapArrow[] {
  const phaseNo = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  return useMemo<MapArrow[]>(() => {
    const ph = state.phases.find((p) => p.number === phaseNo);
    if (!ph) return [];
    const out: MapArrow[] = [];
    for (const o of ph.operations) {
      if (!o.revealed || o.hidden || !o.originPlanetId) continue;
      const al = state.alliances.find((a) => a.id === o.allianceId);
      if (!al) continue;
      if (o.type === 'BATTLE' && o.targetPlanetId) out.push({ from: o.originPlanetId, to: o.targetPlanetId, color: al.color, label: ATTACK_TYPES[o.attackType!].name });
      if (o.type === 'VOID_LEAP' && o.destinationPlanetId && o.status === 'PLANNED') out.push({ from: o.originPlanetId, to: o.destinationPlanetId, color: al.color, label: 'Void Leap', dashed: true });
      if (o.type === 'KILL_TEAMS' && o.killTeamPlanetId && o.status === 'PLANNED') out.push({ from: o.originPlanetId, to: o.killTeamPlanetId, color: al.color, label: 'Kill Teams', dashed: true });
    }
    return out;
  }, [state, phaseNo]);
}
