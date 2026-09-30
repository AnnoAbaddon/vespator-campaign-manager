import 'server-only';
import crypto from 'node:crypto';

/**
 * Web-Push ohne Fremdpaket (NTH2 1.1): VAPID (RFC 8292, JWT mit ES256) und Nachrichtenverschlüsselung
 * „aes128gcm“ (RFC 8188 / RFC 8291) mit node:crypto.
 */

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');

export interface VapidKeys {
  /** unkomprimierter P-256-Punkt (65 Byte), base64url – geht als applicationServerKey an den Browser */
  publicKey: string;
  /** privater Skalar (32 Byte), base64url */
  privateKey: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function generateVapidKeys(): VapidKeys {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/** Privater Schlüssel als KeyObject (JWK aus Skalar und Punkt) */
function privateKeyObject(keys: VapidKeys): crypto.KeyObject {
  const pub = unb64u(keys.publicKey);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}

/** Öffentlicher Schlüssel (65-Byte-Punkt) als KeyObject – für Tests und Prüfungen */
export function publicKeyObject(raw: Buffer): crypto.KeyObject {
  return crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) }, format: 'jwk' });
}

/** VAPID-JWT für den Push-Dienst des Endpunkts (aud = Origin des Endpunkts, höchstens 24 h gültig) */
export function vapidJwt(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const input = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: privateKeyObject(keys), dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64u(sig)}`;
}

const hmac = (key: Buffer, data: Buffer) => crypto.createHmac('sha256', key).update(data).digest();

/** Eingaben für reproduzierbare Tests (RFC-8291-Beispiel); im Betrieb zufällig */
export interface EncryptOptions {
  salt?: Buffer;
  /** privater Schlüssel des Absenders (32 Byte) */
  senderPrivate?: Buffer;
  recordSize?: number;
}

/** Verschlüsselt eine Nachricht für ein Abonnement (ein Datensatz, Inhaltskodierung aes128gcm) */
export function encryptPayload(sub: PushSubscriptionData, payload: Buffer, opts: EncryptOptions = {}): Buffer {
  const uaPublic = unb64u(sub.keys.p256dh);
  const auth = unb64u(sub.keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('Ungültiges Push-Abonnement');
  if (auth.length < 16) throw new Error('Ungültiges Push-Abonnement');
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.senderPrivate) ecdh.setPrivateKey(opts.senderPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ?? crypto.randomBytes(16);
  const rs = opts.recordSize ?? 4096;
  // RFC 8291: IKM aus ECDH-Geheimnis und Auth-Secret
  const prkKey = hmac(auth, secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  // RFC 8188: Inhaltsschlüssel und Nonce
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  // letzter (einziger) Datensatz: Trennbyte 0x02
  const plain = Buffer.concat([payload, Buffer.from([2])]);
  if (plain.length + 16 > rs) throw new Error('Nachricht zu groß für Web-Push');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/**
 * Gegenstück des Browsers (nur für Tests und die Selbstprüfung): entschlüsselt eine aes128gcm-Nachricht
 * mit dem privaten Schlüssel und dem Auth-Secret des Abonnements.
 */
export function decryptPayload(body: Buffer, uaPrivate: Buffer, auth: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPublic);
  const prkKey = hmac(auth, secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  // Auffüllung (Nullbytes) und Trennbyte entfernen
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('Ungültiges Trennbyte');
  return plain.subarray(0, end);
}

export type PushOutcome = { kind: 'SENT' } | { kind: 'GONE'; status: number } | { kind: 'RETRY'; afterSeconds: number } | { kind: 'ERROR'; status: number };

/** Endpunkte nur über HTTPS zu den bekannten Push-Diensten (der Server ruft sie selbst auf) */
export function validEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  // Nur bekannte Push-Dienste der Browser – der Server ruft den Endpunkt selbst auf (kein Weg in fremde Netze)
  return isPushServiceHost(u.hostname);
}

/** Push-Dienste der Browser: Google (Chrome, Edge-Chromium, Android), Mozilla, Microsoft (WNS), Apple */
const PUSH_HOSTS = ['fcm.googleapis.com', 'web.push.apple.com'];
const PUSH_HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com'];

export function isPushServiceHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  return PUSH_HOSTS.includes(h) || PUSH_HOST_SUFFIXES.some((s) => h.endsWith(s) && h.length > s.length);
}

/** Zeitlimit für die Zustellung an den Push-Dienst */
export const PUSH_TIMEOUT_MS = 10_000;

/** Schickt eine verschlüsselte Nachricht an den Push-Dienst; 404/410 heißt „Abonnement erloschen“ */
export async function sendWebPush(
  sub: PushSubscriptionData,
  payload: string,
  keys: VapidKeys,
  subject: string,
  opts: { ttl?: number; urgency?: 'low' | 'normal' | 'high'; fetchImpl?: typeof fetch } = {},
): Promise<PushOutcome> {
  if (!validEndpoint(sub.endpoint)) return { kind: 'GONE', status: 400 };
  const body = encryptPayload(sub, Buffer.from(payload, 'utf8'));
  const res = await (opts.fetchImpl ?? fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${vapidJwt(sub.endpoint, keys, subject)}, k=${keys.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 86400),
      Urgency: opts.urgency ?? 'normal',
    },
    body: new Uint8Array(body),
    redirect: 'error',
    signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
  });
  if (res.status >= 200 && res.status < 300) return { kind: 'SENT' };
  if (res.status === 404 || res.status === 410) return { kind: 'GONE', status: res.status };
  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after'));
    return { kind: 'RETRY', afterSeconds: Number.isFinite(after) && after > 0 ? after : 60 };
  }
  return { kind: 'ERROR', status: res.status };
}
