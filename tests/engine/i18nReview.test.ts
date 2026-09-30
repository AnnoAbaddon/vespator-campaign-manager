import { describe, expect, it } from 'vitest';
import '@/i18n/packs';
import { translateMessage, type Locale } from '@/i18n/core';
import { EN_PATTERNS } from '@/i18n/en/engine';
import { buildDecree, DECREE_LANGS, DECREE_SLOTS, DECREE_TONES, SLOT_VARS, type DecreeFacts } from '@/engine/decree';
import { DECREE_HEADINGS, DECREE_TEXTS, DECREE_WORDS } from '@/engine/decreeTexts';
import { neutralTime } from '@/engine/logTime';
import { COMMON as EN_COMMON } from '@/i18n/en/common';
import { ADMIN_CORE as EN_ADMIN_CORE } from '@/i18n/en/admin-core';
import { ADMIN_PHASE as EN_ADMIN_PHASE } from '@/i18n/en/admin-phase';
import { ADMIN_SETUP as EN_ADMIN_SETUP } from '@/i18n/en/admin-setup';
import { ADMIN_MISC as EN_ADMIN_MISC } from '@/i18n/en/admin-misc';
import { PUBLIC as EN_PUBLIC } from '@/i18n/en/public';
import { PLAYER as EN_PLAYER } from '@/i18n/en/player';
import { P3 as EN_P3 } from '@/i18n/en/p3';
import { COMMON as FR_COMMON } from '@/i18n/fr/common';
import { ADMIN_CORE as FR_ADMIN_CORE } from '@/i18n/fr/admin-core';
import { ADMIN_PHASE as FR_ADMIN_PHASE } from '@/i18n/fr/admin-phase';
import { ADMIN_SETUP as FR_ADMIN_SETUP } from '@/i18n/fr/admin-setup';
import { ADMIN_MISC as FR_ADMIN_MISC } from '@/i18n/fr/admin-misc';
import { PUBLIC as FR_PUBLIC } from '@/i18n/fr/public';
import { PLAYER as FR_PLAYER } from '@/i18n/fr/player';
import { P3 as FR_P3 } from '@/i18n/fr/p3';
import { COMMON as ES_COMMON } from '@/i18n/es/common';
import { ADMIN_CORE as ES_ADMIN_CORE } from '@/i18n/es/admin-core';
import { ADMIN_PHASE as ES_ADMIN_PHASE } from '@/i18n/es/admin-phase';
import { ADMIN_SETUP as ES_ADMIN_SETUP } from '@/i18n/es/admin-setup';
import { ADMIN_MISC as ES_ADMIN_MISC } from '@/i18n/es/admin-misc';
import { PUBLIC as ES_PUBLIC } from '@/i18n/es/public';
import { PLAYER as ES_PLAYER } from '@/i18n/es/player';
import { P3 as ES_P3 } from '@/i18n/es/p3';
import { COMMON as PL_COMMON } from '@/i18n/pl/common';
import { ADMIN_CORE as PL_ADMIN_CORE } from '@/i18n/pl/admin-core';
import { ADMIN_PHASE as PL_ADMIN_PHASE } from '@/i18n/pl/admin-phase';
import { ADMIN_SETUP as PL_ADMIN_SETUP } from '@/i18n/pl/admin-setup';
import { ADMIN_MISC as PL_ADMIN_MISC } from '@/i18n/pl/admin-misc';
import { PUBLIC as PL_PUBLIC } from '@/i18n/pl/public';
import { PLAYER as PL_PLAYER } from '@/i18n/pl/player';
import { P3 as PL_P3 } from '@/i18n/pl/p3';

const ph = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

const OTHER: Locale[] = ['en', 'fr', 'es', 'pl'];

