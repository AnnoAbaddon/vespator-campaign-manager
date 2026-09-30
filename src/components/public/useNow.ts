'use client';

import { useSyncExternalStore } from 'react';

/**
 * Aktuelle Zeit für die Anzeige, ohne Hydrationsfehler: auf dem Server und beim ersten Client-Render null,
 * danach die Zeit des Browsers (alle 30 s aktualisiert).
 */
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const f of subs) f();
    }, 30_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now || (now = Date.now()),
    () => null,
  );
}
