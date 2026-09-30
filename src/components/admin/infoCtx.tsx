'use client';

import { createContext, useContext } from 'react';
import type { CampaignInfo } from './types';

/** Server-Informationen zur Kampagne (Links, Vorlagen) für tiefer liegende Komponenten */
export const CampaignInfoCtx = createContext<CampaignInfo | null>(null);

export function useCampaignInfo(): CampaignInfo {
  const c = useContext(CampaignInfoCtx);
  if (!c) throw new Error('CampaignInfo fehlt');
  return c;
}
