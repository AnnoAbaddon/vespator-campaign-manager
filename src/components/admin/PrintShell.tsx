import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/icons';
import { PrintButton } from '@/components/public/PrintButton';

/**
 * Terminal-Hülle für druckbare Seiten (Druckansicht, Druckbögen, Spielerlinks, Briefing).
 * Bildschirm: links ein Bediengehäuse (Schild, Zurück, Auswahl, Drucken), rechts das Papier in einer
 * vertieften Vorschau, die für sich scrollt – kein Seitenscrollen. Druck: nur das Papier (print CSS
 * in globals.css hebt Höhe, Scrollen und Gehäuse auf).
 */
export function PrintShell({
  title,
  backHref,
  backLabel,
  tools,
  paperClass = 'max-w-[210mm]',
  print = true,
  children,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  /** zusätzliche Bedienelemente (z. B. Bogenauswahl, Papierformat) */
  tools?: React.ReactNode;
  /** Breite des Papiers in der Vorschau */
  paperClass?: string;
  /** Drucken anbieten (aus, wenn es nichts zu drucken gibt, z. B. leere Order of Battle) */
  print?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="print-shell mx-auto flex h-[calc(100dvh-var(--hdr))] max-w-[1920px] flex-col gap-4 px-3 pb-3 pt-5 sm:px-4 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)] lg:px-[var(--gap)] lg:pb-[var(--gap)] lg:pt-[calc(var(--gap)+4px)]">
      <aside className="no-print hud frame relative shrink-0 p-3 lg:min-h-0 lg:pt-4">
        <div className="relative z-[1] flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3">
          <p className="hidden font-display text-[17px] font-bold uppercase leading-tight tracking-[0.04em] text-ink [text-shadow:0_1px_0_#000] lg:block">{title}</p>
          <Link className="btn btn-sm justify-start" href={backHref}>
            <ArrowLeftIcon /> {backLabel}
          </Link>
          {tools}
          {print && (
            <div className="ml-auto lg:ml-0 [&_.btn]:w-full">
              <PrintButton />
            </div>
          )}
        </div>
      </aside>
      <section className="print-stage hud frame flex min-h-0 flex-1 flex-col p-2 pt-6 sm:p-3 sm:pt-6" aria-label={title}>
        <span className="plate plate-head no-print">{title}</span>
        <div className="print-stage inset relative z-[1] min-h-0 flex-1 overflow-auto p-3 sm:p-6" tabIndex={0}>
          <div className={`print-paper mx-auto shadow-[0_10px_30px_rgba(0,0,0,0.7),0_0_0_1px_#665333] ${paperClass}`}>{children}</div>
        </div>
      </section>
    </div>
  );
}

/** Auswahltaste in der Druck-Hülle (Bogenart, Format) */
export function PrintTool({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className="navkey min-h-10 w-auto pr-7 text-[16px] lg:w-full" aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
