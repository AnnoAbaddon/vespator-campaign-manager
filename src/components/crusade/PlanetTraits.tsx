import type { PlanetTrait } from '@/engine/crusade';

/**
 * Planeten-Merkmale (A9) als kompakte Liste: Schlagwort als Chip, Wirkung als Freitext.
 * Ohne Hooks – nutzbar in Server- und Client-Komponenten (Briefing, Planetenakte).
 */
export function PlanetTraitList({ traits, className = '' }: { traits: PlanetTrait[]; className?: string }) {
  if (!traits.length) return null;
  return (
    <ul className={`space-y-1 text-[14px] ${className}`}>
      {traits.map((x) => (
        <li key={x.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="chip font-semibold">{x.keyword}</span>
          {x.effect && <span className="text-dim print:text-black">{x.effect}</span>}
        </li>
      ))}
    </ul>
  );
}
