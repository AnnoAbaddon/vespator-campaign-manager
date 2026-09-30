import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '@/engine/commands';
import { authorizePlayer } from '@/engine/playerActions';
import { toPlayerView, toPublicView } from '@/engine/publicView';
import { buildDecree, decreeFacts, seededRandom, variantsFor, unknownVars } from '@/engine/decree';
import { DECREE_TEXTS } from '@/engine/decreeTexts';
import { filterPhotos, galleryPhotos, photoOfPhase, voteTally } from '@/engine/gallery';
import { allianceHobby, battleReadyFromHobby, paintedPoints } from '@/engine/hobby';
import { dispatchText, dispatchVersions, introText, pickText, textVersions } from '@/engine/contentLang';
import { referencedUploadIds } from '@/engine/uploads';
import { createCampaignState } from '@/engine/init';
import { VESPATOR_MAP } from '@/engine/map';
import type { CampaignState, PhaseStep } from '@/engine/types';
import { ids, run, startedCampaign, tryRun } from './helpers';

function toStep(s: CampaignState, step: PhaseStep): CampaignState {
  for (let i = 0; i < 20 && !(s.stage.kind === 'PHASE' && s.stage.step === step); i++) s = run(s, { type: 'ADVANCE' });
  return s;
}

const may = (s: CampaignState, playerId: string, cmd: Command) =>
  authorizePlayer(
    s,
    s.players.find((p) => p.id === playerId)!,
    cmd,
  );

const PHOTO = 'photoAAAAbbbb1';
const PHOTO2 = 'photoCCCCdddd2';

/** Phase 1 mit einer gespielten Schlacht (Rot greift Grün auf Caltus Novem an, 20:10), dazu verdeckte Daten */
function playedPhase() {
  let s = startedCampaign();
  const w = ids(s);
  s = run(s, { type: 'OP_SET', fleetId: w.fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: w.c } });
  s = toStep(s, 'BATTLES');
  const b = s.battles[0];
  s = run(s, {
    type: 'BATTLE_UPDATE',
    battleId: b.id,
    update: {
      attackers: [{ playerId: w.pa, faction: 'Orks' }],
      defenders: [{ playerId: w.pc, faction: 'Tau' }],
      vp: { attacker: 20, defender: 10 },
      photos: [PHOTO],
      notes: 'GEHEIM-SCHLACHTNOTIZ',
      playedAt: '2026-01-05T18:00:00Z',
    },
  });
  s = run(s, { type: 'DISPATCH_UPSERT', title: 'GEHEIM-DEPESCHE', body: 'nur für mich', pinned: false, public: false });
  s = run(s, { type: 'PLANET_TEXT', planetId: 'caltus-novem', notes: 'GEHEIM-PLANETNOTIZ' });
  s = run(s, { type: 'PHASE_UPDATE', phase: 1, notes: 'GEHEIM-PHASENNOTIZ' });
  return { s, w, battleId: b.id };
}