describe('Platzhalter der Engine-Meldungen (i18n-Review)', () => {
  it('Namen in Platzhaltern werden nicht übersetzt, auch wenn sie wie ein Oberflächenbegriff heißen', () => {
    // „Gast“ und „Flotte“ sind Schlüssel im Wörterbuch – als Spieler- oder Flottenname bleiben sie stehen
    for (const l of OTHER) {
      expect(translateMessage(l, 'Termin für Gast bestätigt: 2026-10-02 18:00'), l).toMatch(/Gast.*2026-10-02 18:00/);
      const withFleet = translateMessage(l, 'Masnet ist von Flotte aus nicht verbunden');
      expect(withFleet, l).toContain('Flotte');
      expect(withFleet, l).not.toBe('Masnet ist von Flotte aus nicht verbunden');
    }
    expect(translateMessage('en', 'Termin für Gast bestätigt: 2026-10-02 18:00')).toBe('Date for Gast confirmed: 2026-10-02 18:00');
  });

  it('jedes Muster mit Namen: ein Wörterbuchwort als Name bleibt in allen Sprachen unverändert', () => {
    const names = ['Gast', 'Flotte', 'Mission', 'Admin'];
    const broken: string[] = [];
    for (const [de] of EN_PATTERNS.filter(([d]) => /\{0\}/.test(d) && !/^\{0\}[.:] \{1\}$/.test(d))) {
      for (const name of names) {
        const msg = de.replace(/\{(\d+)\}/g, (_, i: string) => (i === '0' ? name : `X${i}`));
        for (const l of OTHER) if (!translateMessage(l, msg).includes(name)) broken.push(`${l}: ${msg} → ${translateMessage(l, msg)}`);
      }
    }
    expect(broken).toEqual([]);
  }, 30_000);

  it('Spielbegriffe und Schrittnamen in Platzhaltern werden weiter übersetzt', () => {
    expect(translateMessage('en', 'Phase 1: weiter zu 4 · Flotten bewegen')).toBe('Phase 1: on to 4 · Move fleets');
    expect(translateMessage('fr', 'Phase 1: weiter zu 4 · Flotten bewegen')).toContain('Déplacer les flottes');
    expect(translateMessage('en', 'Ungespielte Schlacht auf Masnet: Angreifer siegt')).toBe('Unplayed battle on Masnet: Attacker wins');
    expect(translateMessage('en', 'Historie nicht übernommen: zu viele Revisionen')).not.toMatch(/zu viele/);
  });

  it('generische Muster („{0}: {1}“) lassen fremden Text wie Dekret-Zeilen unverändert', () => {
    const line = 'Sonderziel „Brückenkopf“: erfüllt durch Rot.';
    for (const l of OTHER) expect(translateMessage(l, line), l).toBe(line);
    // „Name: Meldung“ wird weiterhin übersetzt
    expect(translateMessage('en', 'Rot: Strongholds können hier nicht gebaut werden')).toBe('Rot: Strongholds cannot be built here');
  });

  it('Zeitangaben in Meldungen sind sprachneutral', () => {
    expect(neutralTime('2026-10-02T16:00:00.000Z', 'Europe/Berlin')).toBe('2026-10-02 18:00');
    expect(neutralTime('2026-10-02T16:00:00.000Z', 'Keine/Zone')).toBe('2026-10-02 16:00');
    expect(neutralTime('kaputt')).toBe('kaputt');
  });
});

describe('Dekret-Baukasten in fünf Sprachen (i18n-Review)', () => {
  it('fr/es/pl: gleiche Bausteine, gleiche Variantenzahl und gleiche Platzhalter wie Deutsch, je Tonfall', () => {
    for (const tone of DECREE_TONES)
      for (const lang of ['fr', 'es', 'pl'] as const)
        for (const slot of DECREE_SLOTS) {
          const de = DECREE_TEXTS[tone].de[slot];
          const tr = DECREE_TEXTS[tone][lang][slot];
          expect(tr?.length, `${tone}/${lang}/${slot}`).toBe(de.length);
          tr.forEach((v, i) => {
            expect(ph(v), `${tone}/${lang}/${slot}[${i}]: ${v}`).toBe(ph(de[i]));
            for (const k of ph(v).split(',').filter(Boolean)) expect(SLOT_VARS[slot], `${slot}: {${k}}`).toContain(k);
            expect(v.trim(), `${tone}/${lang}/${slot}[${i}]`).not.toBe('');
          });
        }
  });

  it('Überschriften und Kleinwörter gibt es in jeder Sprache', () => {
    for (const lang of DECREE_LANGS) {
      expect(Object.keys(DECREE_HEADINGS[lang]).sort()).toEqual(Object.keys(DECREE_HEADINGS.de).sort());
      expect(Object.keys(DECREE_WORDS[lang].tendency).sort()).toEqual(Object.keys(DECREE_WORDS.de.tendency).sort());
      expect(DECREE_WORDS[lang].and).toBeTruthy();
    }
  });

  it('Entwurf in jeder Sprache ohne offene Platzhalter', () => {
    const f: DecreeFacts = {
      campaign: 'Testfront',
      phase: 2,
      phaseCount: 4,
      battles: [
        { planet: 'Masnet', attack: 'Purge and Burn', attacker: 'Rot', defender: 'Blau', winner: 'Rot', loser: 'Blau', winnerPlayers: 'P1', loserPlayers: 'P2', vp: [20, 10], unplayed: false },
        { planet: 'Karabas', attack: 'Supply Base Raid', attacker: 'Blau', defender: 'Grün', winner: null, loser: null, winnerPlayers: '', loserPlayers: '', vp: null, unplayed: false },
      ],
      pl: [{ planet: 'Masnet', alliance: 'Rot', from: 1, to: 2 }],
      events: [{ event: 'Stellar Storms', alliance: 'Blau' }],
      objectives: [{ objective: 'Brückenkopf', met: true, alliances: ['Rot', 'Grün'] }],
      honors: [{ player: 'P1', honor: 'Unaufhaltsam' }],
      medals: [],
      points: [
        { alliance: 'Rot', points: 7 },
        { alliance: 'Blau', points: 5 },
      ],
      fog: null,
      leader: 'Rot',
    };
    for (const lang of DECREE_LANGS)
      for (const tone of DECREE_TONES)
        for (let seed = 1; seed < 4; seed++) {
          const d = buildDecree(f, { tone, lang, seed });
          const all = `${d.title}\n${d.body}`;
          expect(all, `${lang}/${tone}`).not.toMatch(/\{\w+\}/);
          expect(all).toContain('Masnet');
          expect(all).toContain(`**${DECREE_HEADINGS[lang].battles}**`);
        }
  });
});

