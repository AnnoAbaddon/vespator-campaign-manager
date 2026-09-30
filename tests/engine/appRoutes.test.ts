import { describe, expect, it } from 'vitest';
import { isAppRoute, isAuthRoute, isShellRoute } from '@/components/appRoutes';

describe('Ein-Bildschirm-Apps ohne globalen Seitenfuß (M2/M3)', () => {
  it('erkennt Cockpit, Leseansicht und Spielerseite samt Unterseiten, Hall of Fame, Zeitraffer und Präsentation', () => {
    for (const p of [
      '/admin/c/abc',
      '/admin/c/abc/',
      '/admin/c/abc/zeitraffer',
      '/admin/c/abc/codex',
      '/v/tok',
      '/v/tok/present',
      '/v/tok/zeitraffer',
      '/v/tok/rules',
      '/v/tok/battles/b1',
      '/v/tok/battles/b1/briefing',
      '/p/tok',
      '/p/tok/battles/b1',
      '/hall/abc',
    ])
      expect(isAppRoute(p), p).toBe(true);
  });
  it('lässt Dokumentseiten mit Seitenfuß', () => {
    for (const p of ['/login', '/setup-admin', '/einladung/x']) expect(isAuthRoute(p), p).toBe(true);
    for (const p of ['/', '/admin', '/admin/settings', '/admin/c/abc/print', '/credits', '/hall']) expect(isAppRoute(p), p).toBe(false);
  });
});

describe('Verwaltungsseiten in der Terminal-Hülle ohne globalen Seitenfuß', () => {
  it('erkennt Kampagnenliste, Konto, FAQ, Druck-, Link- und Briefingseiten sowie die Nachweise', () => {
    for (const p of ['/admin', '/admin/', '/admin/settings', '/admin/faq', '/admin/hilfe', '/credits', '/admin/c/abc/player-links', '/admin/c/abc/print', '/admin/c/abc/sheets/orders', '/admin/c/abc/briefing/b1'])
      expect(isShellRoute(p), p).toBe(true);
  });
  it('lässt andere Seiten unberührt', () => {
    for (const p of ['/', '/admin/c/abc', '/admin/c/abc/codex', '/admin/c/abc/sheets', '/v/tok', '/hall']) expect(isShellRoute(p), p).toBe(false);
  });
});
