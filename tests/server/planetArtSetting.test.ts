import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Einstellung „Planetenbilder verwenden“: Der frühere Schlüssel `aiArt` wird beim Öffnen der Datenbank nach
 * `planetArt` umgezogen; beim Lesen gilt er weiterhin als Rückfall, beim Schreiben wird er entfernt.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-planetart-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

let db: typeof import('@/server/db');

beforeAll(async () => {
  // bestehende Installation mit altem Schlüssel (Planetenbilder aus) vor dem ersten Öffnen anlegen
  fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
  const old = new DatabaseSync(path.join(process.env.DATA_DIR!, 'app.db'));
  old.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  old.prepare('INSERT INTO settings(key, value) VALUES(?, ?)').run('aiArt', 'off');
  old.close();
  db = await import('@/server/db');
});

describe('Einstellung Planetenbilder', () => {
  it('zieht den alten Schlüssel beim Öffnen auf den neuen um', () => {
    expect(db.PLANET_ART_KEY).toBe('planetArt');
    expect(db.getSetting('planetArt')).toBe('off');
    expect(db.getSetting('aiArt')).toBeNull();
    expect(db.planetArtEnabled()).toBe(false);
  });

  it('liest den alten Schlüssel als Rückfall, wenn der neue fehlt', () => {
    db.db().prepare('DELETE FROM settings WHERE key = ?').run('planetArt');
    expect(db.planetArtEnabled()).toBe(true); // Standard: an
    db.setSetting('aiArt', 'off');
    expect(db.planetArtEnabled()).toBe(false);
    db.setSetting('aiArt', 'on');
    expect(db.planetArtEnabled()).toBe(true);
  });

  it('der neue Schlüssel hat Vorrang und Schreiben entfernt den alten', () => {
    db.setSetting('aiArt', 'on');
    db.setSetting('planetArt', 'off');
    expect(db.planetArtEnabled()).toBe(false);
    db.setPlanetArt(true);
    expect(db.getSetting('planetArt')).toBe('on');
    expect(db.getSetting('aiArt')).toBeNull();
    db.setPlanetArt(false);
    expect(db.planetArtEnabled()).toBe(false);
  });
});
