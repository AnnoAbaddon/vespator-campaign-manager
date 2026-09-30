import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-acc-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

let auth: typeof import('@/server/auth');
let authz: typeof import('@/server/authz');
let campaigns: typeof import('@/server/campaigns');
let db: typeof import('@/server/db');

beforeAll(async () => {
  auth = await import('@/server/auth');
  authz = await import('@/server/authz');
  campaigns = await import('@/server/campaigns');
  db = await import('@/server/db');
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const account = (username: string, role: 'ADMIN' | 'COWARMASTER') => {
  const r = db.db().prepare('INSERT INTO admin(username, password_hash, created_at, role) VALUES(?,?,?,?)').run(username, 'x', new Date().toISOString(), role);
  return { id: Number(r.lastInsertRowid), username, role, locale: 'de' as const };
};

describe('Konten und Rollen (N5.2)', () => {
  it('Admin sieht alles, Co-Warmaster nur freigegebene Kampagnen', () => {
    const admin = account('chef', 'ADMIN');
    const co = account('helfer', 'COWARMASTER');
    const c1 = campaigns.createCampaign({ name: 'Eins', intro: '', phaseCount: 3, allianceCount: 2 });
    const c2 = campaigns.createCampaign({ name: 'Zwei', intro: '', phaseCount: 3, allianceCount: 2 });
    expect(auth.canAccess(admin, c1)).toBe(true);
    expect(auth.canAccess(co, c1)).toBe(false);
    expect(auth.canAccess(null, c1)).toBe(false);
    auth.grantAccess(co.id, c2);
    expect(auth.canAccess(co, c2)).toBe(true);
    expect(authz.campaignScope(co)).toEqual([c2]);
    expect(authz.campaignScope(admin)).toBe('ALL');
    auth.revokeAccess(co.id, c2);
    expect(auth.canAccess(co, c2)).toBe(false);
  });

  it('Einladungen: einmalig, mit Rolle und Kampagnen', () => {
    const admin = db.db().prepare("SELECT id FROM admin WHERE role = 'ADMIN' LIMIT 1").get() as { id: number };
    const c = campaigns.createCampaign({ name: 'Drei', intro: '', phaseCount: 3, allianceCount: 2 });
    const t = auth.createInvite(admin.id, 'COWARMASTER', [c]);
    expect(auth.checkInvite(t)).toEqual({ role: 'COWARMASTER', campaignIds: [c] });
    expect(auth.checkInvite('x'.repeat(43))).toBeNull();
    db.db().prepare('UPDATE invite SET used_at = ?').run(new Date().toISOString());
    expect(auth.checkInvite(t)).toBeNull();
  });

  it('das letzte Admin-Konto bleibt erhalten', () => {
    for (const r of db.db().prepare("SELECT id FROM admin WHERE role = 'ADMIN'").all() as { id: number }[]) {
      try {
        auth.deleteAccount(r.id);
      } catch {}
    }
    const left = db.db().prepare("SELECT COUNT(*) AS n FROM admin WHERE role = 'ADMIN'").get() as { n: number };
    expect(left.n).toBe(1);
  });
});
