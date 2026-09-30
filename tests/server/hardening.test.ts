import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Sicherheitshärtung (Security-Research-Audit): Setup-Token, gehashte Sitzungen mit absoluter Höchstdauer,
 * Passwortregeln, Origin-Prüfung der POST-Routen, Sicherheits-Kopfzeilen, SMTP-TLS, Fehlertexte, Anmeldeprotokoll,
 * HEIC-Fairness, Datenschutz-Vorlage.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-hard-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

// Cookie-Speicher für startSession/logout (next/headers gibt es außerhalb einer Anfrage nicht)
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 ? jar.delete(n) : jar.set(n, v)),
    delete: (n: string) => jar.delete(n),
  }),
  headers: async () => new Headers(),
}));

type Mods = {
  db: typeof import('@/server/db');
  auth: typeof import('@/server/auth');
  setup: typeof import('@/server/setupToken');
  origin: typeof import('@/server/origin');
  notify: typeof import('@/server/notify');
  errors: typeof import('@/server/errors');
  audit: typeof import('@/server/audit');
  heic: typeof import('@/server/heic');
  maintenance: typeof import('@/server/maintenance');
  legal: typeof import('@/server/legal');
};
let m: Mods;

beforeAll(async () => {
  m = {
    db: await import('@/server/db'),
    auth: await import('@/server/auth'),
    setup: await import('@/server/setupToken'),
    origin: await import('@/server/origin'),
    notify: await import('@/server/notify'),
    errors: await import('@/server/errors'),
    audit: await import('@/server/audit'),
    heic: await import('@/server/heic'),
    maintenance: await import('@/server/maintenance'),
    legal: await import('@/server/legal'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const DAY = 86_400_000;

describe('Setup-Token der Ersteinrichtung', () => {
  it('zufälliger Token beim Start: ins Log, nur als Hash gespeichert, zeitkonstant geprüft', () => {
    const logs: string[] = [];
    const token = m.setup.ensureSetupToken(true, (x) => logs.push(x))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(logs.join('\n')).toContain(`https://kampagne.example/setup-admin?token=${token}`);
    const stored = m.db.getSetting('setupTokenHash')!;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(token);
    expect(m.setup.checkSetupToken(token)).toBe(true);
    expect(m.setup.checkSetupToken(` ${token} `)).toBe(true);
    expect(m.setup.checkSetupToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBe(false);
    expect(m.setup.checkSetupToken('')).toBe(false);
    expect(m.setup.checkSetupToken(null)).toBe(false);
    expect(m.setup.checkSetupToken('x'.repeat(500))).toBe(false);
    // ohne fresh bleibt der vorhandene Token gültig, mit fresh (Neustart) gilt nur der neue
    expect(m.setup.ensureSetupToken(false, () => {})).toBeNull();
    expect(m.setup.checkSetupToken(token)).toBe(true);
    const next = m.setup.ensureSetupToken(true, () => {})!;
    expect(m.setup.checkSetupToken(token)).toBe(false);
    expect(m.setup.checkSetupToken(next)).toBe(true);
  });

  it('SETUP_TOKEN aus der Umgebung geht vor; zu kurze Werte werden ignoriert', () => {
    process.env.SETUP_TOKEN = 'kurz';
    try {
      const logs: string[] = [];
      const t = m.setup.ensureSetupToken(true, (x) => logs.push(x))!;
      expect(logs.some((l) => l.includes('ignoriert'))).toBe(true);
      expect(m.setup.checkSetupToken('kurz')).toBe(false);
      expect(m.setup.checkSetupToken(t)).toBe(true);
      process.env.SETUP_TOKEN = 'env-setup-token-1234567890';
      expect(m.setup.checkSetupToken('env-setup-token-1234567890')).toBe(true);
      expect(m.setup.checkSetupToken(t)).toBe(false);
    } finally {
      delete process.env.SETUP_TOKEN;
    }
  });

  it('mit bestehendem Konto ist kein Token gültig und der gespeicherte wird entfernt', async () => {
    const t = m.setup.ensureSetupToken(true, () => {})!;
    await m.auth.createAdmin('chef', 'ein-sicheres-passwort');
    expect(m.setup.checkSetupToken(t)).toBe(false);
    expect(m.setup.ensureSetupToken(true, () => {})).toBeNull();
    expect(m.db.getSetting('setupTokenHash')).toBeNull();
  });
});

describe('Passwortregeln für neue Passwörter', () => {
  it('10 bis 256 Zeichen, keine verbreiteten Passwörter (ohne Groß-/Kleinschreibung)', () => {
    const v = m.auth.validateNewPassword;
    expect(v('kurz')).toBe('Passwort: mindestens 10 Zeichen');
    expect(v('a'.repeat(257))).toBe('Passwort: höchstens 256 Zeichen');
    expect(v('Qwertyuiop')).toBe('Dieses Passwort ist zu verbreitet – bitte ein anderes wählen');
    expect(v('Passwort123')).toBe('Dieses Passwort ist zu verbreitet – bitte ein anderes wählen');
    expect(v('Warhammer40k')).toBe('Dieses Passwort ist zu verbreitet – bitte ein anderes wählen');
    expect(v('ein-sicheres-passwort')).toBeNull();
    expect(v('x'.repeat(256))).toBeNull();
  });

  it('Ersteinrichtung, Einladung und Passwortwechsel wenden sie an', async () => {
    const admin = (m.db.db().prepare("SELECT id FROM admin WHERE username = 'chef'").get() as { id: number }).id;
    await expect(m.auth.changePassword(admin, 'ein-sicheres-passwort', 'password123')).rejects.toThrow(/verbreitet/);
    const inv = m.auth.createInvite(admin, 'COWARMASTER', []);
    await expect(m.auth.acceptInvite(inv, 'helfer', '1234567890')).rejects.toThrow(/verbreitet/);
    // die Einladung ist dadurch nicht verbraucht
    expect(m.auth.checkInvite(inv)).not.toBeNull();
    expect(m.auth.USERNAME_RE.test('ab')).toBe(false);
    expect(m.auth.USERNAME_RE.test('Warmaster_1')).toBe(true);
    expect(m.auth.USERNAME_RE.test('a b c')).toBe(false);
  });
});

describe('Sitzungen: gehasht, absolute Höchstdauer, Cookie-Präfix', () => {
  const adminId = () => (m.db.db().prepare("SELECT id FROM admin WHERE username = 'chef'").get() as { id: number }).id;

  it('Anmeldung speichert nur den Hash; das Cookie authentifiziert, der Datenbankwert nicht', async () => {
    jar.clear();
    expect(await m.auth.login('chef', 'ein-sicheres-passwort')).toBe(true);
    // in Tests (NODE_ENV=test) ohne Secure → alter Name
    const raw = jar.get('vf_session')!;
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(m.db.db().prepare('SELECT 1 FROM session WHERE id = ?').get(raw)).toBeUndefined();
    const row = m.db.db().prepare('SELECT id, created_at FROM session WHERE id = ?').get(m.auth.sessionKey(raw)) as { id: string; created_at: string };
    expect(row.created_at).toBeTruthy();
    expect(m.auth.sessionAccount(raw)).toMatchObject({ username: 'chef', role: 'ADMIN' });
    expect(m.auth.sessionAccount(row.id)).toBeNull();
  });

  it('eine neue Anmeldung beendet die vorherige Sitzung desselben Browsers; Abmelden löscht die Sitzung', async () => {
    const first = jar.get('vf_session')!;
    expect(await m.auth.login('chef', 'ein-sicheres-passwort')).toBe(true);
    const second = jar.get('vf_session')!;
    expect(second).not.toBe(first);
    expect(m.auth.sessionAccount(first)).toBeNull();
    expect(m.auth.sessionAccount(second)).not.toBeNull();
    await m.auth.logout();
    expect(jar.has('vf_session')).toBe(false);
    expect(m.auth.sessionAccount(second)).toBeNull();
  });

  it('nach 90 Tagen ab Anmeldung ungültig, gleitende Verlängerung nie darüber hinaus', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    const k = m.auth.sessionKey;
    const ins = m.db.db().prepare('INSERT INTO session(id, admin_id, expires_at, created_at) VALUES(?, ?, ?, ?)');
    ins.run(k('uralt'), adminId(), new Date(now + 20 * DAY).toISOString(), new Date(now - 91 * DAY).toISOString());
    ins.run(k('fast'), adminId(), new Date(now + 2 * DAY).toISOString(), new Date(now - 85 * DAY).toISOString());
    ins.run(k('ohne'), adminId(), new Date(now + 20 * DAY).toISOString(), null);
    expect(m.auth.sessionAccount('uralt', now)).toBeNull();
    expect(m.db.db().prepare('SELECT 1 FROM session WHERE id = ?').get(k('uralt'))).toBeUndefined();
    expect(m.auth.sessionAccount('ohne', now)).toBeNull();
    expect(m.auth.sessionAccount('fast', now)).not.toBeNull();
    const exp = (m.db.db().prepare('SELECT expires_at FROM session WHERE id = ?').get(k('fast')) as { expires_at: string }).expires_at;
    expect(exp).toBe(new Date(now - 85 * DAY + 90 * DAY).toISOString());
    expect(m.auth.sessionAccount('fast', now + 5 * DAY)).toBeNull();
  });

  it('Wartung entfernt Sitzungen jenseits der Höchstdauer', () => {
    const k = m.auth.sessionKey;
    const now = Date.now();
    m.db
      .db()
      .prepare('INSERT INTO session(id, admin_id, expires_at, created_at) VALUES(?, ?, ?, ?), (?, ?, ?, ?)')
      .run(k('p-alt'), adminId(), new Date(now + DAY).toISOString(), new Date(now - 100 * DAY).toISOString(), k('p-neu'), adminId(), new Date(now + DAY).toISOString(), new Date(now).toISOString());
    m.maintenance.purgeExpired(now);
    const ids = (m.db.db().prepare('SELECT id FROM session').all() as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(k('p-neu'));
    expect(ids).not.toContain(k('p-alt'));
  });

  it('Cookie-Name: __Host- nur mit Secure', () => {
    expect(m.auth.sessionCookieName(true)).toBe('__Host-vf_session');
    expect(m.auth.sessionCookieName(false)).toBe('vf_session');
  });

  it('Migration: alte Klartext-Sitzungen wurden einmalig verworfen (Meta-Marke gesetzt)', () => {
    expect(m.db.db().prepare("SELECT 1 FROM meta WHERE key = 'sessionHashV1'").get()).toBeTruthy();
  });
});

describe('Origin-Prüfung der POST-Route-Handler', () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it('lässt eigene und Server-zu-Server-Anfragen durch, lehnt fremde ab', () => {
    const ok = m.origin.sameOriginCheck;
    expect(ok(h({ host: 'app.example', origin: 'https://app.example', 'sec-fetch-site': 'same-origin' }), null)).toBe(true);
    expect(ok(h({ host: 'app:3000', 'x-forwarded-host': 'app.example', origin: 'https://app.example' }), null)).toBe(true);
    expect(ok(h({ host: 'app:3000', origin: 'https://kampagne.example' }), 'https://kampagne.example')).toBe(true);
    // Discord u. Ä.: weder Origin noch Sec-Fetch-Site
    expect(ok(h({ host: 'app.example' }), null)).toBe(true);
    expect(ok(h({ host: 'app.example', origin: 'https://evil.example' }), null)).toBe(false);
    expect(ok(h({ host: 'app.example', origin: 'https://sub.app.example' }), null)).toBe(false);
    expect(ok(h({ host: 'app.example', origin: 'null' }), null)).toBe(false);
    expect(ok(h({ host: 'app.example', 'sec-fetch-site': 'same-site' }), null)).toBe(false);
    expect(ok(h({ host: 'app.example', 'sec-fetch-site': 'cross-site', origin: 'https://app.example' }), null)).toBe(false);
  });

  it('Import-Route antwortet 403 vor jeder Anmeldung', async () => {
    const { POST } = await import('@/app/api/import/route');
    const res = await POST(new Request('https://app.example/api/import', { method: 'POST', headers: { host: 'app.example', origin: 'https://evil.example' }, body: 'x' }));
    expect(res.status).toBe(403);
    const d = await import('@/app/api/discord/interactions/route');
    const r2 = await d.POST(new Request('https://app.example/api/discord/interactions', { method: 'POST', headers: { host: 'app.example', 'sec-fetch-site': 'cross-site' }, body: '{}' }));
    expect(r2.status).toBe(403);
  });
});

describe('Sicherheits-Kopfzeilen', () => {
  it('next.config.ts setzt die statischen Kopfzeilen für alle Pfade und noindex für geheime Links', async () => {
    const cfg = (await import('../../next.config')).default;
    const rules = await cfg.headers!();
    const all = rules.find((r) => r.source === '/:path*')!;
    const get = (k: string) => all.headers.find((x) => x.key === k)?.value;
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    // same-origin statt no-referrer: sonst Origin: null bei eigenen POSTs (Server Actions)
    expect(get('Referrer-Policy')).toBe('same-origin');
    expect(get('X-Frame-Options')).toBe('DENY');
    expect(get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    for (const f of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()']) expect(get('Permissions-Policy')).toContain(f);
    for (const p of ['/p', '/v', '/bestaetigen', '/kalender', '/einladung', '/meldung', '/abmelden']) {
      const r = rules.find((x) => x.source === `${p}/:path*`);
      expect(r?.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]);
    }
  });

  it('der Proxy läuft auch für Prefetch-Anfragen (keine missing-Ausnahme)', async () => {
    const { config } = await import('@/proxy');
    expect(JSON.stringify(config.matcher)).not.toContain('missing');
    expect(JSON.stringify(config.matcher)).not.toContain('prefetch');
  });

  it('robots.txt sperrt alle Präfixe geheimer Links', async () => {
    const robots = (await import('@/app/robots')).default();
    const dis = (Array.isArray(robots.rules) ? robots.rules[0] : robots.rules).disallow;
    for (const p of ['/p/', '/v/', '/bestaetigen/', '/abmelden/', '/kalender/', '/einladung/', '/meldung/', '/hall/', '/liga/', '/setup-admin']) expect(dis).toContain(p);
  });
});

describe('SMTP: TLS ist Pflicht', () => {
  const base = { host: 'smtp.example', port: 587, secure: false, user: 'u', pass: 'p', from: 'a@b.c' };
  it('STARTTLS erzwungen auf 587, direktes TLS auf 465, mindestens TLS 1.2', () => {
    expect(m.notify.smtpTransportOptions(base)).toMatchObject({ requireTLS: true, secure: false, tls: { minVersion: 'TLSv1.2' } });
    expect(m.notify.smtpTransportOptions({ ...base, port: 465, secure: true })).toMatchObject({ requireTLS: false, secure: true });
  });
  it('Ausnahme nur ausdrücklich (Einstellung oder SMTP_ALLOW_INSECURE=1)', () => {
    expect(m.notify.smtpTransportOptions({ ...base, insecure: true }).requireTLS).toBe(false);
    process.env.SMTP_ALLOW_INSECURE = '1';
    try {
      expect(m.notify.smtpTransportOptions(base).requireTLS).toBe(false);
    } finally {
      delete process.env.SMTP_ALLOW_INSECURE;
    }
    expect(m.notify.smtpTransportOptions(base).requireTLS).toBe(true);
  });
});

describe('Allgemeine Fehlertexte', () => {
  it('Fachmeldungen unverändert, interne Fehler allgemein und protokolliert', () => {
    const pe = m.errors.publicError;
    expect(pe(new Error('Kampagne nicht gefunden'))).toBe('Kampagne nicht gefunden');
    expect(pe(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(m.errors.INTERNAL_ERROR);
    const sql = Object.assign(new Error('no such table: foo'), { code: 'ERR_SQLITE_ERROR' });
    expect(pe(sql)).toBe(m.errors.INTERNAL_ERROR);
    const fsErr = Object.assign(new Error("ENOENT: no such file or directory, open '/app/data/x'"), { code: 'ENOENT', errno: -2 });
    expect(pe(fsErr)).toBe(m.errors.INTERNAL_ERROR);
    expect(pe('string')).toBe(m.errors.INTERNAL_ERROR);
    const logged = m.db.db().prepare("SELECT message FROM error_log WHERE source = 'action'").all() as { message: string }[];
    expect(logged.some((r) => r.message.includes('no such table'))).toBe(true);
  });
});

describe('Anmeldeprotokoll', () => {
  it('IP gekürzt, Fehlversuche gedrosselt, nie das Passwort', () => {
    expect(m.audit.maskIp('203.0.113.77')).toBe('203.0.113.0/24');
    expect(m.audit.maskIp('::ffff:203.0.113.77')).toBe('203.0.113.0/24');
    expect(m.audit.maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::/48');
    expect(m.audit.maskIp('direct')).toBe('direct');
    const t0 = Date.parse('2026-06-01T00:00:00Z');
    expect(m.audit.auditLogin('failed', 'chef\nFAKE', '198.51.100.9', t0)).toBe(true);
    expect(m.audit.auditLogin('failed', 'chef', '198.51.100.10', t0 + 1000)).toBe(false);
    expect(m.audit.auditLogin('failed', 'chef', '198.51.100.10', t0 + 61_000)).toBe(true);
    expect(m.audit.auditLogin('ok', 'chef', '198.51.100.9', t0)).toBe(true);
    const rows = m.db.db().prepare("SELECT author, action, detail FROM audit WHERE action IN ('Anmeldung fehlgeschlagen', 'Angemeldet') ORDER BY id").all() as { author: string; action: string; detail: string }[];
    expect(rows[0]).toEqual({ author: 'Anmeldung', action: 'Anmeldung fehlgeschlagen', detail: 'chefFAKE · IP 198.51.100.0/24' });
    expect(rows.at(-1)).toMatchObject({ author: 'chef', action: 'Angemeldet' });
    // Wartung löscht Anmeldeereignisse nach 90 Tagen
    m.maintenance.purgeExpired(t0 + 91 * DAY);
    expect(m.db.db().prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'Anmeldung fehlgeschlagen'").get()).toEqual({ n: 0 });
  });
});

describe('HEIC-Warteschlange: Fairness je Spielerlink', () => {
  it('höchstens 2 wartende Umwandlungen je Absender, andere laufen weiter', async () => {
    const gates: (() => void)[] = [];
    const slow = (b: Buffer) => new Promise<Buffer>((res) => gates.push(() => res(b)));
    const a1 = m.heic.heicToJpeg(Buffer.from('1'), 'player:a', slow);
    const a2 = m.heic.heicToJpeg(Buffer.from('2'), 'player:a', slow);
    await expect(m.heic.heicToJpeg(Buffer.from('3'), 'player:a', slow)).rejects.toThrow(m.heic.HEIC_BUSY);
    const b1 = m.heic.heicToJpeg(Buffer.from('4'), 'player:b', slow);
    expect(m.heic.heicPending('player:a')).toBe(2);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 5));
      gates.shift()?.();
    }
    await Promise.all([a1, a2, b1]);
    expect(m.heic.heicPending('player:a')).toBe(0);
    expect(m.heic.heicPending('player:b')).toBe(0);
  });
});

describe('Datenschutz und Impressum', () => {
  it('ohne eigenen Text: neutrale Vorlage in allen Sprachen mit Hinweis an den Betreiber, ohne erfundene Angaben', () => {
    for (const l of ['de', 'en', 'fr', 'es', 'pl'] as const) {
      const t = m.legal.defaultPrivacyText(l, { days: 30 });
      expect(t).not.toContain('{retention}');
      expect(t).toContain('30');
      expect(t).toMatch(/SMTP/);
      expect(t).toMatch(/Discord/);
      expect(t).not.toMatch(/@[a-z]+\.[a-z]/i);
    }
    expect(m.legal.defaultPrivacyText('de', { days: null })).toContain('nicht eingestellt');
    expect(m.legal.defaultPrivacyText('de')).toContain('Verantwortliche');
  });
  it('eigener Text wird gespeichert, leer entfernt ihn wieder', () => {
    expect(m.legal.legalText('imprint')).toBeNull();
    m.legal.setLegalText('imprint', 'Verein X\r\nStraße 1');
    expect(m.legal.legalText('imprint')).toBe('Verein X\nStraße 1');
    m.legal.setLegalText('imprint', '   ');
    expect(m.legal.legalText('imprint')).toBeNull();
    m.legal.setLegalText('privacy', 'x'.repeat(40_000));
    expect(m.legal.legalText('privacy')!.length).toBe(m.legal.MAX_LEGAL_CHARS);
  });
});
