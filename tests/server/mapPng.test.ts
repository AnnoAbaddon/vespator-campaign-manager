import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startedCampaign } from '../engine/helpers';
import { forkMap } from '@/engine/map';

/**
 * Kartenexport (N6): Die Einstellung „Planetenbilder verwenden“ gilt auch für PNG/SVG, und die Porträts werden
 * als Data-URI eingebettet (resvg lädt keine externen Dateien). Abgewandelte Vespator-Planeten bleiben prozedural.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-map-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

let png: typeof import('@/server/mapPng');
let db: typeof import('@/server/db');

beforeAll(async () => {
  db = await import('@/server/db');
  png = await import('@/server/mapPng');
});

describe('Kartenexport', () => {
  it('bettet Porträts als PNG-Data-URI ein, wenn Planetenbilder an sind', async () => {
    db.setPlanetArt(true);
    const svg = await png.mapSvgString(startedCampaign(), { png: true });
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).not.toMatch(/href="\/art\//);
    // eindeutige IDs: keine feste „pl-photo-clip“ mehr
    expect(svg).not.toContain('pl-photo-clip');
    const buf = await png.mapPng(startedCampaign(), { scale: 0.5 });
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
  });

  it('zeichnet ohne Planetenbilder nur die prozeduralen Planeten', async () => {
    db.setPlanetArt(false);
    const svg = await png.mapSvgString(startedCampaign());
    expect(svg).not.toContain('<image');
    db.setPlanetArt(true);
  });

  it('abgewandelte Vespator-Planeten (ID mit Suffix) bleiben prozedural', async () => {
    const s = startedCampaign();
    const { map } = forkMap(s.map!);
    // nur die Karte prüfen: MapSvg zeichnet Planeten aus state.map
    const svg = await png.mapSvgString({ ...s, map, planets: s.planets.map((p, i) => ({ ...p, id: map.planets[i].id })), fleets: [] });
    expect(svg).not.toContain('<image');
  });
});