describe('NTH2 4.1 Dekret-Baukasten', () => {
  it('Fakten stimmen und kommen nur aus der öffentlichen Projektion', () => {
    const { s, w } = playedPhase();
    // Befehl für die nächste Phase bleibt verdeckt – er darf nie im Entwurf stehen
    const f = decreeFacts(toPublicView(s), 1);
    expect(f.phase).toBe(1);
    expect(f.battles).toHaveLength(1);
    expect(f.battles[0]).toMatchObject({ planet: 'Caltus Novem', winner: 'Rot', loser: 'Grün', vp: [20, 10], winnerPlayers: 'P1', loserPlayers: 'P3', unplayed: false });
    for (const tone of ['PROCLAMATION', 'COMMISSAR', 'CHRONICLER'] as const)
      for (const lang of ['de', 'en'] as const)
        for (let seed = 1; seed < 6; seed++) {
          const d = buildDecree(f, { tone, lang, seed });
          const all = `${d.title}\n${d.body}`;
          expect(all).toContain('Caltus Novem');
          expect(all).toContain('20 : 10');
          expect(all).not.toMatch(/GEHEIM/);
          // keine offenen Platzhalter
          expect(all).not.toMatch(/\{\w+\}/);
        }
    // Gegenprobe: Die ungefilterte Sicht enthielte die Notiz – der Baukasten liest sie aber gar nicht
    expect(JSON.stringify(toPublicView(s))).not.toMatch(/GEHEIM/);
    expect(w.a).toBeTruthy();
  });

  it('gleicher Startwert = gleicher Text, anderer Startwert wählt andere Varianten', () => {
    const { s } = playedPhase();
    const f = decreeFacts(toPublicView(s), 1);
    const a = buildDecree(f, { tone: 'PROCLAMATION', lang: 'de', seed: 42 });
    expect(buildDecree(f, { tone: 'PROCLAMATION', lang: 'de', seed: 42 })).toEqual(a);
    const texts = new Set(Array.from({ length: 20 }, (_, i) => buildDecree(f, { tone: 'PROCLAMATION', lang: 'de', seed: i }).body));
    expect(texts.size).toBeGreaterThan(1);
    const r = seededRandom(7);
    const x = [r(), r(), r()];
    expect(x.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('Phase ohne Schlacht und Nebel über dem Punktestand', () => {
    let s = startedCampaign();
    s = run(s, { type: 'TOGGLES_UPDATE', toggles: { ...s.toggles, fog: true } });
    const f = decreeFacts(toPublicView(s), 1);
    expect(f.battles).toEqual([]);
    expect(f.points).toBeNull();
    expect(f.fog?.length).toBe(3);
    const d = buildDecree(f, { tone: 'COMMISSAR', lang: 'en', seed: 3 });
    expect(DECREE_TEXTS.COMMISSAR.en.QUIET.some((q) => d.body.includes(q))).toBe(true);
    expect(d.body).not.toMatch(/\d+ · /);
  });

  it('eigene Bausteine: gespeichert, geprüft, im Entwurf verwendet, öffentlich unsichtbar', () => {
    const { s: s0 } = playedPhase();
    let s = run(s0, { type: 'DECREE_BLOCKS_SET', blocks: [{ id: '', slot: 'INTRO', tone: 'ANY', lang: 'de', text: 'EIGENE-EINLEITUNG zu Phase {phase}' }] });
    expect(s.decreeBlocks).toHaveLength(1);
    expect(tryRun(s, { type: 'DECREE_BLOCKS_SET', blocks: [{ id: 'x', slot: 'INTRO', tone: 'ANY', lang: 'de', text: '   ' }] }).ok).toBe(false);
    expect(variantsFor('INTRO', { tone: 'CHRONICLER', lang: 'de', blocks: s.decreeBlocks, ownFirst: true })).toEqual(['EIGENE-EINLEITUNG zu Phase {phase}']);
    const d = buildDecree(decreeFacts(toPublicView(s), 1), { tone: 'CHRONICLER', lang: 'de', seed: 1, blocks: s.decreeBlocks, ownFirst: true });
    expect(d.body).toContain('EIGENE-EINLEITUNG zu Phase 1');
    expect(toPublicView(s).decreeBlocks).toBeUndefined();
    expect(unknownVars('INTRO', 'x {phase} {foo}')).toEqual(['foo']);
    // nur der Spielleiter
    s = run(s, { type: 'DECREE_BLOCKS_SET', blocks: [] });
    expect(may(s, s.players[0].id, { type: 'DECREE_BLOCKS_SET', blocks: [] })).not.toBeNull();
  });
});

describe('NTH2 4.3 Galerie und Bild der Phase', () => {
  it('Fotos aus Schlachten und Bemal-Chronik, Filter, Wahl des Warmasters', () => {
    const { s: s0, w } = playedPhase();
    let s = run(s0, { type: 'HOBBY_ADD', playerId: w.pb, entry: { date: '2026-01-03', unit: 'Warriors', status: 'DONE', photo: PHOTO2, points: 200 } });
    const list = galleryPhotos(toPublicView(s));
    expect(list.map((p) => p.uploadId).sort()).toEqual([PHOTO, PHOTO2].sort());
    expect(filterPhotos(list, { planetId: 'caltus-novem' }).map((p) => p.uploadId)).toEqual([PHOTO]);
    expect(filterPhotos(list, { allianceId: w.b }).map((p) => p.uploadId)).toEqual([PHOTO2]);
    expect(filterPhotos(list, { phase: 1, allianceId: w.c }).map((p) => p.uploadId)).toEqual([PHOTO]);
    expect(photoOfPhase(s, 1)).toBeNull();
    expect(tryRun(s, { type: 'PHASE_PHOTO_SET', phase: 1, uploadId: 'unbekanntXYZ1' }).ok).toBe(false);
    s = run(s, { type: 'PHASE_PHOTO_SET', phase: 1, uploadId: PHOTO, caption: 'Der Sturm auf Caltus' });
    expect(photoOfPhase(toPublicView(s), 1)).toMatchObject({ uploadId: PHOTO, caption: 'Der Sturm auf Caltus', by: 'GM' });
    expect(referencedUploadIds(s)).toEqual(expect.arrayContaining([PHOTO, PHOTO2]));
    expect(may(s, w.pa, { type: 'PHASE_PHOTO_SET', phase: 1, uploadId: null })).not.toBeNull();
  });

  it('Abstimmung über den Spielerlink: je Spieler eine Stimme, anonym in der Leseansicht, Warmaster geht vor', () => {
    const { s: s0, w } = playedPhase();
    let s = s0;
    const vote = (pid: string, uploadId: string | null): Command => ({ type: 'PHOTO_VOTE', playerId: pid, phase: 1, uploadId });
    expect(tryRun(s, vote(w.pa, PHOTO)).ok).toBe(false);
    s = run(s, { type: 'PHOTO_VOTE_MODE', enabled: true });
    expect(may(s, w.pa, vote(w.pa, PHOTO))).toBeNull();
    expect(may(s, w.pa, vote(w.pb, PHOTO))).not.toBeNull();
    expect(may(s, w.pa, { type: 'PHOTO_VOTE_MODE', enabled: false })).not.toBeNull();
    s = run(s, vote(w.pa, PHOTO));
    s = run(s, vote(w.pa, PHOTO));
    s = run(s, vote(w.pb, PHOTO));
    expect(voteTally(s, 1)).toEqual([{ uploadId: PHOTO, votes: 2 }]);
    expect(photoOfPhase(s, 1)).toMatchObject({ uploadId: PHOTO, by: 'VOTE', votes: 2 });
    expect(toPublicView(s).phases[0].photoVotes?.every((v) => v.playerId === '')).toBe(true);
    expect(toPlayerView(s, w.pa, w.a).phases[0].photoVotes?.map((v) => v.playerId)).toEqual([w.pa, '']);
    s = run(s, vote(w.pa, null));
    expect(voteTally(s, 1)).toEqual([{ uploadId: PHOTO, votes: 1 }]);
    // Foto einer anderen Phase gilt nicht
    expect(tryRun(s, { type: 'PHOTO_VOTE', playerId: w.pb, phase: 2, uploadId: PHOTO }).ok).toBe(false);
  });
});

describe('D5 Bemal-Chronik', () => {
  it('Einträge über den Spielerlink, Summe fertig bemalter Punkte, Vorschlag Battle Ready, Hobby-Leiste', () => {
    let s = startedCampaign();
    const w = ids(s);
    const add = (pid: string, points: number, status: 'DONE' | 'WIP'): Command => ({ type: 'HOBBY_ADD', playerId: pid, entry: { date: '2026-01-02', unit: 'Boyz', status, photo: null, points } });
    expect(may(s, w.pa, add(w.pa, 100, 'DONE'))).toBeNull();
    expect(may(s, w.pa, add(w.pb, 100, 'DONE'))).not.toBeNull();
    s = run(s, add(w.pa, 1500, 'DONE'));
    s = run(s, add(w.pa, 500, 'WIP'));
    s = run(s, add(w.pa, 600, 'DONE'));
    const me = s.players.find((p) => p.id === w.pa)!;
    expect(paintedPoints(me)).toBe(2100);
    expect(battleReadyFromHobby(me, 2000)).toBe(true);
    expect(battleReadyFromHobby(me, 3000)).toBe(false);
    expect(battleReadyFromHobby(me, null)).toBe(false);
    expect(allianceHobby(s)[w.a]).toBe(2100);
    expect(tryRun(s, { type: 'HOBBY_ADD', playerId: w.pa, entry: { date: 'gestern', unit: 'X', status: 'DONE', photo: null, points: 1 } }).ok).toBe(false);
    expect(tryRun(s, { type: 'HOBBY_ADD', playerId: w.pa, entry: { date: '2026-01-02', unit: ' ', status: 'DONE', photo: null, points: 1 } }).ok).toBe(false);
    // öffentlich sichtbar (Profil, Codex)
    expect(toPublicView(s).players.find((p) => p.id === w.pa)!.hobby).toHaveLength(3);
    s = run(s, { type: 'HOBBY_DELETE', playerId: w.pa, id: me.hobby![0].id });
    expect(paintedPoints(s.players.find((p) => p.id === w.pa)!)).toBe(600);
  });
});

describe('NTH2 4.2 Eigene Planetenbilder', () => {
  it('Upload im Dossier (jederzeit) und im Karteneditor (MAP_SET übernimmt die Bilder in den Planetenzustand)', () => {
    let s = startedCampaign();
    s = run(s, { type: 'PLANET_IMAGE_SET', planetId: 'masnet', portrait: 'portraitABCD12', landscape: 'landABCD1234' });
    const m = s.planets.find((p) => p.id === 'masnet')!;
    expect([m.portrait, m.landscape]).toEqual(['portraitABCD12', 'landABCD1234']);
    expect(tryRun(s, { type: 'PLANET_IMAGE_SET', planetId: 'masnet', portrait: '../etc/passwd' }).ok).toBe(false);
    s = run(s, { type: 'PLANET_IMAGE_SET', planetId: 'masnet', portrait: null });
    expect(s.planets.find((p) => p.id === 'masnet')!.portrait).toBeNull();
    expect(s.planets.find((p) => p.id === 'masnet')!.landscape).toBe('landABCD1234');
    expect(referencedUploadIds(s)).toContain('landABCD1234');

    // Karteneditor: Bilder im Entwurf, Stammdaten bleiben frei davon (Registry ist global)
    let c = createCampaignState({ name: 'K', phaseCount: 3, allianceCount: 2, now: '2026-01-01T00:00:00Z' });
    const map = structuredClone(VESPATOR_MAP);
    map.planets[0].portrait = 'editorPortr01';
    c = run(c, { type: 'MAP_SET', map });
    expect(c.planets.find((p) => p.id === map.planets[0].id)!.portrait).toBe('editorPortr01');
    expect(c.map.planets[0].portrait).toBeUndefined();
    expect(c.map.template).toBe('vespator');
    // erneutes Übernehmen ohne Bildangabe behält das Bild
    c = run(c, { type: 'MAP_SET', map: structuredClone(VESPATOR_MAP) });
    expect(c.planets.find((p) => p.id === map.planets[0].id)!.portrait).toBe('editorPortr01');
  });
});

describe('NTH2 7.3/7.4 Zweisprachige Inhalte', () => {
  it('Leser bekommt seine Sprache, sonst das Original mit Hinweis; Übersetzungen über die Text-Commands', () => {
    let s = startedCampaign();
    const w = ids(s);
    s = run(s, { type: 'META_UPDATE', intro: 'Willkommen', introTr: { en: 'Welcome', de: 'ignoriert' } });
    expect(s.meta.introTr).toEqual({ en: 'Welcome' });
    expect(introText(s, 'en')).toEqual({ value: 'Welcome', lang: 'en', fallback: false });
    expect(introText(s, 'de')).toEqual({ value: 'Willkommen', lang: 'de', fallback: false });
    s = run(s, { type: 'DISPATCH_UPSERT', title: 'Dekret', body: 'Text', pinned: true, public: true, tr: { en: { title: 'Decree', body: 'Text EN' } } });
    const d = s.dispatches.at(-1)!;
    expect(dispatchText(s, d, 'en').value).toEqual({ title: 'Decree', body: 'Text EN' });
    expect(dispatchVersions(s, d, 'both').map((v) => v.lang)).toEqual(['de', 'en']);
    // Bearbeiten ohne tr lässt die Übersetzung stehen
    s = run(s, { type: 'DISPATCH_UPSERT', id: d.id, title: 'Dekret 2', body: 'Text', pinned: true, public: true });
    expect(s.dispatches.at(-1)!.tr?.en?.title).toBe('Decree');
    s = run(s, { type: 'PLANET_TEXT', planetId: 'masnet', lore: 'Wüste', loreTr: { en: '' } });
    const pubLore = toPublicView(s).planets.find((p) => p.id === 'masnet')!;
    expect(pickText(pubLore.lore, pubLore.loreTr, 'de', 'en')).toEqual({ value: 'Wüste', lang: 'de', fallback: true });
    s = run(s, { type: 'ALLIANCE_UPSERT', id: w.a, name: 'Rot', color: '#ff0000', lore: 'Die Roten', loreTr: { en: 'The Reds' } });
    expect(s.alliances.find((a) => a.id === w.a)!.loreTr).toEqual({ en: 'The Reds' });
    expect(textVersions('A', { en: 'B' }, 'de', 'both').map((v) => v.value)).toEqual(['A', 'B']);
    expect(textVersions('A', undefined, 'de', 'both').map((v) => v.value)).toEqual(['A']);
    // Englische Kampagne: Deutsch ist die zweite Sprache
    s = run(s, { type: 'META_UPDATE', locale: 'en' });
    expect(pickText('Hello', { de: 'Hallo' }, 'en', 'de').value).toBe('Hallo');
  });
});

describe('P2-Commands ändern keine alten Stände', () => {
  it('ältere Zustände ohne neue Felder funktionieren', () => {
    const s = startedCampaign();
    expect(galleryPhotos(s)).toEqual([]);
    expect(photoOfPhase(s, 1)).toBeNull();
    const r = executeCommand(s, { type: 'PHOTO_VOTE_MODE', enabled: true });
    expect(r.ok).toBe(true);
  });
});

describe('P2-Seiten ohne globalen Seitenfuß', () => {
  it('QR-Karten und Meldesprung sind Ein-Bildschirm-Seiten', async () => {
    const { isShellRoute } = await import('@/components/appRoutes');
    expect(isShellRoute('/admin/c/abc/player-cards')).toBe(true);
    expect(isShellRoute('/meldung/abc/b1')).toBe(true);
  });
});
