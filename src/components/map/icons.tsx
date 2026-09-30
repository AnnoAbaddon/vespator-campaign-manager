import type { InfraType, TheatreId } from '@/engine/data/vespator';
import { GameIconG } from '@/components/icons/GameIcon';
import { INFRA_ICON, THEATRE_ICON } from '@/components/icons/registry';

/** Theatre-Symbol (game-icons.net, CC BY 3.0) auf Pergament-Plakette – für SVG-Kontexte */
export function TheatreGlyph({ id, r = 14 }: { id: TheatreId; r?: number }) {
  return (
    <g>
      <circle r={r} fill="#e9dcc0" stroke="#16110b" strokeWidth={r * 0.1} />
      <circle r={r * 0.84} fill="none" stroke="#7a5c2c" strokeWidth={r * 0.06} />
      <GameIconG name={THEATRE_ICON[id]} size={r * 1.3} fill="#16110b" />
    </g>
  );
}

/** Infrastruktur-Symbol auf Allianzfarbe – für SVG-Kontexte */
export function InfraGlyph({ type, color, r = 15 }: { type: InfraType; color: string; r?: number }) {
  return (
    <g>
      <circle r={r} fill={color} stroke="#16110b" strokeWidth={r * 0.1} />
      <GameIconG name={INFRA_ICON[type]} size={r * 1.3} fill="#16110b" />
    </g>
  );
}

/** Kurzkürzel (z. B. für Druck und Textlisten) */
export const INFRA_GLYPH: Record<InfraType, string> = {
  STRONGHOLD: 'SH',
  STAGING_GROUNDS: 'SG',
  SUPPORT_FACILITY: 'SF',
  FORTIFICATION_LINE: 'FL',
};

export function InfraBadge({ type, color, size = 22 }: { type: InfraType; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-16 -16 32 32" aria-label={type} className="inline-block align-middle">
      <InfraGlyph type={type} color={color} r={15} />
    </svg>
  );
}

export function TheatreBadge({ id, size = 26 }: { id: TheatreId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-15 -15 30 30" className="inline-block align-middle" aria-hidden>
      <TheatreGlyph id={id} />
    </svg>
  );
}
