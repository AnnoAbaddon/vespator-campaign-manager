'use client';

import { useEffect, useRef } from 'react';

/**
 * Vorhandener Scrollbereich mit Fortsetzungshinweis: Solange unten weiterer Inhalt folgt, setzt die Komponente
 * data-more="true"; .fade-scroll lässt die Unterkante dann schmal auslaufen (unabhängig von der Scrollleiste).
 * Legt keinen zusätzlichen Scrollbereich an – sie ersetzt das bisherige div. Scrollt das Element gerade nicht
 * (overflow sichtbar, z. B. auf dem Desktop), bleibt der Hinweis aus.
 */
export function FadeScroll({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const oy = getComputedStyle(el).overflowY;
        const scrolls = oy === 'auto' || oy === 'scroll';
        const more = scrolls && el.scrollTop + el.clientHeight < el.scrollHeight - 4;
        if (el.dataset.more !== String(more)) el.dataset.more = String(more);
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    // Inhalt ändert sich (Registerwechsel, aufgeklappte Abschnitte, nachgeladene Bilder)
    const mo = new MutationObserver(() => {
      for (const c of Array.from(el.children)) ro.observe(c);
      update();
    });
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class', 'hidden'] });
    el.addEventListener('load', update, true);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', update);
      el.removeEventListener('load', update, true);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={`fade-scroll ${className}`} {...rest}>
      {children}
    </div>
  );
}
