import 'server-only';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

/** Größtes erlaubtes HEIC-Bild (Pixel) – iPhone-Fotos haben rund 12–48 MP; größere Bilder sind Speicherbomben */
export const MAX_HEIC_PIXELS = 50_000_000;

// Die HEVC-Dekodierung (heic-decode, WASM) ist rechenintensiv. Sie läuft in einem Worker-Thread mit begrenztem
// Speicher, damit der Server währenddessen weiter antwortet; Aufträge werden nacheinander abgearbeitet.
// Vor dem Dekodieren wird die Bildgröße aus dem Container gelesen und zu große Bilder werden abgelehnt.
const WORKER_CODE = `
const { parentPort, workerData } = require('node:worker_threads');
const decode = require(workerData.decode);
const { JPEG } = require(workerData.formats);
(async () => {
  const images = await decode.all({ buffer: Buffer.from(workerData.input) });
  try {
    const img = images[0];
    if (!img) throw new Error('HEIF image not found');
    if (img.width * img.height > workerData.maxPixels) throw new Error('TOO_LARGE');
    const raw = await img.decode();
    const out = await JPEG({ width: raw.width, height: raw.height, data: raw.data, quality: 0.92 });
    parentPort.postMessage({ ok: true, data: Buffer.from(out) });
  } finally {
    images.dispose && images.dispose();
  }
})().catch((e) => parentPort.postMessage({ ok: false, error: String((e && e.message) || e) }));
`;

let queue: Promise<unknown> = Promise.resolve();

function modulePaths(): { decode: string; formats: string } {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  const convert = req.resolve('heic-convert');
  return { decode: createRequire(convert).resolve('heic-decode'), formats: path.join(path.dirname(convert), 'formats-node.js') };
}

function runWorker(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_CODE, {
      eval: true,
      workerData: { ...modulePaths(), input, maxPixels: MAX_HEIC_PIXELS },
      // Speicher des Workers begrenzen (JS-Heap); die Pixelgrenze deckt den WASM-Speicher ab
      resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64, codeRangeSizeMb: 64, stackSizeMb: 4 },
    });
    const timer = setTimeout(() => {
      void w.terminate();
      reject(new Error('HEIC-Umwandlung hat zu lange gedauert'));
    }, 60_000);
    w.once('message', (m: { ok: boolean; data?: Uint8Array; error?: string }) => {
      clearTimeout(timer);
      void w.terminate();
      if (m.ok && m.data) resolve(Buffer.from(m.data));
      else reject(new Error(m.error === 'TOO_LARGE' ? 'Bild ist zu groß' : (m.error ?? 'HEIC-Umwandlung fehlgeschlagen')));
    });
    w.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    w.once('exit', (code) => {
      clearTimeout(timer);
      // Abbruch wegen Speichergrenze o. Ä. ohne Nachricht
      if (code !== 0) reject(new Error('HEIC-Umwandlung fehlgeschlagen'));
    });
  });
}

/** Höchstzahl gleichzeitig wartender/laufender Umwandlungen je Absender (z. B. Spielerlink) */
export const MAX_HEIC_PER_OWNER = 2;
export const HEIC_BUSY = 'Zu viele Bilder in Umwandlung – bitte warten, bis die vorherigen fertig sind';
const pending = new Map<string, number>();

/** Wie viele Umwandlungen eines Absenders gerade warten oder laufen (für Tests) */
export const heicPending = (owner: string) => pending.get(owner) ?? 0;

/**
 * Wandelt ein HEIC/HEIF-Bild (HEVC) in JPEG um – nacheinander, außerhalb des Haupt-Threads. Fairness: ein Absender
 * (`owner`, z. B. ein Spielerlink) hat höchstens MAX_HEIC_PER_OWNER Aufträge in der Warteschlange, damit ein
 * einzelner Link nicht alle anderen Uploads minutenlang blockiert.
 */
export function heicToJpeg(input: Buffer, owner?: string, run: (b: Buffer) => Promise<Buffer> = runWorker): Promise<Buffer> {
  if (owner) {
    const n = pending.get(owner) ?? 0;
    if (n >= MAX_HEIC_PER_OWNER) return Promise.reject(new Error(HEIC_BUSY));
    pending.set(owner, n + 1);
  }
  const job = queue.then(() => run(input));
  queue = job.catch(() => undefined);
  if (!owner) return job;
  const done = () => {
    const left = (pending.get(owner) ?? 1) - 1;
    if (left > 0) pending.set(owner, left);
    else pending.delete(owner);
  };
  return job.finally(done);
}
