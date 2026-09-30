import type { Command } from '@/engine/commands';

/**
 * Abhängigkeitsfreie Kopie von `isOverrideCommand` für den Client: Ein Import aus `@/engine/commands` zöge die
 * ganze Engine ins Bundle der Verwaltung. Ein Test (tests/engine/overrideCommand.test.ts) hält beide Listen gleich.
 */
export const CLIENT_OVERRIDE_TYPES: ReadonlySet<string> = new Set<Command['type']>([
  'OVERRIDE_PL',
  'OVERRIDE_SLOT',
  'OVERRIDE_FLEET',
  'OVERRIDE_STRONGHOLD',
  'OVERRIDE_PLANET_DESTROYED',
  'OVERRIDE_MODIFIER_ADD',
  'OVERRIDE_MODIFIER_REMOVE',
  'OVERRIDE_STAGE',
  'OVERRIDE_POINTS',
  'EVENT_DISCARD',
  'MEDAL_OVERRIDE',
  'EVENT_FORCE',
]);

/** Ist der Command selbst ein Override (Begründung Pflicht)? – gleiche Regel wie in der Engine */
export function isOverrideCommand(cmd: Command): boolean {
  if (CLIENT_OVERRIDE_TYPES.has(cmd.type)) return true;
  return cmd.type === 'BATTLE_UNPLAYED' && cmd.resolution !== 'ATTACKER_WINS';
}
