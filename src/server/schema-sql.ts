// Datenbankschema – gemeinsam genutzt von der App (db.ts) und den Seed-Skripten.
export const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS campaign (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      public_token TEXT NOT NULL UNIQUE,
      public_enabled INTEGER NOT NULL DEFAULT 1,
      current_rev INTEGER NOT NULL,
      previous_campaign_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS revision (
      campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      parent_number INTEGER,
      command TEXT NOT NULL,
      state TEXT NOT NULL,
      summary TEXT NOT NULL,
      log TEXT NOT NULL,
      is_override INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      undone INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (campaign_id, number)
    );
    CREATE TABLE IF NOT EXISTS upload (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      kind TEXT NOT NULL,
      file TEXT NOT NULL,
      thumb TEXT,
      mime TEXT NOT NULL,
      width INTEGER, height INTEGER, bytes INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshot (campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE, phase INTEGER NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempt (ip TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS login_attempt_ip ON login_attempt(ip, at);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS player_token (
      token_hash TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_token_player ON player_token(campaign_id, player_id);
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS outbox_status ON outbox(status, id);
    CREATE TABLE IF NOT EXISTS campaign_access (
      admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
      PRIMARY KEY (admin_id, campaign_id)
    );
    CREATE TABLE IF NOT EXISTS invite (
      token_hash TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      campaign_ids TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS map_template (id TEXT PRIMARY KEY, name TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
    -- Protokoll der Verwaltungsaktionen außerhalb der Commands (N5.2); ohne Fremdschlüssel, damit
    -- Einträge das Löschen einer Kampagne überdauern
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      campaign_id TEXT,
      author TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS audit_campaign ON audit(campaign_id, id);
    -- Kampagnen-Vorlagen (NTH2 2.6): Regeln, Karte, Missionen, Größen, Rhythmus und Texte
    CREATE TABLE IF NOT EXISTS campaign_template (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, json TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT);
  `;
