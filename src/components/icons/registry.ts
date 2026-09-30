import type { AttackType, EventCode, InfraType, MedalId, OpType, TheatreId } from '@/engine/data/vespator';

// Zuordnung Spielbegriffe → Icons (game-icons.net, CC BY 3.0). Keine GW-Grafiken.

export const THEATRE_ICON: Record<TheatreId, string> = {
  SPACEPORT: 'th_SPACEPORT',
  DESOLATE_WASTES: 'th_DESOLATE_WASTES',
  XENOFLORA_JUNGLE: 'th_XENOFLORA_JUNGLE',
  RAD_ZONE: 'th_RAD_ZONE',
  FORGE_COMPLEX: 'th_FORGE_COMPLEX',
  HAB_SPRAWL: 'th_HAB_SPRAWL',
  DELVESITE_FACILITY: 'th_DELVESITE_FACILITY',
  DEAD_LANDS: 'th_DEAD_LANDS',
  TOMB_COMPLEX: 'th_TOMB_COMPLEX',
};

export const INFRA_ICON: Record<InfraType, string> = {
  STRONGHOLD: 'in_STRONGHOLD',
  STAGING_GROUNDS: 'in_STAGING_GROUNDS',
  SUPPORT_FACILITY: 'in_SUPPORT_FACILITY',
  FORTIFICATION_LINE: 'in_FORTIFICATION_LINE',
};

export const OP_ICON: Record<OpType | 'NONE', string> = {
  BATTLE: 'op_BATTLE',
  VOID_LEAP: 'op_VOID_LEAP',
  RAISE_EDIFICES: 'op_RAISE_EDIFICES',
  LOGISTICAL_AUXILIA: 'op_LOGISTICAL_AUXILIA',
  KILL_TEAMS: 'op_KILL_TEAMS',
  NONE: 'ui_SKULL',
};

export const ATTACK_ICON: Record<AttackType, string> = {
  SEIZE_POWER_BASE: 'at_SEIZE_POWER_BASE',
  PURGE_AND_BURN: 'at_PURGE_AND_BURN',
  ORBITAL_INVASION: 'at_ORBITAL_INVASION',
  PLANETARY_BOMBARDMENT: 'at_PLANETARY_BOMBARDMENT',
  SUPPLY_BASE_RAID: 'at_SUPPLY_BASE_RAID',
  BOARDING_ACTION: 'at_BOARDING_ACTION',
};

export const EVENT_ICON: Record<EventCode, string> = {
  FW_11: 'ev_FW_11',
  FW_12: 'ev_FW_12',
  FW_13: 'ev_FW_13',
  FW_21: 'ev_FW_21',
  FW_22: 'ev_FW_22',
  FW_23: 'ev_FW_23',
  FW_31: 'ev_FW_31',
  FW_32: 'ev_FW_32',
  FW_33: 'ev_FW_33',
  PP_1: 'ev_PP_1',
  PP_2: 'ev_PP_2',
  PP_3: 'ev_PP_3',
  DM_1: 'ev_DM_1',
  DM_2: 'ev_DM_2',
  DM_3: 'ev_DM_3',
};

/** Symbol eines Event-Eintrags; eigene Ereignisse (D2) nutzen die Schriftrolle */
export const eventIcon = (code: import('@/engine/types').EventRecordCode): string => (code === 'CUSTOM' ? 'ui_SCROLL' : EVENT_ICON[code]);

export const MEDAL_ICON: Record<MedalId, string> = { LAUREL: 'me_LAUREL', WREATH: 'me_WREATH', STAR: 'me_STAR', DAGGER: 'me_DAGGER' };

/** Wählbare Wappen für Allianzen */
export const ALLIANCE_EMBLEMS: { key: string; label: string }[] = [
  { key: 'em_eagle', label: 'Adler' },
  { key: 'em_hawk', label: 'Falke' },
  { key: 'em_griffin', label: 'Greif' },
  { key: 'em_lion', label: 'Löwe' },
  { key: 'em_wolf', label: 'Wolf' },
  { key: 'em_dragon', label: 'Drache' },
  { key: 'em_hydra', label: 'Hydra' },
  { key: 'em_serpent', label: 'Seeschlange' },
  { key: 'em_scorpion', label: 'Skorpion' },
  { key: 'em_raven', label: 'Rabe' },
  { key: 'em_bull', label: 'Stier' },
  { key: 'em_wings', label: 'Schwingen' },
  { key: 'em_sun', label: 'Sonne' },
  { key: 'em_barbsun', label: 'Dornensonne' },
  { key: 'em_moon', label: 'Finstermond' },
  { key: 'em_crown', label: 'Krone' },
  { key: 'em_scepter', label: 'Zepter' },
  { key: 'em_eye', label: 'Auge' },
  { key: 'em_fist', label: 'Panzerfaust' },
  { key: 'em_trident', label: 'Dreizack' },
  { key: 'em_axes', label: 'Gekreuzte Äxte' },
  { key: 'em_crownskull', label: 'Gekrönter Schädel' },
  { key: 'em_hornskull', label: 'Gehörnter Schädel' },
  { key: 'em_fangskull', label: 'Reißzahn-Schädel' },
  { key: 'em_daemon', label: 'Dämonenschädel' },
];