describe('Wörterbücher (i18n-Review)', () => {
  const AREAS: Record<string, Record<string, Record<string, string>>> = {
    en: { common: EN_COMMON, 'admin-core': EN_ADMIN_CORE, 'admin-phase': EN_ADMIN_PHASE, 'admin-setup': EN_ADMIN_SETUP, 'admin-misc': EN_ADMIN_MISC, public: EN_PUBLIC, player: EN_PLAYER, p3: EN_P3 },
    fr: { common: FR_COMMON, 'admin-core': FR_ADMIN_CORE, 'admin-phase': FR_ADMIN_PHASE, 'admin-setup': FR_ADMIN_SETUP, 'admin-misc': FR_ADMIN_MISC, public: FR_PUBLIC, player: FR_PLAYER, p3: FR_P3 },
    es: { common: ES_COMMON, 'admin-core': ES_ADMIN_CORE, 'admin-phase': ES_ADMIN_PHASE, 'admin-setup': ES_ADMIN_SETUP, 'admin-misc': ES_ADMIN_MISC, public: ES_PUBLIC, player: ES_PLAYER, p3: ES_P3 },
    pl: { common: PL_COMMON, 'admin-core': PL_ADMIN_CORE, 'admin-phase': PL_ADMIN_PHASE, 'admin-setup': PL_ADMIN_SETUP, 'admin-misc': PL_ADMIN_MISC, public: PL_PUBLIC, player: PL_PLAYER, p3: PL_P3 },
  };

  it('derselbe deutsche Schlüssel hat in allen Dateien einer Sprache dieselbe Übersetzung', () => {
    const conflicts: string[] = [];
    for (const [lang, files] of Object.entries(AREAS)) {
      const seen = new Map<string, [string, string]>();
      for (const [file, dict] of Object.entries(files))
        for (const [k, v] of Object.entries(dict)) {
          const prev = seen.get(k);
          if (prev && prev[1] !== v) conflicts.push(`${lang}: „${k}“ ${prev[0]}=${JSON.stringify(prev[1])} ≠ ${file}=${JSON.stringify(v)}`);
          else if (!prev) seen.set(k, [file, v]);
        }
    }
    expect(conflicts).toEqual([]);
  });

  it('Befehlsnamen des Discord-Bots stehen als Platzhalter in den Texten, nicht fest übersetzt', () => {
    for (const [lang, files] of Object.entries(AREAS))
      for (const dict of Object.values(files))
        for (const [k, v] of Object.entries(dict)) {
          if (!/\{cmds?\}/.test(k)) continue;
          expect(ph(v), `${lang}: ${k}`).toBe(ph(k));
          expect(v, `${lang}: ${k}`).not.toMatch(/\/(lage|situation|schedule|confirm|link)\b/);
        }
  });
});
