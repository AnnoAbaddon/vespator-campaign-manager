'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const noop = () => () => {};

/** Rendert Inhalte in den Statusbereich der Kopfzeile (#hdr-status aus ImperialHeader) */
export function HeaderPortal({ children }: { children: React.ReactNode }) {
  const el = useSyncExternalStore(
    noop,
    () => document.getElementById('hdr-status'),
    () => null,
  );
  return el ? createPortal(children, el) : null;
}
