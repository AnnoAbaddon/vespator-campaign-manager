import { GAME_ICONS } from './gameIcons';

/** Icon von game-icons.net (CC BY 3.0) als eigenständiges SVG */
export function GameIcon({ name, size = 20, color = 'currentColor', className = '', title }: { name: string; size?: number; color?: string; className?: string; title?: string }) {
  const d = GAME_ICONS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={`inline-block shrink-0 align-middle ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title && <title>{title}</title>}
      <path d={d} fill={color} />
    </svg>
  );
}

/** Icon als Gruppe innerhalb eines größeren SVG (zentriert auf x/y) */
export function GameIconG({ name, x = 0, y = 0, size, fill }: { name: string; x?: number; y?: number; size: number; fill: string }) {
  const d = GAME_ICONS[name];
  if (!d) return null;
  const s = size / 512;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`}>
      <path d={d} fill={fill} />
    </g>
  );
}
