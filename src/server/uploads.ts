import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { db, UPLOAD_DIR } from './db';
import { HEIC_BUSY, heicToJpeg } from './heic';

export type UploadKind = 'AVATAR' | 'ALLIANCE_LOGO' | 'BATTLE_PHOTO' | 'LORE_IMAGE' | 'PLANET_PORTRAIT' | 'PLANET_LANDSCAPE';
export const UPLOAD_KINDS: UploadKind[] = ['AVATAR', 'ALLIANCE_LOGO', 'BATTLE_PHOTO', 'LORE_IMAGE', 'PLANET_PORTRAIT', 'PLANET_LANDSCAPE'];
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);
/** Höchstzahl der Pixel eines Eingabebilds (Schutz vor „Dekompressionsbomben“: kleine Datei, riesiges Bild); 50 MP lassen 48-MP-Handyfotos zu */
export const MAX_INPUT_PIXELS = 50_000_000;
/** sharp mit Pixelgrenze – sharp bricht beim Dekodieren größerer Bilder selbst ab */
const img = (buf: Buffer) => sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS });

/** HEIC/HEIF-Container am Dateikopf erkennen (nur relevant, wenn sharp das Bild nicht lesen kann) */
function looksLikeHeif(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(buf.toString('ascii', 8, 12));
}

/** Speicherplatz für Bilder je Kampagne (UPLOAD_QUOTA_MB, Standard 200 MB) */
export function uploadQuotaBytes(): number {
  const mb = Number(process.env.UPLOAD_QUOTA_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 200) * 1024 * 1024;
}
export const QUOTA_ERROR = 'Der Speicherplatz für Bilder dieser Kampagne ist erschöpft';
/** Belegter Speicher der Bilder einer Kampagne in Bytes (ohne Vorschaubilder) */
export function campaignUploadBytes(campaignId: string): number {
  return (db().prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM upload WHERE campaign_id = ?').get(campaignId) as { n: number }).n;
}

/**
 * `owner`: Absender für die Fairness der HEIC-Warteschlange (Spielerlink), ohne Angabe unbegrenzt (Spielleitung).
 * `uploader`: wer hochgeladen hat (`p:<Spieler-ID>` bzw. `a:<Konto-ID>`) – Commands dürfen nur passende Bilder verwenden (F6).
 */
export async function saveUpload(file: File, kind: UploadKind, campaignId: string | null, owner?: string, uploader?: string): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('Datei größer als 10 MB');
  // schon voll: gar nicht erst dekodieren
  if (campaignId && campaignUploadBytes(campaignId) >= uploadQuotaBytes()) throw new Error(QUOTA_ERROR);
  let buf: Buffer = Buffer.from(await file.arrayBuffer());
  // Erst sharp fragen: AVIF (auch mit Marke "mif1") und andere Formate liest sharp selbst.
  // Nur HEVC-kodiertes HEIF (iPhone-Fotos) muss vorher umgewandelt werden.
  let probe: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>> | null = null;
  try {
    probe = await img(buf).metadata();
  } catch {
    probe = null;
  }
  const hevc = probe ? probe.format === 'heif' && probe.compression === 'hevc' : looksLikeHeif(buf);
  if (probe?.width && probe.height && probe.width * probe.height > MAX_INPUT_PIXELS) throw new Error('Bild ist zu groß (höchstens 50 Megapixel)');
  if (hevc) {
    try {
      buf = await heicToJpeg(buf, owner);
    } catch (e) {
      if (e instanceof Error && e.message === HEIC_BUSY) throw e;
      if (e instanceof Error && e.message === 'Bild ist zu groß') throw new Error('Bild ist zu groß (höchstens 50 Megapixel)');
      throw new Error('HEIC-Bild konnte nicht gelesen werden');
    }
  }
  let meta;
  try {
    meta = await img(buf).metadata();
  } catch {
    throw new Error('Keine gültige Bilddatei');
  }
  // auch nach der HEIC-Umwandlung: Pixelzahl prüfen, bevor sharp das Bild dekodiert
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) throw new Error('Bild ist zu groß (höchstens 50 Megapixel)');
  if (!meta.format || !ALLOWED.has(meta.format)) throw new Error(`Bildformat ${meta.format ?? 'unbekannt'} nicht erlaubt (JPEG, PNG, WebP)`);
  if (campaignId !== null && !/^[A-Za-z0-9_-]{6,40}$/.test(campaignId)) throw new Error('Ungültige Kampagnen-ID');
  const id = crypto.randomBytes(12).toString('base64url');
  const dir = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, campaignId ?? 'global');
  fs.mkdirSync(dir, { recursive: true });
  const maxEdge = kind === 'AVATAR' || kind === 'ALLIANCE_LOGO' ? 512 : 2000;
  // rotate() wendet die EXIF-Orientierung an; Metadaten (inkl. GPS) werden nicht übernommen
  // NTH2 4.2: Planetenbilder werden zugeschnitten (Porträt quadratisch, Landschaft als Band) und farblich an das
  // Terminal angeglichen (etwas entsättigt, leicht warm und dunkler)
  const planet = kind === 'PLANET_PORTRAIT' ? { width: 640, height: 640 } : kind === 'PLANET_LANDSCAPE' ? { width: 1600, height: 560 } : null;
  const shaped = planet
    ? img(buf)
        .rotate()
        .resize({ ...planet, fit: 'cover', position: 'attention' })
        .modulate({ saturation: 0.8, brightness: 0.92 })
        .linear([1.02, 0.99, 0.94], [2, 0, -3])
    : img(buf).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
  const main = await shaped.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(main.data).resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  // Kontingent mit der tatsächlichen Größe des gespeicherten Bilds prüfen
  if (campaignId && campaignUploadBytes(campaignId) + main.data.length > uploadQuotaBytes()) throw new Error(QUOTA_ERROR);
  const file1 = path.join(dir, `${id}.webp`);
  const file2 = path.join(dir, `${id}_t.webp`);
  fs.writeFileSync(file1, main.data);
  fs.writeFileSync(file2, thumb);
  db()
    .prepare('INSERT INTO upload(id, campaign_id, kind, file, thumb, mime, width, height, bytes, created_at, uploader) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, campaignId, kind, path.relative(UPLOAD_DIR, file1), path.relative(UPLOAD_DIR, file2), 'image/webp', main.info.width, main.info.height, main.data.length, new Date().toISOString(), uploader ?? null);
  return id;
}

export function readUpload(id: string, thumb: boolean): Buffer | null {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  const row = db().prepare('SELECT file, thumb FROM upload WHERE id = ?').get(id) as { file: string; thumb: string | null } | undefined;
  if (!row) return null;
  const rel = thumb && row.thumb ? row.thumb : row.file;
  const full = path.resolve(UPLOAD_DIR, rel);
  const root = path.resolve(UPLOAD_DIR) + path.sep;
  if (!full.startsWith(root)) return null;
  try {
    return fs.readFileSync(full);
  } catch {
    return null;
  }
}

export function uploadFiles(ids: string[]): { id: string; file: string }[] {
  const out: { id: string; file: string }[] = [];
  for (const id of ids) {
    const row = db().prepare('SELECT file FROM upload WHERE id = ?').get(id) as { file: string } | undefined;
    if (row) out.push({ id, file: path.resolve(UPLOAD_DIR, row.file) });
  }
  return out;
}
