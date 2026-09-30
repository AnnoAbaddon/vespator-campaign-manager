'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CloseIcon } from '@/components/icons';
import { FadeScroll } from '@/components/FadeScroll';
import { GameIcon } from '@/components/icons/GameIcon';
import { useT } from '@/i18n/client';

/**
 * Mobiles „Mehr“-Blatt (Cockpit, Leseansicht) nach dem Vorbild des DossierSheet: beginnt unter der Kopfzeile und
 * endet über der unteren Leiste, fester Kopf mit Titel und Schließen, nur der Inhalt scrollt. Escape und Antippen
 * der abgedunkelten Fläche schließen; beim Öffnen springt der Fokus in das Blatt, beim Schließen zurück zur
 * auslösenden Taste.
 */
export function MoreSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // auslösende Taste beim ersten Rendern merken (vor dem Fokussprung; auch bei doppelt ausgeführten Effekten im Strict Mode)
  const [opener] = useState(() => (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      // Fokus zurück zur „Mehr“-Taste (nicht, wenn die Wahl eine andere Seite geöffnet hat und der Fokus schon dort liegt)
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) opener.focus({ preventScroll: true });
    };
  }, [opener]);
  return (
    <div className="fixed inset-x-0 bottom-[var(--mnav)] top-[var(--hdr)] z-40 lg:hidden">
      <div aria-hidden className="absolute inset-0 bg-[#030505]/70 backdrop-blur-[1.5px]" onClick={onClose} />
      <section role="dialog" aria-modal="false" aria-labelledby={id} className="dossier-sheet absolute inset-x-0 bottom-0 flex max-h-[calc(100%-14px)] flex-col">
        <header className="dossier-sheet-head relative z-[2] flex shrink-0 items-center gap-2.5 py-1 pl-3 pr-1">
          <GameIcon name="ui_COG" size={20} color="#b3975f" />
          <h2 id={id} className="min-w-0 flex-1 truncate font-display text-[17px] font-bold uppercase leading-tight tracking-[0.04em] text-ink">
            {title}
          </h2>
          <button ref={close} type="button" className="btn btn-ghost h-11 w-11 shrink-0 px-0" onClick={onClose} aria-label={t('Schließen')}>
            <CloseIcon size={18} />
          </button>
        </header>
        <FadeScroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" tabIndex={0} role="region" aria-label={title}>
          {children}
        </FadeScroll>
      </section>
    </div>
  );
}
