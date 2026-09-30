import type { Metadata } from 'next';
import { cache } from 'react';
import { CONFIRM_LINK_ERRORS, checkConfirmLink, type ConfirmLinkCheck } from '@/server/confirmLink';
import { can, confirmAccess } from '@/server/authz';
import { contextLocale } from '@/server/locale';
import { LocaleProvider } from '@/i18n/client';
import { tFor } from '@/i18n/server';
import { ImperialHeader } from '@/components/ImperialHeader';
import { CreditsLink } from '@/components/CreditsLink';
import { toPlayerView } from '@/engine/publicView';
import { allianceOf } from '@/engine/players';
import { ConfirmLinkView } from './ConfirmLinkView';
import type { Battle, CampaignState } from '@/engine/types';

export const dynamic = 'force-dynamic';

/**
 * Einmal-Link prüfen – je Anfrage einmal (Metadaten und Seite). Erst die Signatur (ohne Zustand, zentral in authz),
 * dann der Stand. Jeder Link ohne gültige Signatur bekommt dieselbe Antwort „ungültig“ (F7).
 */
const check = cache((key: string): ConfirmLinkCheck => {
  const access = confirmAccess(key.split('/'));
  if (!access || can(access.principal, 'confirm.redeem', { campaignId: access.parts.cid })) return { ok: false, error: 'INVALID' };
  return checkConfirmLink(access.parts);
});

export async function generateMetadata({ params }: { params: Promise<{ link: string[] }> }): Promise<Metadata> {
  const c = check((await params).link.join('/'));
  const l = c?.player ? contextLocale(c.player.locale, c.state?.meta.locale) : contextLocale();
  return { title: tFor(l)('Ergebnis bestätigen'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/**
 * Nur das, was die Zusammenfassung des Entwurfs braucht: die eine Schlacht, Namen der beteiligten Spieler,
 * Allianzen, Flotten und Planeten (für die Outcome-Texte) sowie Zeitzone, Spielgrößen und Missionen.
 * Keine Kontaktdaten, Notizen, Befehle oder übrigen Schlachten – der Link kann weitergeleitet werden.
 */
function confirmViewState(view: CampaignState, battle: Battle): CampaignState {
  const d = battle.draft;
  const playerIds = new Set<string>([...battle.attackers, ...battle.defenders, ...(d?.update.attackers ?? []), ...(d?.update.defenders ?? [])].map((p) => p.playerId));
  if (d) playerIds.add(d.byPlayerId);
  const planetIds = new Set<string>(battle.planetId ? [battle.planetId] : []);
  for (const dec of Object.values(d?.decisions ?? {})) for (const v of Object.values(dec as unknown as Record<string, unknown>)) if (typeof v === 'string' && view.planets.some((p) => p.id === v)) planetIds.add(v);
  const m = view.meta;
  const minimal = {
    meta: {
      name: m.name,
      intro: '',
      phaseCount: m.phaseCount,
      allianceCount: m.allianceCount,
      createdAt: m.createdAt,
      timezone: m.timezone,
      locale: m.locale,
      edition: m.edition,
      battleSizes: m.battleSizes,
      missions: m.missions,
      module: m.module,
    },
    map: view.map,
    alliances: view.alliances.map((a) => ({ id: a.id, name: a.name, color: a.color, order: a.order })),
    players: view.players.filter((p) => playerIds.has(p.id)).map((p) => ({ id: p.id, nickname: p.nickname })),
    planets: view.planets.filter((p) => planetIds.has(p.id)).map((p) => ({ id: p.id, slots: p.slots, destroyed: p.destroyed, power: p.power })),
    fleets: view.fleets.map((f) => ({ id: f.id, name: f.name, allianceId: f.allianceId })),
    battles: [battle],
  };
  // Nur-Anzeige-Ausschnitt: die Zusammenfassung liest ausschließlich diese Felder
  return minimal as unknown as CampaignState;
}

/**
 * Mini-Ansicht zum Einmal-Link (NTH2 1.5): vollständiger Entwurf (wie auf der Spielerseite) mit
 * „Bestätigen“ und „Widersprechen“. Kein Spielerlink nötig; der Link berechtigt nur zu dieser einen Aktion.
 */
export default async function ConfirmPage({ params }: { params: Promise<{ link: string[] }> }) {
  const { link } = await params;
  const c = check(link.join('/'));
  const locale = c.player ? contextLocale(c.player.locale, c.state?.meta.locale) : contextLocale();
  const t = tFor(locale);
  let body: React.ReactNode;
  if (!c.ok) {
    body = (
      <p className="flex items-start gap-2 text-[16px]">
        <span aria-hidden className="lamp lamp-alert mt-1.5 shrink-0" />
        {t(CONFIRM_LINK_ERRORS[c.error])}
      </p>
    );
  } else {
    // Sicht des Spielers (verdeckte Befehle anderer Allianzen bleiben verborgen)
    const view = toPlayerView(c.state, c.player.id, allianceOf(c.player, c.battle.phaseNumber));
    const battle = view.battles.find((b) => b.id === c.battle.id)!;
    body = <ConfirmLinkView segments={link} state={confirmViewState(view, battle)} battle={battle} playerName={c.player.nickname} archived={c.archived} />;
  }
  return (
    <LocaleProvider locale={locale}>
      <ImperialHeader href="/" subtitle={t('Ergebnis bestätigen')} locale={locale} />
      <main className="mx-auto flex h-[calc(100dvh-var(--hdr))] max-w-3xl flex-col gap-3 overflow-y-auto px-3 pb-3 pt-5 sm:px-4">
        <section className="hud frame relative flex-none p-3 pt-8 sm:p-5 sm:pt-9" aria-label={t('Ergebnis bestätigen')}>
          <h1 className="plate plate-head max-w-[calc(100%-40px)] truncate">{t('Ergebnis bestätigen')}</h1>
          <div className="relative z-[1]">{body}</div>
        </section>
        <CreditsLink locale={locale} className="mt-auto pb-1 text-center" />
      </main>
    </LocaleProvider>
  );
}
