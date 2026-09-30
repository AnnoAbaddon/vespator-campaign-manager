import { describe, expect, it } from 'vitest';
import { OVERRIDE_TYPES, isOverrideCommand as engineIsOverride, type Command } from '@/engine/commands';
import { CLIENT_OVERRIDE_TYPES, isOverrideCommand as clientIsOverride } from '@/components/admin/overrideCommand';
import { MAX_PLAYER_COMMAND_BYTES, checkCommandInput, sanitizeCommand, singleLine, stripControl } from '@/engine/playerActions';

/** Eingabeprüfung der Commands (Review SEC 1) und die abhängigkeitsfreie Override-Liste des Clients (QUALITY 9) */

describe('checkCommandInput', () => {
  it('lehnt Nicht-Objekte, zu große und zu tief verschachtelte Commands ab', () => {
    expect(checkCommandInput(null, true)).toBe('Ungültige Aktion');
    expect(checkCommandInput('ADVANCE', true)).toBe('Ungültige Aktion');
    expect(checkCommandInput({ type: 42 }, true)).toBe('Ungültige Aktion');
    expect(checkCommandInput({ type: 'NOTE_ADD', text: 'x'.repeat(MAX_PLAYER_COMMAND_BYTES) }, true)).toBe('Die Eingabe ist zu groß');
    // Spielleiter: großzügigere Grenze
    expect(checkCommandInput({ type: 'META_UPDATE', intro: 'x'.repeat(MAX_PLAYER_COMMAND_BYTES) }, false)).toBeNull();
    let deep: Record<string, unknown> = { type: 'X' };
    const root = deep;
    for (let i = 0; i < 40; i++) deep = (deep.n = {}) as Record<string, unknown>;
    expect(checkCommandInput(root, false)).toBe('Ungültige Aktion');
  });

  it('Spieler: Textlänge, Listenlänge und Bild-IDs', () => {
    expect(checkCommandInput({ type: 'RESULT_DRAFT_SUBMIT', battleId: 'b', playerId: 'p', update: { report: 'r'.repeat(5001) } }, true)).toMatch(/zu lang/);
    expect(checkCommandInput({ type: 'RESULT_DRAFT_SUBMIT', battleId: 'b', playerId: 'p', update: { report: 'r'.repeat(5000) } }, true)).toBeNull();
    expect(checkCommandInput({ type: 'RESULT_DRAFT_SUBMIT', battleId: 'b', playerId: 'p', update: { photos: ['AbCdEfGh1234', '../x'] } }, true)).toBe('Ungültiges Bild');
    expect(checkCommandInput({ type: 'RESULT_DRAFT_SUBMIT', battleId: 'b', playerId: 'p', update: { photos: ['AbCdEfGh1234'] } }, true)).toBeNull();
    expect(checkCommandInput({ type: 'COMMANDER_UPDATE', playerId: 'p', name: 'n', title: 't', portrait: null }, true)).toBeNull();
    expect(checkCommandInput({ type: 'PROFILE_UPDATE', playerId: 'p', update: { avatar: 'x y' } }, true)).toBe('Ungültiges Bild');
    expect(checkCommandInput({ type: 'HOBBY_ADD', list: Array.from({ length: 201 }, () => 1) }, true)).toBe('Zu viele Einträge');
  });
});

describe('sanitizeCommand', () => {
  it('entfernt Steuerzeichen, lässt Zeilenumbrüche in Freitexten und entfernt sie in Namen', () => {
    const cmd = { type: 'NOTE_ADD', text: 'a\r\nb\u0000c\td', nested: { nickname: 'Neu\nName\u001b', list: ['x\u0007'] } };
    expect(sanitizeCommand(cmd)).toEqual({ type: 'NOTE_ADD', text: 'a\nbc\td', nested: { nickname: 'Neu Name', list: ['x'] } });
    // Original bleibt unverändert
    expect(cmd.text).toBe('a\r\nb\u0000c\td');
    expect(stripControl('ok ')).toBe('ok');
    expect(singleLine('a\n\tb')).toBe('a b');
  });
});

describe('Override-Liste des Clients', () => {
  it('stimmt mit der Engine überein', () => {
    expect([...CLIENT_OVERRIDE_TYPES].sort()).toEqual([...OVERRIDE_TYPES].sort());
    const samples: Command[] = [
      { type: 'BATTLE_UNPLAYED', battleId: 'b', resolution: 'ATTACKER_WINS' },
      { type: 'BATTLE_UNPLAYED', battleId: 'b', resolution: 'VOID' },
      { type: 'ADVANCE' },
      { type: 'OVERRIDE_STAGE', stage: { kind: 'ENDED' } } as Command,
    ];
    for (const c of samples) expect(clientIsOverride(c), c.type).toBe(engineIsOverride(c));
  });
});
