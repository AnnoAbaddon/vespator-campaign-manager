'use client';

import { useEffect } from 'react';

/**
 * Seitentitel aus dem Client-Zustand (z. B. Kapitel des Cockpits). Die Metadaten von Next setzen den Titel nach dem
 * Laden und nach jedem Auffrischen (router.refresh) zurück – ein Beobachter auf <head> stellt ihn dann wieder her.
 */
export function useDocTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [title]);
}
