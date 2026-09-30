/**
 * Build-time flavor of the decorative motifs drawn in code (seal, engraved mottos).
 *
 * The default (unset or any other value) is `imperial`: the code-drawn motifs have a Warhammer-40k look (skull seal,
 * imperial mottos), matching the images under public/. `NEXT_PUBLIC_FLAVOR=neutral` opts into the neutral look
 * (compass seal, neutral mottos).
 * The value is inlined by `next build` / `next dev` (NEXT_PUBLIC_ prefix, direct property access required),
 * so changing it needs a rebuild or a dev-server restart. Game content (factions, decree texts, rule terms)
 * is not affected.
 */
export type Flavor = 'imperial' | 'neutral';

export const FLAVOR: Flavor = process.env.NEXT_PUBLIC_FLAVOR === 'neutral' ? 'neutral' : 'imperial';
export const IMPERIAL = FLAVOR === 'imperial';

/** Engraved mottos on the frame edges (Latin, not translated; empty string = no cartouche) */
export const MOTTO: { map: string; orders: string } = IMPERIAL ? { map: 'Imperium omnia vincit', orders: 'Lex imperialis' } : { map: 'Ordo et Vigilia', orders: 'Lex Belli' };

/** Ribbon texts of the wax seal */
export const SEAL_TEXT: { login: [string, string]; decree: [string, string] } = IMPERIAL
  ? { login: ['FIDES', 'PURGATIO'], decree: ['VOX', 'DECRETUM'] }
  : { login: ['SIGNUM', 'VERITAS'], decree: ['EDICTUM', 'SIGNUM'] };
