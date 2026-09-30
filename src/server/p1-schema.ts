// Tabellen des Blocks P1 (Web-Push, Einmal-Links, Discord-Bot); werden in db.ts beim Öffnen angelegt.
export const P1_SCHEMA_SQL = `
    -- Web-Push-Abonnements (NTH2 1.1): je Gerät und Besitzer (Spielerlink oder Spielleiter-Konto)
    CREATE TABLE IF NOT EXISTS push_sub (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      campaign_id TEXT,
      player_id TEXT,
      token_hash TEXT,
      admin_id INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE (owner, endpoint)
    );
    CREATE INDEX IF NOT EXISTS push_sub_player ON push_sub(campaign_id, player_id);
    CREATE INDEX IF NOT EXISTS push_sub_admin ON push_sub(admin_id);
    -- verbrauchte Einmal-Links (NTH2 1.5)
    CREATE TABLE IF NOT EXISTS used_link (key TEXT PRIMARY KEY, used_at TEXT NOT NULL);
    -- Discord-Bot (NTH2 1.2): Einmal-Codes und verknüpfte Discord-Nutzer
    CREATE TABLE IF NOT EXISTS discord_code (
      code_hash TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discord_link (
      discord_user TEXT PRIMARY KEY,
      username TEXT,
      campaign_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS discord_link_player ON discord_link(campaign_id, player_id);
  `;
