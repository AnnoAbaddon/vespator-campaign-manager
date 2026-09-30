'use client';

import { createContext, useContext } from 'react';

/**
 * Einstellung „Planetenbilder verwenden“ (N6) für Client-Komponenten. Die Layouts der Lese- und Spieleransicht
 * setzen den Wert aus der globalen Einstellung; ohne Provider (undefined) entscheidet wie bisher CSS
 * über data-planet-art am <html>-Element.
 */
const PlanetImagesCtx = createContext<boolean | undefined>(undefined);

export function PlanetImagesProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <PlanetImagesCtx.Provider value={value}>{children}</PlanetImagesCtx.Provider>;
}

export function usePlanetImages(): boolean | undefined {
  return useContext(PlanetImagesCtx);
}
