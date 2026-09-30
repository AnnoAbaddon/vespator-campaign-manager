'use client';

import { useEffect, useRef } from 'react';
import { planetDef } from '@/engine/map';
import { CloseIcon } from '@/components/icons';
import { FadeScroll } from '@/components/FadeScroll';
import { GameIcon } from '@/components/icons/GameIcon';
import { useT } from '@/i18n/client';

/**
 * Mobiles Blatt für die Planetenakte (Leseansicht, Spielerseite): feststehender, kompakter Aktenkopf mit Titel,
 * Schließen und Messingkante; nur der Akteninhalt scrollt. Die Karte dahinter wird abgedunkelt und schließt das
 * Blatt beim Antippen. Escape schließt ebenfalls. Die Akte darin wird ohne eigenen Kopf gezeigt (head={false}),
 * damit Titel und Schließen nicht doppelt erscheinen.
 */
export function DossierSheet({ planetId, onClose, children }: { planetId: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  const close = useRef<HTMLButtonElement>(null);
  const def = planetDef(planetId);
  // neueste Schließen-Funktion, ohne den Effekt bei jedem Rendern neu zu starten (sonst springt der Fokus)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [planetId]);
  return (
    <div className="fixed inset-x-0 bottom-[var(--mnav)] top-[var(--hdr)] z-40 lg:hidden">
      {/* abgedunkelte Karte: Antippen schließt (für Tastatur/Screenreader gibt es die Schließen-Taste) */}
      <div aria-hidden className="absolute inset-0 bg-[#030505]/70 backdrop-blur-[1.5px]" onClick={onClose} />
      <section role="dialog" aria-modal="false" aria-label={t('Planetenakte {name}', { name: def?.name ?? planetId })} className="dossier-sheet absolute inset-x-0 bottom-0 flex max-h-[calc(100%-14px)] flex-col">
        <header className="dossier-sheet-head relative z-[2] flex shrink-0 items-center gap-2.5 py-1 pl-3 pr-1">
          <GameIcon name="ui_PLANET" size={20} color="#b3975f" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[17px] font-bold uppercase leading-tight tracking-[0.04em] text-ink">{def?.name ?? planetId}</p>
            {def?.system && <p className="truncate font-display text-[12px] font-semibold uppercase leading-tight tracking-[0.1em] text-brass">{def.system}</p>}
          </div>
          {/* Reinheitssiegel der Akte (dekorativ) – im Blatt Teil des Kopfs statt eines zweiten Aktenkopfs */}
          <span aria-hidden className="pointer-events-none -mb-3 block h-[50px] w-[24px] shrink-0 self-start bg-[url('/ui/seal-ribbon.webp')] bg-contain bg-top bg-no-repeat drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)]" />
          <button ref={close} type="button" className="btn btn-ghost h-11 w-11 shrink-0 px-0" onClick={onClose} aria-label={t('Planetenakte schließen')}>
            <CloseIcon size={18} />
          </button>
        </header>
        <FadeScroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5" tabIndex={0} role="region" aria-label={t('Planetenakte {name}', { name: def?.name ?? planetId })}>
          {children}
        </FadeScroll>
      </section>
    </div>
  );
}
