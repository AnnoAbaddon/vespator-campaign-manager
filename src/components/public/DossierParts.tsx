import { CloseIcon } from '@/components/icons';

/**
 * Kopf der Planetenakte (Cockpit, Leseansicht, Spielerseite): Name/System, reservierte Siegelfläche und davon
 * klar getrenntes Schließen. Im mobilen Blatt (DossierSheet) übernimmt das Blatt den Kopf.
 * Ohne Hooks: nutzbar in Server- und Client-Komponenten (Handler nur aus Client-Komponenten übergeben).
 */
export function DossierHead({ name, system, onClose, closeLabel, seal = true }: { name: string; system: string; onClose?: () => void; closeLabel: string; seal?: boolean }) {
  return (
    <header className="flex items-start gap-2">
      <div className="min-w-0 flex-1 pt-0.5">
        <h2 className="truncate font-display text-[22px] font-bold uppercase leading-tight tracking-[0.05em] text-ink [text-shadow:0_2px_0_#000]">{name}</h2>
        <p className="truncate font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-brass">{system}</p>
      </div>
      {/* Reinheitssiegel in eigener, reservierter Fläche (dekorativ) */}
      {seal && <span aria-hidden className="pointer-events-none -mt-1 -mb-2 block h-[50px] w-[25px] shrink-0 bg-[url('/ui/seal-ribbon.webp')] bg-contain bg-top bg-no-repeat drop-shadow-[0_3px_3px_rgba(0,0,0,0.7)]" />}
      {onClose && (
        <button type="button" className="btn btn-sm touch-44 ml-1 h-9 w-9 shrink-0 px-0" onClick={onClose} aria-label={closeLabel}>
          <CloseIcon />
        </button>
      )}
    </header>
  );
}
