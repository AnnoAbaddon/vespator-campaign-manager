import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { decryptPayload, encryptPayload, generateVapidKeys, publicKeyObject, sendWebPush, validEndpoint, vapidJwt } from '@/server/webpush';

/** Web-Push (NTH2 1.1): Verschlüsselung nach RFC 8291, VAPID-JWT und Versand an einen Mock-Endpunkt */
const b = (s: string) => Buffer.from(s, 'base64url');

function browserSubscription() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { priv: ecdh.getPrivateKey(), auth, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}

describe('Web-Push-Verschlüsselung', () => {
  it('entspricht dem Beispiel aus RFC 8291 (Anhang A)', () => {
    const sub = {
      endpoint: 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV',
      keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    };
    const out = encryptPayload(sub, Buffer.from('When I grow up, I want to be a watermelon'), {
      salt: b('DGv6ra1nlYgDCS1FRnbzlw'),
      senderPrivate: b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
    });
    expect(out.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
    expect(decryptPayload(out, b('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'), b('BTBZMqHH6r4Tts7J_aSIgg')).toString()).toBe('When I grow up, I want to be a watermelon');
  });

  it('Hin und zurück mit zufälligen Schlüsseln (Umlaute, JSON)', () => {
    const { priv, auth, sub } = browserSubscription();
    const msg = JSON.stringify({ title: 'Ergebnis bestätigen', body: 'Grüße vom Warmaster', url: '/p/x' });
    const enc = encryptPayload(sub, Buffer.from(msg));
    expect(decryptPayload(enc, priv, auth).toString()).toBe(msg);
    // zweimal verschlüsselt → verschiedene Chiffrate (frisches Salz, frischer Absenderschlüssel)
    expect(encryptPayload(sub, Buffer.from(msg)).equals(enc)).toBe(false);
  });

  it('lehnt kaputte Abonnements ab', () => {
    expect(() => encryptPayload({ endpoint: 'https://x.example', keys: { p256dh: 'AAAA', auth: 'AAAAAAAAAAAAAAAAAAAAAA' } }, Buffer.from('x'))).toThrow(/Push-Abonnement/);
  });
});

describe('VAPID', () => {
  it('JWT mit ES256 ist mit dem öffentlichen Schlüssel prüfbar', () => {
    const keys = generateVapidKeys();
    expect(b(keys.publicKey)).toHaveLength(65);
    const jwt = vapidJwt('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:sl@example.org', Date.UTC(2026, 8, 30));
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(b(h).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(b(c).toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:sl@example.org');
    expect(claims.exp - Date.UTC(2026, 8, 30) / 1000).toBe(12 * 3600);
    const ok = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKeyObject(b(keys.publicKey)), dsaEncoding: 'ieee-p1363' }, b(s));
    expect(ok).toBe(true);
  });
});

describe('Versand an einen Mock-Endpunkt', () => {
  const keys = generateVapidKeys();
  const mock = (status: number, headers: Record<string, string> = {}) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status, headers });
    }) as unknown as typeof fetch;
    return { f, calls };
  };

  it('schickt verschlüsselt mit VAPID-Kopf; der Mock kann entschlüsseln', async () => {
    const { priv, auth, sub } = browserSubscription();
    const { f, calls } = mock(201);
    const r = await sendWebPush(sub, '{"title":"Test"}', keys, 'mailto:sl@example.org', { fetchImpl: f });
    expect(r).toEqual({ kind: 'SENT' });
    const h = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe(sub.endpoint);
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
    expect(decryptPayload(Buffer.from(calls[0].init.body as Uint8Array), priv, auth).toString()).toBe('{"title":"Test"}');
  });

  it('404/410 → erloschen, 429 → später erneut, 500 → Fehler', async () => {
    const { sub } = browserSubscription();
    expect(await sendWebPush(sub, 'x', keys, 'mailto:a@b.c', { fetchImpl: mock(410).f })).toEqual({ kind: 'GONE', status: 410 });
    expect(await sendWebPush(sub, 'x', keys, 'mailto:a@b.c', { fetchImpl: mock(404).f })).toEqual({ kind: 'GONE', status: 404 });
    expect(await sendWebPush(sub, 'x', keys, 'mailto:a@b.c', { fetchImpl: mock(429, { 'Retry-After': '30' }).f })).toEqual({ kind: 'RETRY', afterSeconds: 30 });
    expect(await sendWebPush(sub, 'x', keys, 'mailto:a@b.c', { fetchImpl: mock(500).f })).toEqual({ kind: 'ERROR', status: 500 });
  });

  it('nur HTTPS-Endpunkte öffentlicher Hosts', () => {
    expect(validEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(validEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(validEndpoint('https://localhost/x')).toBe(false);
    expect(validEndpoint('https://127.0.0.1/x')).toBe(false);
    expect(validEndpoint('https://[::1]/x')).toBe(false);
    expect(validEndpoint('https://intranet/x')).toBe(false);
    expect(validEndpoint(42)).toBe(false);
  });
});
