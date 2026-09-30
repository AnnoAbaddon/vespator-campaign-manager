// Prüft die HEIC-Umwandlung wie in src/server/uploads.ts: node scripts/heic-check.mjs <datei.heic>
import fs from 'node:fs';
import convert from 'heic-convert';
import sharp from 'sharp';
const buf = fs.readFileSync(process.argv[2]);
console.log('Marke:', buf.toString('ascii', 8, 12));
const jpg = Buffer.from(await convert({ buffer: buf, format: 'JPEG', quality: 0.92 }));
const out = await sharp(jpg).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
console.log('WebP:', out.info.width, 'x', out.info.height, out.data.length, 'Bytes');
