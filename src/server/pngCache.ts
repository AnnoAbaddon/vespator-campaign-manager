/**
 * Kleiner LRU-Zwischenspeicher für gerenderte Bilder (Karten-PNG der Leseansicht): Schlüssel = Kampagne und Revision,
 * damit eine neue Revision automatisch ein neues Bild erzeugt. Gleichzeitige Anfragen teilen sich ein Rendern.
 */
export class LruCache<V> {
  private map = new Map<string, Promise<V>>();
  constructor(private max: number) {}

  get size() {
    return this.map.size;
  }

  get(key: string, make: () => Promise<V>): Promise<V> {
    const hit = this.map.get(key);
    if (hit) {
      // zuletzt benutzt ans Ende
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const p = make();
    this.map.set(key, p);
    // Fehlschläge nicht zwischenspeichern
    p.catch(() => {
      if (this.map.get(key) === p) this.map.delete(key);
    });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
    return p;
  }
}

const g = globalThis as unknown as { __vfPngCache?: LruCache<Buffer> };
/** gemeinsamer Speicher für Karten-PNGs (höchstens 16 Bilder) */
export const pngCache: LruCache<Buffer> = (g.__vfPngCache ??= new LruCache<Buffer>(16));
