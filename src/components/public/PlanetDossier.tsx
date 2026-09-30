import Link from 'next/link';
import { PlanetPortrait, hasPortrait } from '@/components/map/PlanetArt';
import { INFRA, THEATRES } from '@/engine/data/vespator';
import { neighbours } from '@/engine/graph';
import type { CampaignState } from '@/engine/types';
import { planetDef } from '@/engine/map';
import { InfraBadge, TheatreBadge } from '@/components/map/icons';
import { AllianceTag, AttackIcon, Markdown } from '@/components/ui';
import { BoltIcon, BookIcon, TowerIcon } from '@/components/icons';
import { DossierHead } from './DossierParts';
import { GameIcon } from '@/components/icons/GameIcon';
import { planetName } from '@/components/public/fmt';
import { DEFAULT_LOCALE, makeT, type Locale } from '@/i18n/core';
import { battleKindName } from '@/components/battleName';
import { planetLore } from '@/engine/contentLang';
import { LangNote } from '@/components/LangNote';
import { uploadUrl } from '@/components/public/fmt';
import { planetTraits } from '@/engine/crusade';
import { PlanetTraitList } from '@/components/crusade/PlanetTraits';

/** Abschnitt der Planetenakte (wie im Cockpit): kompakte Stahlfläche mit kleiner Überschrift */
function Section({ icon, title, children, className = '' }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dossier-sec ${className}`}>
      <h3 className="dossier-h">
        <span className="text-brass">{icon}</span>
        <span className="flex-1">{title}</span>
      </h3>
      <div className="relative z-[1]">{children}</div>
    </section>
  );
}

/**
 * Planetenakte nur lesend (Leseansicht, Spielerseite): Name und System, Landschaft, Umgebungstypen,
 * Power Level, Infrastruktur, Flotten im Orbit, Schlachten und öffentliche Lore. Optik wie die
 * Planetenakte im Cockpit (admin/phase/PlanetPanel). Die SL-Notiz wird nie gezeigt – die öffentliche
 * Projektion leert sie ohnehin. Ohne Hooks: nutzbar in Server- und Client-Komponenten.
 */
export function PlanetDossier({
  state,
  planetId,
  locale = DEFAULT_LOCALE,
  planetImages,
  base,
  onClose,
  fullHref,
  head = true,
}: {
  state: CampaignState;
  planetId: string;
  locale?: Locale;
  planetImages?: boolean;
  /** Basis für Schlacht-Links (…/battles/{id}); ohne Angabe keine Links */
  base?: string;
  /** Schließen-Taste (nur in Client-Komponenten) */
  onClose?: () => void;
  /** Link zur ausführlichen Planetenseite */
  fullHref?: string;
  /** Kopf (Name, Siegel, Schließen) zeigen – im mobilen Blatt übernimmt das Blatt den Kopf */
  head?: boolean;
}) {
  const t = makeT(locale);
  const def = planetDef(planetId);
  const ps = state.planets.find((p) => p.id === planetId);
  if (!def || !ps) return null;
  const al = (id: string | null | undefined) => state.alliances.find((a) => a.id === id) ?? null;
  const fleets = state.fleets.filter((f) => f.planetId === planetId && !f.reserve);
  const battles = state.battles.filter((b) => b.planetId === planetId && b.status !== 'VOID').sort((a, b) => b.phaseNumber - a.phaseNumber || b.createdSeq - a.createdSeq);
  // Landschaftsbilder nur für die unveränderten Vespator-Welten (N6)
  // NTH2 4.2: eigenes Landschaftsbild hat Vorrang
  const land = ps.landscape ? uploadUrl(ps.landscape) : planetImages !== false && hasPortrait(planetId) ? `/ui/land/${planetId}.webp` : null;
  // NTH2 7.3: Lore in der Sprache des Lesers, sonst Original mit Hinweis
  const lore = planetLore(state, ps, locale);
  const near = neighbours(planetId);
  const victor = (v: string | null) => (v ? (v === 'DRAW' ? t('Unentschieden') : v === 'ATTACKER' ? t('Angreifer siegt') : t('Verteidiger siegt')) : t('offen'));

  return (
    <article className="relative space-y-2" aria-label={t('Planetenakte {name}', { name: def.name })}>
      {head && <DossierHead name={def.name} system={def.system} onClose={onClose} closeLabel={t('Planetenakte schließen')} />}

      <div className="bezel overflow-hidden">
        {land ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={land} alt="" className={`block h-[clamp(92px,13vh,150px)] w-full object-cover ${ps.destroyed ? 'grayscale-[0.8] brightness-50 sepia-[0.3]' : ''}`} loading="lazy" />
        ) : (
          <div className="screen flex h-[clamp(92px,13vh,150px)] items-center justify-center">
            <PlanetPortrait planetId={planetId} size={90} destroyed={ps.destroyed} planetImages={planetImages} image={ps.portrait} />
          </div>
        )}
        {ps.destroyed && <span className="absolute left-3 top-3 z-[4] rounded-[2px] bg-[#5a1414]/90 px-2 py-0.5 font-display text-[13px] font-bold uppercase tracking-wider text-[#ffd0c9]">{t('Zerstört')}</span>}
      </div>

      {/* Planetendaten; auf der eigenen Planetenseite (breit) rechts neben Bild und Lore */}
      <div className="dossier-data space-y-2">
        <ul className="theatres" aria-label={t('Umgebungstypen')}>
          {def.theatres.map((th) => (
            <li key={th}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0e1211] shadow-[inset_0_0_0_1px_#b3975f,0_0_0_2px_#050707]">
                <TheatreBadge id={th} size={21} />
              </span>
              {THEATRES[th].name}
            </li>
          ))}
        </ul>
        {near.length > 0 && (
          <p className="hint">
            <span className="font-semibold text-dim">{t('Verbindungen')}:</span> {near.map(planetName).join(', ')}
          </p>
        )}

        <Section icon={<BoltIcon size={17} />} title={t('Power Level')}>
          {/* mobil drei gleichartige Zeilen, ab Desktopbreite nebeneinander (kein 2+1-Umbruch) */}
          <ul className="grid grid-cols-1 gap-1 lg:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] lg:gap-1.5">
            {state.alliances.map((a) => (
              <li key={a.id} className="inset flex min-h-9 items-center gap-2 px-2.5 py-1 text-[15px] lg:min-h-0 lg:px-2" style={{ boxShadow: `inset 0 -2px 0 ${a.color}, inset 0 1px 3px rgba(0,0,0,0.85)` }}>
                <AllianceTag alliance={a} className="min-w-0 flex-1 truncate" />
                <span className="font-mono text-[20px] font-bold leading-none text-ink">{ps.power[a.id] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={<TowerIcon size={17} />} title={t('Infrastruktur')}>
          <ul className="space-y-1">
            {ps.slots.map((s, i) => {
              const owner = s.infra ? al(s.infra.allianceId) : null;
              return (
                <li key={i} className="flex items-center gap-2.5 text-[15px]">
                  <span className="w-4 text-center font-mono text-[14px] text-dim">{i + 1}</span>
                  <span className="inset flex min-h-8 flex-1 items-center gap-2 px-2.5">
                    {s.destroyed ? (
                      <span className="text-danger">{t('Zerstört')}</span>
                    ) : s.infra ? (
                      <>
                        <InfraBadge type={s.infra.type} color={owner?.color ?? '#999'} size={20} />
                        <span className="text-ink">{INFRA[s.infra.type].name}</span>
                        <span className="truncate text-dim">({owner?.name ?? '?'})</span>
                      </>
                    ) : (
                      <span className="text-faint">{t('Frei')}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section icon={<GameIcon name="ui_FLEET" size={17} color="#b3975f" />} title={t('Flotten im Orbit')}>
          {!fleets.length && <p className="text-[15px] text-faint">{t('Keine Flotten stationiert.')}</p>}
          <ul className="space-y-1">
            {fleets.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-[15px]">
                <AllianceTag alliance={al(f.allianceId)} className="shrink-0" />
                <span className="truncate text-ink">{f.name}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={<GameIcon name="op_BATTLE" size={17} color="#b3975f" />} title={t('Schlachten ({n})', { n: battles.length })}>
          {!battles.length && <p className="text-[15px] text-faint">{t('Noch keine.')}</p>}
          <ul className="space-y-1.5">
            {battles.slice(0, 10).map((b) => {
              const name = battleKindName(b, t);
              return (
                <li key={b.id} className="text-[14px]">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-mono text-[13px] text-faint">P{b.phaseNumber}</span>
                    <AttackIcon type={b.attackType} />
                    {base ? (
                      <Link className="link" href={`${base}/battles/${b.id}`}>
                        {name}
                      </Link>
                    ) : (
                      <span className="text-ink">{name}</span>
                    )}
                    <span className="chip">{victor(b.victor)}</span>
                  </span>
                  <span className="block pl-7 text-[13px] text-dim">
                    {al(b.attackerAllianceId)?.name ?? '?'} → {al(b.defenderAllianceId)?.name ?? '?'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      {/* A9: Planeten-Merkmale (Crusade) */}
      {planetTraits(state, planetId).length > 0 && (
        <Section icon={<GameIcon name="ui_PLANET" size={17} color="#b3975f" />} title={t('Planeten-Merkmale')}>
          <PlanetTraitList traits={planetTraits(state, planetId)} />
        </Section>
      )}

      <Section icon={<BookIcon size={17} />} title={t('Lore')} className="dossier-lore">
        {lore.fallback && <LangNote lang={lore.lang} locale={locale} className="mb-1.5" />}
        {lore.value ? <Markdown text={lore.value} /> : <p className="text-[15px] text-faint">{t('Keine Einträge vorhanden.')}</p>}
      </Section>

      {fullHref && (
        <Link className="btn w-full" href={fullHref}>
          {t('Vollständige Planetenakte')}
        </Link>
      )}
    </article>
  );
}
