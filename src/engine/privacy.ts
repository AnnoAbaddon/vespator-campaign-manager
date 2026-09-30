import type { CampaignState } from './types';

/**
 * Datenschutz-Werkzeuge (NTH2 6.4), reiner Teil: entfernt Kontaktdaten, private Notizen und Puls-Kommentare aus
 * einem Kampagnenzustand. Der Server wendet das auf alle Revisionen an (sonst stünden die Daten weiter in der
 * Historie) und löscht passende Einträge der Outbox.
 */
export interface ScrubOptions {
  /** betroffene Spieler; 'ALL' = alle (automatische Bereinigung nach Kampagnenende) */
  players: string[] | 'ALL';
  /** E-Mail, Discord-Name, Klarname */
  contact: boolean;
  /** private Notizen: SL-Notiz zum Spieler und Allianz-Notizen des Spielers */
  notes: boolean;
  /** Kommentare im Phasen-Puls */
  pulse: boolean;
}

export interface ScrubResult {
  state: CampaignState;
  /** entfernte Texte (für die Bereinigung der gespeicherten Commands und der Outbox) */
  removed: string[];
  /** entfernte Kontaktadressen (E-Mail, Discord) */
  contacts: string[];
}

export function scrubState(input: CampaignState, o: ScrubOptions): ScrubResult {
  const st = structuredClone(input);
  const hit = (id: string | null | undefined) => o.players === 'ALL' || (!!id && o.players.includes(id));
  const removed = new Set<string>();
  const contacts = new Set<string>();
  const take = (v: string | undefined | null) => {
    if (v && v.trim()) removed.add(v);
    return '';
  };
  for (const p of st.players) {
    if (!hit(p.id)) continue;
    if (o.contact) {
      if (p.email?.trim()) contacts.add(p.email.trim());
      if (p.discord?.trim()) contacts.add(p.discord.trim());
      p.email = take(p.email);
      p.discord = take(p.discord);
      p.realName = take(p.realName);
    }
    if (o.notes) p.notes = take(p.notes);
  }
  if (o.notes && st.allianceNotes) {
    st.allianceNotes = st.allianceNotes.filter((n) => {
      if (o.players === 'ALL' ? true : hit(n.playerId)) {
        take(n.text);
        return false;
      }
      return true;
    });
  }
  if (o.pulse)
    for (const ph of st.phases)
      for (const e of ph.pulse ?? []) {
        if (!hit(e.playerId)) continue;
        e.comment = take(e.comment);
      }
  return { state: st, removed: [...removed], contacts: [...contacts] };
}

/** Ersetzt in beliebigen JSON-Daten (z. B. gespeicherten Commands) Zeichenketten, die genau einem entfernten Wert entsprechen */
export function scrubValues<T>(data: T, removed: string[]): T {
  if (!removed.length) return data;
  const set = new Set(removed);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return set.has(v) ? '' : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(data) as T;
}

/** Alles, was über einen Spieler gespeichert ist (Export auf Wunsch des Spielers) */
export function playerDataExport(st: CampaignState, playerId: string) {
  const p = st.players.find((x) => x.id === playerId);
  if (!p) return null;
  const inBattle = (list: { playerId: string }[]) => list.some((x) => x.playerId === playerId);
  return {
    format: 'vespator-player-data',
    version: 1,
    campaign: st.meta.name,
    player: structuredClone(p),
    battles: st.battles
      .filter((b) => inBattle(b.attackers) || inBattle(b.defenders))
      .map((b) => ({ id: b.id, phase: b.phaseNumber, planetId: b.planetId, side: inBattle(b.attackers) ? 'ATTACKER' : 'DEFENDER', status: b.status, victor: b.victor, vp: b.vp, playedAt: b.playedAt, report: b.report })),
    allianceNotes: (st.allianceNotes ?? []).filter((n) => n.playerId === playerId),
    pulse: st.phases.flatMap((ph) => (ph.pulse ?? []).filter((e) => e.playerId === playerId).map((e) => ({ phase: ph.number, ...e }))),
    fleetsCommanded: st.fleets
      .filter((f) => Object.values(f.commanders).includes(playerId))
      .map((f) => ({
        fleet: f.name,
        phases: Object.entries(f.commanders)
          .filter(([, v]) => v === playerId)
          .map(([k]) => Number(k)),
      })),
    medals: st.medals.filter((m) => m.playerIds.includes(playerId)).map((m) => m.medal),
  };
}
