/**
 * Kleine Linien-Symbole für Bedienelemente (N0: keine Emojis/Unicode-Zeichen als Steuerelemente).
 * Alle Symbole sind dekorativ (aria-hidden) – die Beschriftung liefert der Button selbst
 * (sichtbarer Text oder aria-label).
 */

type IconProps = { size?: number; className?: string };

function Svg({ size = 16, className = '', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Rückgängig */
export function UndoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5.5 3.5 2 7l3.5 3.5M2.5 7H10a4 4 0 0 1 0 8H7" />
    </Svg>
  );
}

/** Öffnet in neuem Fenster/Tab */
export function ExternalIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5" strokeWidth="1.5" />
    </Svg>
  );
}

/** Weiter / vorwärts */
export function ArrowRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </Svg>
  );
}

/** Zurück */
export function ArrowLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 8H3M7 4 3 8l4 4" />
    </Svg>
  );
}

/** Nach oben verschieben */
export function ArrowUpIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </Svg>
  );
}

/** Nach unten verschieben */
export function ArrowDownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 3v10M4 9l4 4 4-4" />
    </Svg>
  );
}

/** Entfernen / schließen */
export function CloseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

/** Erledigt / kopiert */
export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </Svg>
  );
}

/** Digitaler Würfelwurf */
export function DiceIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" strokeWidth="1.4" />
      <circle cx="5.5" cy="5.5" r=".9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="10.5" r=".9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Von Hand eingetragen */
export function HandIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 8.5V4a1 1 0 0 1 2 0v3.5M7 7V3a1 1 0 0 1 2 0v4M9 7V3.8a1 1 0 0 1 2 0V8M11 6.5a1 1 0 0 1 2 0V10a4.5 4.5 0 0 1-4.5 4.5h-.7a4 4 0 0 1-3.1-1.5L2.8 10.6a1 1 0 0 1 1.5-1.3L5 10" strokeWidth="1.3" />
    </Svg>
  );
}

/** Angeheftet */
export function PinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5" strokeWidth="1.4" />
    </Svg>
  );
}

/** Drucken */
export function PrintIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z" strokeWidth="1.4" />
    </Svg>
  );
}

/** Warnung / Override */
export function WarnIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2 14.5 13.5h-13z" strokeWidth="1.4" />
      <path d="M8 6.5v3M8 11.6v.1" />
    </Svg>
  );
}

/** Buch (Leseansicht, Lore) */
export function BookIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 4.2C6.6 3 4.4 2.7 2 3v9.6c2.4-.3 4.6 0 6 1.2 1.4-1.2 3.6-1.5 6-1.2V3c-2.4-.3-4.6 0-6 1.2ZM8 4.2v9.6" />
    </Svg>
  );
}

/** Notizblatt (private Notiz) */
export function NoteIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 1.8h5.5L12.5 5v9.2H4ZM9.5 1.8V5h3M6 8h4.5M6 10.5h4.5" />
    </Svg>
  );
}

/** Speichern */
export function SaveIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 2.5h9l2 2v9h-11ZM5 2.5v3.5h5V2.5M4.5 13.5V9h7v4.5" />
    </Svg>
  );
}

/** Aufklappen */
export function ChevronIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6l4 4 4-4" />
    </Svg>
  );
}

/** Blitz (Power Level) */
export function BoltIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 1.5 3.5 9h4L6.5 14.5 12.5 7h-4Z" />
    </Svg>
  );
}

/** Bauwerk (Infrastruktur) */
export function TowerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 14.5V6l3-4 3 4v8.5M3 14.5h10M7 14.5v-3h2v3M7 7.5h2" />
    </Svg>
  );
}

/** Werkzeug (Verwaltung/Override) */
export function WrenchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.2 2.2a3.3 3.3 0 0 0-3.9 4.4L2 10.9 5.1 14l4.3-4.3a3.3 3.3 0 0 0 4.4-3.9l-2 2-2.1-.6-.6-2.1Z" />
    </Svg>
  );
}