export const DEFAULT_EMBLEMS = ['em_eagle', 'em_hornskull', 'em_hydra'];

export function allianceEmblem(a: { emblem?: string | null; order: number }): string {
  return a.emblem && ALLIANCE_EMBLEMS.some((e) => e.key === a.emblem) ? a.emblem : DEFAULT_EMBLEMS[a.order % DEFAULT_EMBLEMS.length];
}

/** Armeen (nur Namen) mit generischen Symbolen */
export const FACTIONS: { name: string; icon: string; keys: string[] }[] = [
  { name: 'Space Marines', icon: 'fa_marines', keys: ['space marine', 'astartes', 'ultramarine', 'imperial fist', 'salamander', 'raven guard', 'white scar', 'iron hand'] },
  { name: 'Blood Angels', icon: 'em_wings', keys: ['blood angel'] },
  { name: 'Dark Angels', icon: 'fa_hooded', keys: ['dark angel'] },
  { name: 'Space Wolves', icon: 'em_wolf', keys: ['space wol'] },
  { name: 'Black Templars', icon: 'fa_templar', keys: ['templar'] },
  { name: 'Deathwatch', icon: 'fa_crossbones', keys: ['deathwatch'] },
  { name: 'Grey Knights', icon: 'fa_sword', keys: ['grey knight'] },
  { name: 'Adeptus Custodes', icon: 'fa_centurion', keys: ['custodes'] },
  { name: 'Adepta Sororitas', icon: 'fa_candle', keys: ['sororitas', 'sisters'] },
  { name: 'Astra Militarum', icon: 'fa_tank', keys: ['militarum', 'imperial guard', 'guard'] },
  { name: 'Adeptus Mechanicus', icon: 'ui_COG', keys: ['mechanicus', 'admech'] },
  { name: 'Imperial Knights', icon: 'fa_mech', keys: ['imperial knight'] },
  { name: 'Imperial Agents', icon: 'fa_hooded', keys: ['agents', 'inquisit'] },
  { name: 'Chaos Space Marines', icon: 'fa_hornhelm', keys: ['chaos space', 'csm', 'heretic astartes'] },
  { name: 'Death Guard', icon: 'fa_fly', keys: ['death guard'] },
  { name: 'Thousand Sons', icon: 'fa_warlockeye', keys: ['thousand sons'] },
  { name: 'World Eaters', icon: 'em_axes', keys: ['world eater'] },
  { name: 'Emperor’s Children', icon: 'fa_heart', keys: ['emperor', 'children'] },
  { name: 'Chaos Daemons', icon: 'em_daemon', keys: ['daemon'] },
  { name: 'Chaos Knights', icon: 'fa_blackknight', keys: ['chaos knight'] },
  { name: 'Necrons', icon: 'fa_golem', keys: ['necron'] },
  { name: 'Orks', icon: 'fa_orc', keys: ['ork'] },
  { name: 'Tyranids', icon: 'fa_jaws', keys: ['tyranid', 'nids'] },
  { name: 'Genestealer Cults', icon: 'fa_tentacle', keys: ['genestealer', 'gsc'] },
  { name: 'T’au Empire', icon: 'fa_ufo', keys: ['tau', 't’au'] },
  { name: 'Aeldari', icon: 'fa_elf', keys: ['aeldari', 'eldar', 'craftworld'] },
  { name: 'Drukhari', icon: 'fa_claws', keys: ['drukhari', 'dark eldar'] },
  { name: 'Harlequins', icon: 'fa_mask', keys: ['harlequin'] },
  { name: 'Leagues of Votann', icon: 'fa_dwarf', keys: ['votann', 'squat'] },
];

/** Symbol zu einem frei eingegebenen Armeenamen (Schlüsselwort-Suche, sonst gekreuzte Schwerter) */
export function factionIcon(name: string | null | undefined): string {
  const n = (name ?? '').toLowerCase().replace(/'/g, '’');
  if (!n) return 'op_BATTLE';
  const exact = FACTIONS.find((f) => f.name.toLowerCase() === n);
  if (exact) return exact.icon;
  // längstes passendes Schlüsselwort gewinnt (z. B. "chaos knight" vor "knight")
  let best: { icon: string; len: number } | null = null;
  for (const f of FACTIONS) for (const k of f.keys) if (n.includes(k) && (!best || k.length > best.len)) best = { icon: f.icon, len: k.length };
  return best?.icon ?? 'op_BATTLE';
}
