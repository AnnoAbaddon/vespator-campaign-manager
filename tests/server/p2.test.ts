import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ids, run, startedCampaign } from '../engine/helpers';
import { toPublicView } from '@/engine/publicView';
import { lookupPlayerLink, readBattleAnchor, rememberPlayerLink, reportTarget } from '@/components/player/playerLinkStore';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/** Block P2 serverseitig: zugeschnittene Planetenbilder, Bild der Phase im Phasenbericht, QR-Sprung zur Meldung */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-p2-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

type Mods = { uploads: typeof import('@/server/uploads'); report: typeof import('@/server/report') };
let m: Mods;

beforeAll(async () => {
  m = { uploads: await import('@/server/uploads'), report: await import('@/server/report') };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Windows: die Datenbank ist noch geöffnet
  }
});

async function png(w: number, h: number) {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 120, b: 60 } } })
    .png()
    .toBuffer();
  return new File([new Uint8Array(buf)], 'bild.png', { type: 'image/png' });
}

describe('NTH2 4.2 Planetenbilder', () => {
  it('Porträt quadratisch, Landschaft als Band zugeschnitten; beide mit Vorschaubild', async () => {
    const por = await m.uploads.saveUpload(await png(900, 500), 'PLANET_PORTRAIT', 'kampagne01');
    const land = await m.uploads.saveUpload(await png(800, 800), 'PLANET_LANDSCAPE', 'kampagne01');
    const meta = async (id: string, thumb = false) => sharp(m.uploads.readUpload(id, thumb)!).metadata();
    expect([(await meta(por)).width, (await meta(por)).height]).toEqual([640, 640]);
    expect([(await meta(land)).width, (await meta(land)).height]).toEqual([1600, 560]);
    expect((await meta(land, true)).width).toBeLessThanOrEqual(400);
    expect(m.uploads.UPLOAD_KINDS).toEqual(expect.arrayContaining(['PLANET_PORTRAIT', 'PLANET_LANDSCAPE']));
  });
});

describe('NTH2 4.3/7.4 Phasenbericht', () => {
  it('enthält das Bild der Phase und entsteht in jeder Sprache', () => {
    let s = startedCampaign();
    const w = ids(s);
    s = run(s, { type: 'HOBBY_ADD', playerId: w.pa, entry: { date: '2026-01-02', unit: 'Boyz', status: 'DONE', photo: 'hobbyPhoto0001', points: 100 } });
    // Hobbyfotos zählen zu Phase 1 (eingetragen in Phase 1)
    s = run(s, { type: 'PHASE_PHOTO_SET', phase: 1, uploadId: 'hobbyPhoto0001', caption: 'Frisch bemalt' });
    const md = m.report.phaseReport(toPublicView(s), 1, { origin: 'https://k.example' });
    expect(md).toContain('Bild der Phase');
    expect(md).toContain('https://k.example/api/uploads/hobbyPhoto0001');
    expect(m.report.phaseReport(toPublicView(s), 1, { origin: 'https://k.example', locale: 'en' })).toContain('Picture of the phase');
  });
});

describe('NTH2 1.3 QR-Code auf dem Ergebnisbogen', () => {
  const mem = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  const token = 'A'.repeat(43);

  it('Gerät merkt sich den eigenen Link; ohne Link kein Sprung; Anker aus Query oder Hash', () => {
    const s = mem();
    expect(reportTarget('camp1', 'b1', s)).toBeNull();
    rememberPlayerLink('camp1', token, s);
    expect(lookupPlayerLink('camp1', s)).toBe(token);
    expect(lookupPlayerLink('camp2', s)).toBeNull();
    expect(reportTarget('camp1', 'b1', s)).toBe(`/p/${token}?battle=b1#battle-b1`);
    // ungültige Werte werden nicht gespeichert
    rememberPlayerLink('camp1', 'kurz', s);
    expect(lookupPlayerLink('camp1', s)).toBe(token);
    expect(readBattleAnchor({ search: '?battle=b7', hash: '' })).toBe('b7');
    expect(readBattleAnchor({ search: '', hash: '#battle-b8' })).toBe('b8');
    expect(readBattleAnchor({ search: '?battle=<x>', hash: '' })).toBeNull();
    expect(readBattleAnchor({ search: '', hash: '' })).toBeNull();
  });

  it('ohne Speicher (privates Fenster) kein Fehler', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => rememberPlayerLink('camp1', token, broken)).not.toThrow();
    expect(reportTarget('camp1', 'b1', broken)).toBeNull();
  });
});
