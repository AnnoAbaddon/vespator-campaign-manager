import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ids, startedCampaign } from '../engine/helpers';
import { DISCORD_CMD_NAMES, DISCORD_COMMANDS, discordCmd, discordCmdLocale, discordPlayerCmds, discordTextLocale } from '@/i18n/discordCommands';
import { LOCALES } from '@/i18n/core';

// Erwartet deutsche Texte ohne Kampagnen- und Standardsprache: deutscher Build (NEXT_PUBLIC_DEFAULT_LOCALE=de), vor allen Importen gesetzt
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'de';
});

/** Discord-Bot: Befehlsnamen und Hinweise in allen fünf Sprachen (i18n-Review) */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-discord-i18n-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.APP_URL = 'https://kampagne.example';

type Mods = {
  campaigns: typeof import('@/server/campaigns');
  backup: typeof import('@/server/backup');
  players: typeof import('@/server/players');
  discord: typeof import('@/server/discordBot');
  db: typeof import('@/server/db');
};
let m: Mods;

beforeAll(async () => {
  m = {
    campaigns: await import('@/server/campaigns'),
    backup: await import('@/server/backup'),
    players: await import('@/server/players'),
    discord: await import('@/server/discordBot'),
    db: await import('@/server/db'),
  };
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

describe('Lokalisierung der Slash-Befehle', () => {
  const DISCORD_IDS = ['en-US', 'en-GB', 'fr', 'es-ES', 'es-419', 'pl'];
  const all = DISCORD_COMMANDS.flatMap((c) => [c, ...(c.options ?? [])]);

  it('jeder Befehl und jede Option hat Namen und Beschreibung für alle Zusatzsprachen', () => {
    for (const c of all) {
      for (const id of DISCORD_IDS) {
        expect(c.name_localizations[id], `${c.name} ${id}`).toBeTruthy();
        expect(c.description_localizations[id], `${c.name} ${id}`).toBeTruthy();
      }
    }
  });

  it('Namen erfüllen die Discord-Regeln (klein, ohne Leerzeichen, 1–32 Zeichen), Beschreibungen höchstens 100 Zeichen', () => {
    const valid = /^[-_'\p{L}\p{N}]{1,32}$/u;
    for (const c of all) {
      for (const n of [c.name, ...Object.values(c.name_localizations)]) {
        expect(n, n).toMatch(valid);
        expect(n).toBe(n.toLowerCase());
      }
      for (const d of [c.description, ...Object.values(c.description_localizations)]) expect(d.length, d).toBeLessThanOrEqual(100);
    }
  });

  it('Befehlsnamen sind je Sprache eindeutig und die Tabelle passt zur Anmeldung', () => {
    for (const l of LOCALES) {
      const top = DISCORD_COMMANDS.map((c) => DISCORD_CMD_NAMES[l][c.name as keyof (typeof DISCORD_CMD_NAMES)['de']]);
      expect(new Set(top).size, l).toBe(top.length);
    }
    expect(DISCORD_COMMANDS.map((c) => c.name)).toEqual(['lage', 'aufgaben', 'termin', 'bestätigen', 'verknüpfen', 'trennen']);
    expect(DISCORD_COMMANDS.find((c) => c.name === 'termin')!.options![0].name_localizations.fr).toBe(DISCORD_CMD_NAMES.fr.annehmen);
  });

  it('Hinweistexte nennen die Befehle, die der Client tatsächlich anzeigt', () => {
    expect(discordCmd('de', 'termin', 'annehmen')).toBe('/termin annehmen');
    expect(discordCmd('en', 'termin', 'annehmen')).toBe('/schedule accept');
    expect(discordCmd('fr', 'bestätigen')).toBe('/confirmer');
    expect(discordCmd('es', 'verknüpfen')).toBe('/vincular');
    expect(discordCmd('pl', 'lage')).toBe('/sytuacja');
    expect(discordPlayerCmds('fr')).toBe('/situation, /tâches, /rendez-vous accepter, /confirmer');
    expect(discordCmdLocale('es-419')).toBe('es');
    expect(discordCmdLocale('en-GB')).toBe('en');
    // Clients ohne Lokalisierung sehen die deutschen Grundnamen
    expect(discordCmdLocale('ja')).toBe('de');
    expect(discordCmdLocale(undefined)).toBeNull();
    expect(discordTextLocale('ja')).toBeNull();
    expect(discordTextLocale('de')).toBe('de');
    expect(discordTextLocale('pl')).toBe('pl');
  });
});

describe('Antworten des Bots je Sprache des Discord-Clients', () => {
  const keys = crypto.generateKeyPairSync('ed25519');
  const pubHex = (keys.publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12).toString('hex');
  const send = (body: object) => {
    const raw = JSON.stringify(body);
    const ts = String(Math.floor(Date.now() / 1000));
    return m.discord.handleInteraction(raw, crypto.sign(null, Buffer.from(ts + raw), keys.privateKey).toString('hex'), ts);
  };
  const cmd = (uid: string, name: string, locale: string, options?: object[]) => send({ type: 2, member: { user: { id: uid, username: `u${uid}` } }, locale, data: { name, options } });
  const content = (r: { body: unknown }) => (r.body as { data: { content: string } }).data.content;

  beforeAll(() => {
    expect(m.discord.setDiscordBotConfig({ appId: '123456789012345678', publicKey: pubHex, token: '' })).toBeNull();
  });

  it('nicht verknüpft: Sprache des Clients, sonst globale Standardsprache, sonst Deutsch – mit passendem Befehlsnamen', () => {
    expect(content(cmd('700', 'lage', 'fr'))).toMatch(/\/lier\b/);
    expect(content(cmd('700', 'lage', 'fr'))).toMatch(/joueur/);
    expect(content(cmd('700', 'lage', 'en-US'))).toMatch(/code for \/link\./);
    expect(content(cmd('700', 'lage', 'es-419'))).toMatch(/\/vincular/);
    // unbekannte Client-Sprache: Text in der Standardsprache, Befehl mit deutschem Grundnamen
    expect(content(cmd('700', 'lage', 'ja'))).toMatch(/noch mit keinem Spieler verknüpft.*\/verknüpfen/);
    m.db.setDefaultLocale('en');
    expect(content(cmd('700', 'lage', 'ja'))).toMatch(/not linked to a player yet.*\/verknüpfen/);
    m.db.setDefaultLocale('de');
  });

  it('verknüpft: Text in der Sprache des Spielers, Befehlsnamen in der Sprache des Clients', () => {
    const s = startedCampaign();
    const id = m.backup.importBackup(new TextEncoder().encode(JSON.stringify({ state: s })), 'Testkampagne');
    const st = m.campaigns.currentState(id).state;
    const { pa, pc, fa, c } = ids(st);
    m.players.regeneratePlayerToken(id, pa);
    m.players.regeneratePlayerToken(id, pc);
    cmd('701', 'verknüpfen', 'en-GB', [{ name: 'code', type: 3, value: m.discord.createDiscordCode(id, pc)! }]);
    const run = (command: Parameters<typeof m.campaigns.runCommand>[2]) => {
      const r = m.campaigns.runCommand(id, -1, command, { force: true, reason: 'test' });
      if (!r.ok) throw new Error('error' in r ? r.error : r.kind);
    };
    run({ type: 'OP_SET', fleetId: fa, slot: 1, op: { type: 'BATTLE', attackType: 'PURGE_AND_BURN', targetPlanetId: 'caltus-novem', targetAllianceId: c } });
    run({ type: 'ADVANCE' });
    run({ type: 'REVEAL_OPS' });
    const b = m.campaigns.currentState(id).state.battles.find((x) => x.kind === 'CAMPAIGN')!;
    run({ type: 'TIME_PROPOSE', battleId: b.id, playerId: pa, times: ['2026-10-10T17:00:00.000Z'] });
    // Kampagne deutsch, Client englisch: deutscher Text, englischer Befehlsname
    expect(content(cmd('701', 'aufgaben', 'en-GB'))).toMatch(/Terminvorschlag annehmen:.*→ \/schedule accept/);
    expect(content(cmd('701', 'aufgaben', 'pl'))).toMatch(/→ \/termin przyjmij/);
    expect(content(cmd('701', 'aufgaben', 'de'))).toMatch(/→ \/termin annehmen/);
  });
});
