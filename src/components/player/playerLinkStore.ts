/**
 * QR-Code auf dem Ergebnisbogen (NTH2 1.3): Der Code trägt nur Kampagne und Schlacht (/meldung/{kampagne}/{schlacht}),
 * nie einen persönlichen Link. Die Spielerseite merkt sich auf dem Gerät des Spielers seinen eigenen Link
 * (localStorage, mit Rückfall ohne Speicher); die Meldeseite springt damit zur Spielerseite mit Schlacht-Anker.
 * Die Spielerseite öffnet das Meldeformular, wenn der Spieler an der Schlacht beteiligt ist.
 */

const KEY = 'vf_player_links';
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,80}$/;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readAll(s: Store | null): Record<string, string> {
  try {
    const raw = s?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Spielerlink dieser Kampagne auf dem Gerät merken */
export function rememberPlayerLink(campaignId: string, token: string, s: Store | null = storage()) {
  if (!ID_RE.test(campaignId) || !TOKEN_RE.test(token)) return;
  try {
    const all = readAll(s);
    if (all[campaignId] === token) return;
    all[campaignId] = token;
    s?.setItem(KEY, JSON.stringify(all));
  } catch {
    // ohne Speicher (privates Fenster, gesperrt): der QR-Code verweist dann auf den eigenen Link
  }
}

export function lookupPlayerLink(campaignId: string, s: Store | null = storage()): string | null {
  const v = readAll(s)[campaignId];
  return typeof v === 'string' && TOKEN_RE.test(v) ? v : null;
}

/** Schlacht-Anker aus ?battle=… oder #battle-… */
export function readBattleAnchor(loc: { search: string; hash: string }): string | null {
  const q = new URLSearchParams(loc.search).get('battle');
  const h = /^#battle-(.+)$/.exec(loc.hash)?.[1] ?? null;
  const id = q ?? h;
  return id && ID_RE.test(id) ? id : null;
}

/** Ziel der Meldeseite: Spielerseite mit Anker, oder null ohne gemerkten Link */
export function reportTarget(campaignId: string, battleId: string, s: Store | null = storage()): string | null {
  if (!ID_RE.test(battleId)) return null;
  const token = lookupPlayerLink(campaignId, s);
  return token ? `/p/${token}?battle=${encodeURIComponent(battleId)}#battle-${encodeURIComponent(battleId)}` : null;
}
