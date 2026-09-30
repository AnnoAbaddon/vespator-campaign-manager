import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import { exportState, login } from './helpers';

/**
 * Barrierefreiheit (axe-core) auf allen Seiten, Desktop und Mobil, dazu Bildschirmfotos (N0).
 * Gemeldet werden Verstöße der Stufen „serious“ und „critical“.
 * Ausnahmen (bewusst, mit Begründung):
 *  - Goldschrift per background-clip:text (.gold-text, .gothic): axe kann den Kontrast dort nicht
 *    berechnen – diese Elemente sind vom Kontrast-Check ausgenommen, alles andere wird geprüft.
 *  - svg-img-alt: Die SVG-Karte hat role="img" mit aria-label; Theatre-Icons darin sind dekorativ.
 * Die Datei heißt „zz-…“, damit sie nach den Ablauf-Tests läuft (Konto existiert dann bereits).
 */
const DISABLED = ['svg-img-alt'];
const EXCLUDE = ['.gold-text', '.gothic', '.candles'];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobil', width: 390, height: 844 },
] as const;

async function audit(page: Page, label: string) {
  let b = new AxeBuilder({ page }).disableRules(DISABLED);
  for (const e of EXCLUDE) b = b.exclude(e);
  const res = await b.analyze();
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help} – ${v.nodes.length}× z. B. ${v.nodes[0]?.target.join(' ')}`);
  fs.mkdirSync('.e2e', { recursive: true });
  fs.appendFileSync('.e2e/a11y-report.txt', `## ${label}\n${report.join('\n') || 'keine Verstöße'}\n\n`);
  return report;
}

async function shot(page: Page, label: string) {
  fs.mkdirSync('.e2e/screens', { recursive: true });
  await page.screenshot({ path: `.e2e/screens/${label.replace(/[^\w-]+/g, '_')}.png` });
}

/** Keine waagerechte Scrollleiste – alles passt in die Breite */
async function noHorizontalScroll(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const W = window.innerWidth;
    // Verursacher benennen: überstehende Elemente, die nicht in einem eigenen Scrollbereich liegen
    const culprits: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.getBoundingClientRect().right <= W + 1) continue;
      let a = el.parentElement;
      let clipped = false;
      while (a && !clipped) {
        clipped = getComputedStyle(a).overflowX !== 'visible';
        a = a.parentElement;
      }
      if (!clipped) culprits.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    }
    return { over: document.documentElement.scrollWidth - W, culprits: culprits.slice(0, 5) };
  });
  expect(r.over, `${label}: waagerechter Überlauf durch ${r.culprits.join(' | ')}`).toBeLessThanOrEqual(1);
}

/** App-Oberflächen passen auf einen Bildschirm – gescrollt wird nur innerhalb der Spalten */
const ONE_SCREEN = /^((Leseansicht|Spielerseite|Cockpit|Zeitraffer|Präsentation) desktop|Login (desktop|mobil))$/;

async function visit(page: Page, url: string, label: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await noHorizontalScroll(page, label);
  if (ONE_SCREEN.test(label)) {
    const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(over, `${label}: Seite ist höher als der Bildschirm`).toBeLessThanOrEqual(1);
  }
  await shot(page, label);
  return audit(page, label);
}

/** Beispiel-IDs und Spielerlink aus der Demo-Kampagne */
async function demoLinks(browser: Browser) {
  const { id, token } = JSON.parse(fs.readFileSync('.e2e/demo.json', 'utf8')) as { id: string; token: string };
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  const st = await exportState(page, id);
  await page.goto(`/admin/c/${id}/player-links`);
  const pLink = (await page.locator('body').textContent())?.match(/\/p\/([A-Za-z0-9_-]{20,})/)?.[1] ?? '';
  const full = (await (await page.request.get(`/api/c/${id}/export?revisions=0`)).json()).state as { battles: { id: string }[] };
  await ctx.close();
  return { id, token, pLink, battle: full.battles[0]?.id, planet: st.planets[0].id, player: st.players[0].id };
}

test.describe('Barrierefreiheit und Darstellung', () => {
  test.setTimeout(300_000);

  for (const vp of VIEWPORTS) {
    test(`öffentliche Seiten und Spielerseite (${vp.name})`, async ({ browser }) => {
      const d = await demoLinks(browser);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.name === 'mobil' });
      const page = await ctx.newPage();
      const v = `/v/${d.token}`;
      const urls: [string, string][] = [
        ['/login', 'Login'],
        ['/credits', 'Nachweise'],
        [v, 'Leseansicht'],
        [`${v}/stats`, 'Statistik'],
        [`${v}/faq`, 'FAQ'],
        [`${v}/rules`, 'Regeln'],
        [`${v}/codex`, 'Codex'],
        [`${v}/zeitraffer`, 'Zeitraffer'],
        [`${v}/present`, 'Präsentation'],
        [`${v}/planets/${d.planet}`, 'Planet'],
        [`${v}/players/${d.player}`, 'Spieler'],
      ];
      if (d.battle) urls.push([`${v}/battles/${d.battle}`, 'Schlacht'], [`${v}/battles/${d.battle}/briefing`, 'Briefing']);
      if (d.pLink) urls.push([`/p/${d.pLink}`, 'Spielerseite']);
      if (d.pLink && d.battle) urls.push([`/p/${d.pLink}/battles/${d.battle}`, 'Spieler-Schlacht']);
      const all: string[] = [];
      for (const [url, label] of urls) all.push(...(await visit(page, url, `${label} ${vp.name}`)).map((x) => `${label}: ${x}`));
      await ctx.close();
      expect(all).toEqual([]);
    });

    test(`Verwaltung mit allen Reitern (${vp.name})`, async ({ browser }) => {
      const d = await demoLinks(browser);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.name === 'mobil' });
      const page = await ctx.newPage();
      await login(page);
      const a = `/admin/c/${d.id}`;
      const all: string[] = [];
      for (const [url, label] of [
        ['/admin', 'Kampagnenliste'],
        ['/admin/settings', 'Einstellungen'],
        ['/admin/faq', 'Admin-FAQ'],
        [`${a}/player-links`, 'Spielerlinks'],
        [`${a}/codex`, 'Admin-Codex'],
        [`${a}/zeitraffer`, 'Admin-Zeitraffer'],
        [`${a}/sheets/results`, 'Ergebnisbogen'],
      ] as const)
        all.push(...(await visit(page, url, `${label} ${vp.name}`)).map((x) => `${label}: ${x}`));
      all.push(...(await visit(page, a, `Cockpit ${vp.name}`)).map((x) => `Cockpit: ${x}`));
      // jeden Reiter der Kampagne einmal öffnen (Mobil: über „Mehr“)
      const tabs = page.getByRole('tab');
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        const tab = tabs.nth(i);
        if (!(await tab.isVisible())) continue;
        const name = ((await tab.textContent()) ?? `Reiter ${i}`).trim();
        await tab.click();
        await page.waitForLoadState('networkidle');
        await noHorizontalScroll(page, name);
        await shot(page, `Reiter ${name} ${vp.name}`);
        all.push(...(await audit(page, `Reiter ${name} ${vp.name}`)).map((x) => `${name}: ${x}`));
      }
      await ctx.close();
      expect(all).toEqual([]);
    });
  }
});
