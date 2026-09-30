import { ATTACK_TYPES, MEDALS } from '@/engine/data/vespator';
import { eventName } from '@/engine/customEvents';
import { campaignPoints } from '@/engine/board';
import { TENDENCY_LABEL } from '@/engine/fog';
import { mapOf, planetName } from '@/engine/map';
import { missionLabel } from '@/engine/missions';
import { effectiveVictor } from '@/engine/outcomes';
import type { Battle, CampaignState } from '@/engine/types';
import { MapSvg } from '@/components/map/MapSvg';
import { PlanetPortrait } from '@/components/map/PlanetArt';
import { Markdown } from '@/components/ui';
import { CommanderCard } from '@/components/CommanderCard';
import { playerStats } from '@/components/stats/compute';
import { uploadUrl } from '@/components/public/fmt';
import type { TimelineFrame } from '@/server/public';
import { dispatchesByPhase } from './codexUtil';
import { PrintButton } from './PrintButton';
import { DEFAULT_LOCALE, intlLocale, makeT, translateMessage, type Locale, type T } from '@/i18n/core';
import { dispatchVersions, originalLang, textVersions, type ContentMode, type Picked } from '@/engine/contentLang';
import { photoOfPhase } from '@/engine/gallery';
import { allianceHobby, HOBBY_STATUS_LABEL, paintedPoints } from '@/engine/hobby';
import { LangNote, LangTag, LANG_NAMES } from '@/components/LangNote';
import { PhasePhotoFigure } from './PhasePhoto';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Codex (N3.1): die Kampagne als druckbare Chronik – Titelblatt, Inhaltsverzeichnis, je Phase Karte,
 * Punkte, Schlachtberichte und Events, dann Dispatches, Planeten-Lore und Ehrenliste. PDF über den Browser.
 */
export function Codex({
  current,
  frames,
  locale,
  planetImages,
  content,
  contentHref,
}: {
  current: CampaignState;
  frames: TimelineFrame[];
  locale?: Locale;
  planetImages?: boolean;
  /** Inhaltssprache (NTH2 7.4): eine Sprache oder beide nebeneinander; Standard = Sprache des Lesers */
  content?: ContentMode;
  /** Link für die Wahl der Inhaltssprache (ohne Angabe keine Wahl) */
  contentHref?: (m: ContentMode) => string;
}) {
  const lc = locale ?? DEFAULT_LOCALE;
  const mode: ContentMode = content ?? lc;
  const orig = originalLang(current);
  const t = makeT(lc);
  const il = intlLocale(lc);
  const st = current;
  const tz = st.meta.timezone || 'Europe/Berlin';
  const day = (iso: string) => new Date(iso).toLocaleDateString(il, { timeZone: tz });
  const al = (id: string | null | undefined) => st.alliances.find((a) => a.id === id);
  // Abgeschlossene Phasen und die laufende Phase (aktueller Stand, Frame -1)
  const phases: (TimelineFrame & { running?: boolean })[] = frames.filter((f) => f.phase > 0);
  const live = frames.find((f) => f.phase === -1);
  const liveStage = live?.state.stage;
  if (live && liveStage?.kind === 'PHASE' && !phases.some((f) => f.phase === liveStage.phase)) phases.push({ ...live, phase: liveStage.phase, running: true });
  const lore = mapOf(st).planets.filter((d) => st.planets.find((p) => p.id === d.id)?.lore?.trim());
  // Dispatches nach Datum der passenden Phase zuordnen; der Rest steht in einem eigenen Abschnitt
  const byPhase = dispatchesByPhase(st);
  const dispatches = [...byPhase.entries()]
    .filter(([n]) => !phases.some((f) => f.phase === n))
    .flatMap(([, l]) => l)
    .sort((a, b) => a.at.localeCompare(b.at));
  const hasIntro = !!st.meta.intro?.trim() || st.alliances.some((a) => a.lore?.trim());
  // D5: Bemal-Chronik
  const hobbyists = st.players.filter((p) => (p.hobby ?? []).length);
  const hobbyTotals = allianceHobby(st);
  const stats = playerStats(st).sort((a, b) => b.wins - a.wins || b.battles - a.battles);
  const winner = al(st.result?.winnerAllianceId);
  const toc = [
    ...(hasIntro ? [['einleitung', t('Einleitung')]] : []),
    ['start', t('Aufstellung zum Kampagnenstart')],
    ...phases.map((f) => [`phase-${f.phase}`, f.running ? t('Phase {n} (laufend)', { n: f.phase }) : t('Phase {n}', { n: f.phase })]),
    ...(dispatches.length ? [['dispatches', t('Dispatches')]] : []),
    ...(lore.length ? [['welten', t('Die Welten der Front')]] : []),
    ...(hobbyists.length ? [['bemal-chronik', t('Bemal-Chronik')]] : []),
    ['ehrenliste', t('Ehrenliste')],
  ];
  const start = frames.find((f) => f.phase === 0);

  // Wahl der Inhaltssprache: eine Sprache oder beide nebeneinander (auch für den Druck)
  const modes: ContentMode[] = [...new Set<ContentMode>([orig, lc, orig === 'en' ? 'de' : 'en']), 'both'];
  const langPick = contentHref && (
    <nav className="no-print flex flex-wrap items-center gap-1" aria-label={t('Sprache der Inhalte')}>
      <span className="w-full text-[13px] text-dim">{t('Sprache der Inhalte')}</span>
      {modes.map((m) => (
        <a key={m} href={contentHref(m)} className={`chip touch-44 ${mode === m ? 'border-accent text-accent' : ''}`} aria-current={mode === m ? 'page' : undefined}>
          {m === 'both' ? t('beide nebeneinander') : LANG_NAMES[m]}
        </a>
      ))}
    </nav>
  );

  const tocList = (
    <ol className="space-y-0.5">
      {toc.map(([id, label], k) => (
        <li key={id}>
          <a href={`#${id}`} className="flex min-h-11 items-center gap-2 rounded-[2px] px-2 py-1 font-serif text-[16px] text-dim hover:bg-white/5 hover:text-ink lg:min-h-0 lg:items-baseline">
            <span className="w-5 shrink-0 text-right font-mono text-[13px] text-brass">{k + 1}</span>
            <span className="min-w-0">{label}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="codex-root flex h-full min-h-0 flex-col gap-3">
      <style>{`
        @page { size: A4 portrait; margin: 14mm; }
        @media print {
          header, footer, .no-print { display: none !important; }
          html, body { background: #fff !important; }
          .codex-page { break-before: page; }
          .codex img { max-height: 60mm; }
        }
      `}</style>

      {/* Mobil: Inhalt als aufklappbare Leiste und kurze Drucktaste über der Lesespalte */}
      <nav className="no-print flex shrink-0 items-start gap-2 lg:hidden" aria-label={t('Inhalt')}>
        <details className="group inset min-w-0 flex-1 px-2 py-1.5">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 font-serif text-[16px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0 text-brass transition-transform group-open:rotate-90">
              <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {t('Inhalt')}
          </summary>
          <div className="pt-1">{tocList}</div>
        </details>
        <PrintButton label={t('Als PDF speichern / drucken')} shortLabel={t('Drucken / PDF')} />
      </nav>
      {langPick && <div className="shrink-0 lg:hidden">{langPick}</div>}

      {/* Lesespalte: nur sie scrollt; auf dem Desktop steht das Inhaltsverzeichnis direkt neben dem Dokument */}
      <div className="codex-scroll min-h-0 flex-1 overflow-y-auto scroll-smooth pr-1 motion-reduce:scroll-auto" tabIndex={0} role="region" aria-label={t('Codex der Kampagne')}>
        <div className="mx-auto flex max-w-[calc(210mm+16rem)] items-start gap-5">
          <nav className="no-print sticky top-0 hidden w-56 shrink-0 flex-col gap-2 pt-1 lg:flex" aria-label={t('Inhalt')}>
            <PrintButton label={t('Als PDF speichern / drucken')} />
            {langPick}
            <p className="section-title mt-1">{t('Inhalt')}</p>
            {tocList}
          </nav>
          <article className="codex min-w-0 max-w-[210mm] flex-1 space-y-5 pb-4">
            {/* Titelblatt: auf dem Bildschirm kompakt mit Sprung zum ersten Kapitel, im Druck eine volle Seite */}
            <section className="codex-sheet codex-title flex flex-col items-center justify-center gap-3 text-center sm:gap-4 print:min-h-[250mm]">
              <span aria-hidden className="pointer-events-none absolute right-4 top-0 h-20 w-9 bg-[url('/ui/seal-ribbon.webp')] bg-contain bg-top bg-no-repeat sm:right-6 sm:h-28 sm:w-12 print:hidden" />
              <span
                aria-hidden
                className="block h-12 w-32 bg-[url('/ui/emblem-winged.webp')] bg-contain bg-center bg-no-repeat opacity-80 [filter:sepia(0.6)_brightness(0.55)_contrast(1.3)] sm:h-16 sm:w-44 print:hidden"
              />
              <p className="font-display text-[14px] font-bold uppercase tracking-[0.14em] text-[#6d1a12] sm:text-[15px]">{t('Codex der Kampagne')}</p>
              <h1 className="codex-h1 text-[26px] leading-tight sm:text-[40px] lg:text-5xl">{st.meta.name}</h1>
              <div aria-hidden className="codex-rule w-2/3" />
              <p className="text-[16px]">
                {t('{n} Phasen', { n: st.meta.phaseCount })} · {st.alliances.map((a) => a.name).join(' · ')}
              </p>
              {winner && (
                <p className="mt-2 text-lg">
                  {t('Sieger:')} <b>{winner.name}</b>
                </p>
              )}
              <p className="mt-2 text-[14px] text-[#5a3d1c] print:mt-8">{t('Aufgezeichnet am {date}', { date: day(new Date().toISOString()) })}</p>
              <a href={`#${toc[0][0]}`} className="codex-jump no-print">
                {t('Zum ersten Kapitel: {name}', { name: toc[0][1] })}
              </a>
            </section>

            <section className="codex-sheet codex-page hidden print:block">
              <h2 className="mb-3">{t('Inhalt')}</h2>
              <ol className="list-decimal space-y-1 pl-6">
                {toc.map(([id, label]) => (
                  <li key={id}>
                    <a href={`#${id}`}>{label}</a>
                  </li>
                ))}
              </ol>
            </section>

            {hasIntro && (
              <section id="einleitung" className="codex-sheet codex-page">
                <h2 className="mb-3">{t('Einleitung')}</h2>
                {st.meta.intro?.trim() && <Versions list={textVersions(st.meta.intro, st.meta.introTr, orig, mode)} locale={lc} render={(v) => <Markdown text={v} className="codex-lead" />} />}
                {st.alliances.map((a) => (
                  <div key={a.id} className="mt-4">
                    <h3 className="flex items-center gap-2">
                      <span aria-hidden className="inline-block h-3 w-3 rotate-45 border border-[#2a1b0c]" style={{ background: a.color }} />
                      {a.name}
                    </h3>
                    {a.lore && <Versions list={textVersions(a.lore, a.loreTr, orig, mode)} locale={lc} render={(v) => <Markdown text={v} />} />}
                  </div>
                ))}
              </section>
            )}

            {start && (
              <section id="start" className="codex-sheet codex-page space-y-3">
                <h2>{t('Aufstellung zum Kampagnenstart')}</h2>
                <MapBox state={start.state} locale={lc} planetImages={planetImages} />
                <Points state={start.state} t={t} />
              </section>
            )}

            {phases.map((f) => {
              const battles = f.state.battles
                .filter((b) => b.phaseNumber === f.phase && (b.kind === 'CAMPAIGN' || b.kind === 'FINAL_TIEBREAK') && b.status !== 'VOID')
                .sort((a, b) => (a.playedAt ?? '').localeCompare(b.playedAt ?? '') || a.createdSeq - b.createdSeq);
              const events = f.state.events.filter((e) => e.phaseNumber === f.phase && e.status === 'APPLIED');
              const news = byPhase.get(f.phase) ?? [];
              // NTH2 4.3/D1: Bild der Phase (aktueller Stand – die Wahl fällt oft erst nach dem Phasenende)
              const photo = photoOfPhase(st, f.phase);
              return (
                <section key={f.phase} id={`phase-${f.phase}`} className="codex-sheet codex-page space-y-4">
                  <h2>{f.running ? t('Phase {n} (laufend)', { n: f.phase }) : t('Phase {n}', { n: f.phase })}</h2>
                  {photo && <PhasePhotoFigure uploadId={photo.uploadId} caption={photo.caption} title={t('Bild der Phase')} />}
                  <MapBox state={f.state} locale={lc} planetImages={planetImages} />
                  <Points state={f.state} t={t} />
                  {battles.length > 0 && (
                    <div className="space-y-4">
                      <h3>{t('Schlachtberichte')}</h3>
                      {battles.map((b) => (
                        <BattleReport key={b.id} state={f.state} b={b} locale={lc} />
                      ))}
                    </div>
                  )}
                  {events.length > 0 && (
                    <div>
                      <h3>{t('Ereignisse')}</h3>
                      <ul className="list-disc pl-6">
                        {events.map((e) => (
                          <li key={e.id}>
                            <b>{eventName(e)}</b>
                            {e.allianceId ? ` (${al(e.allianceId)?.name})` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {news.length > 0 && (
                    <div className="space-y-3">
                      <h3>{t('Dispatches')}</h3>
                      {news.map((d) => (
                        <Versions
                          key={d.id}
                          list={dispatchVersions(st, d, mode)}
                          locale={lc}
                          render={(v) => (
                            <div className="break-inside-avoid">
                              <h4>{v.title}</h4>
                              <p className="codex-meta">{day(d.at)}</p>
                              <Markdown text={v.body} />
                            </div>
                          )}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

            {dispatches.length > 0 && (
              <section id="dispatches" className="codex-sheet codex-page space-y-4">
                <h2>{t('Dispatches')}</h2>
                {dispatches.map((d) => (
                  <Versions
                    key={d.id}
                    list={dispatchVersions(st, d, mode)}
                    locale={lc}
                    render={(v) => (
                      <div className="break-inside-avoid">
                        <h3>{v.title}</h3>
                        <p className="codex-meta">{day(d.at)}</p>
                        <Markdown text={v.body} />
                      </div>
                    )}
                  />
                ))}
              </section>
            )}

            {lore.length > 0 && (
              <section id="welten" className="codex-sheet codex-page space-y-4">
                <h2>{t('Die Welten der Front')}</h2>
                {lore.map((d) => (
                  <div key={d.id} id={`welt-${slug(d.name)}`} className="flex break-inside-avoid gap-4">
                    <PlanetPortrait planetId={d.id} size={88} destroyed={st.planets.find((p) => p.id === d.id)?.destroyed} planetImages={planetImages} image={st.planets.find((p) => p.id === d.id)?.portrait} />
                    <div className="min-w-0 flex-1">
                      <h3>
                        {d.name} <span className="codex-meta font-normal">[{d.system}]</span>
                      </h3>
                      <PlanetLoreVersions st={st} planetId={d.id} orig={orig} mode={mode} locale={lc} />
                    </div>
                  </div>
                ))}
              </section>
            )}

            {hobbyists.length > 0 && (
              <section id="bemal-chronik" className="codex-sheet codex-page space-y-4">
                <h2>{t('Bemal-Chronik')}</h2>
                <p>
                  {t('Fertig bemalte Punkte je Allianz:')} {st.alliances.map((a) => `${a.name} ${hobbyTotals[a.id] ?? 0}`).join(' · ')}
                </p>
                {hobbyists.map((p) => (
                  <div key={p.id} className="break-inside-avoid">
                    <h3>
                      {p.nickname} <span className="codex-meta font-normal">({t('{n} Punkte fertig bemalt', { n: paintedPoints(p) })})</span>
                    </h3>
                    <ul className="list-disc pl-6">
                      {[...(p.hobby ?? [])]
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((h) => (
                          <li key={h.id}>
                            {new Date(h.date).toLocaleDateString(il, { timeZone: 'UTC' })}: <b>{h.unit}</b> – {t(HOBBY_STATUS_LABEL[h.status])}
                            {h.points ? ` (${t('{n} Punkte', { n: h.points })})` : ''}
                          </li>
                        ))}
                    </ul>
                    <Photos ids={(p.hobby ?? []).map((h) => h.photo).filter((x): x is string => !!x)} />
                  </div>
                ))}
              </section>
            )}

            <section id="ehrenliste" className="codex-sheet codex-page space-y-4">
              <h2>{t('Ehrenliste')}</h2>
              {winner ? (
                <p className="text-lg">
                  {t('Die Vespator Front fällt an')} <b className="text-[#6d1a12]">{winner.name}</b>.
                </p>
              ) : (
                <p>{t('Die Kampagne ist noch nicht entschieden.')}</p>
              )}
              {st.medals.length > 0 && (
                <div>
                  <h3>{t('Medaillen')}</h3>
                  <ul className="list-disc pl-6">
                    {st.medals.map((m) => (
                      <li key={m.medal}>
                        {MEDALS[m.medal].name}: {al(m.allianceId)?.name}
                        {m.playerIds.length ? ` (${m.playerIds.map((id) => st.players.find((p) => p.id === id)?.nickname).join(', ')})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3>{t('Bilanz der Spieler')}</h3>
                <table className="codex-table w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left">{t('Spieler')}</th>
                      <th className="text-right">{t('Schlachten')}</th>
                      <th className="text-right">{t('S/U/N')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.playerId}>
                        <td>{s.nickname}</td>
                        <td className="text-right">{s.battles}</td>
                        <td className="text-right">
                          {s.wins}/{s.draws}/{s.losses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {st.players.some((p) => p.commander?.name || p.honors?.length) && (
                <div className="space-y-3">
                  <h3>{t('Kommandanten')}</h3>
                  {st.players
                    .filter((p) => p.commander?.name || p.honors?.length)
                    .map((p) => (
                      <div key={p.id} className="break-inside-avoid">
                        <p className="codex-meta">{p.nickname}</p>
                        <CommanderCard state={st} player={p} compact locale={lc} parchment />
                      </div>
                    ))}
                </div>
              )}
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}

function MapBox({ state, locale, planetImages }: { state: CampaignState; locale: Locale; planetImages?: boolean }) {
  const pts = state.pointsHistory.at(-1)?.points ?? null;
  return (
    <figure className="break-inside-avoid">
      <div className="codex-map screen p-1 print:hidden">
        <MapSvg state={state} variant="compact" unit={1.9} className="relative block h-auto w-full" points={pts} locale={locale} planetImages={planetImages} />
      </div>
      <div className="hidden print:block">
        <MapSvg state={state} print className="block h-auto w-full" points={pts} locale={locale} planetImages={planetImages} />
      </div>
    </figure>
  );
}

function Points({ state, t }: { state: CampaignState; t: T }) {
  const last = state.pointsHistory.at(-1);
  // C1: Nebel über dem Punktestand – nur Rangfolge und Tendenz
  const fog = state.fog;
  if (fog)
    return (
      <p className="text-[15px]">
        {t('Rangfolge:')}{' '}
        {[...state.alliances]
          .sort((a, b) => fog.rank[a.id] - fog.rank[b.id])
          .map((a) => `${fog.rank[a.id]}. ${a.name} (${t(TENDENCY_LABEL[fog.tendency[a.id]])})`)
          .join(' · ')}
      </p>
    );
  return (
    <p className="text-[15px]">
      {t('Kampagnenpunkte:')}{' '}
      {[...state.alliances]
        .sort((a, b) => (last?.points[b.id] ?? campaignPoints(state, b.id)) - (last?.points[a.id] ?? campaignPoints(state, a.id)))
        .map((a) => `${a.name} ${last?.points[a.id] ?? campaignPoints(state, a.id)}`)
        .join(' · ')}
    </p>
  );
}

function BattleReport({ state, b, locale }: { state: CampaignState; b: Battle; locale: Locale }) {
  const t = makeT(locale);
  const al = (id: string) => state.alliances.find((a) => a.id === id)?.name;
  const names = (l: { playerId: string }[]) =>
    l
      .map((p) => state.players.find((x) => x.id === p.playerId)?.nickname)
      .filter(Boolean)
      .join(' & ');
  const v = effectiveVictor(b);
  const result = !v ? t('nicht gespielt') : v === 'DRAW' ? t('Unentschieden') : t('{name} siegt', { name: al(v === 'ATTACKER' ? b.attackerAllianceId : b.defenderAllianceId) });
  return (
    <div className="break-inside-avoid border-l-4 border-[#6d1a12] pl-3">
      <p className="font-bold">
        {b.kind === 'FINAL_TIEBREAK' ? t('Entscheidungsschlacht') : t('{attack} auf {planet}', { attack: ATTACK_TYPES[b.attackType!].name, planet: planetName(b.planetId) })} – {result}
        {b.vp ? ` (${b.vp.attacker}:${b.vp.defender} VP)` : ''}
      </p>
      <p className="codex-meta">
        {t('{a} ({pa}) gegen {d} ({pd})', { a: al(b.attackerAllianceId), pa: names(b.attackers) || '–', d: al(b.defenderAllianceId), pd: names(b.defenders) || '–' })} · {translateMessage(locale, missionLabel(state, b))}
        {b.playedAt ? ` · ${new Date(b.playedAt).toLocaleDateString(intlLocale(locale), { timeZone: state.meta.timezone || 'Europe/Berlin' })}` : ''}
      </p>
      {b.report && <Markdown text={b.report} className="codex-lead" />}
      <Photos ids={b.photos} />
      {(b.games ?? []).map((g, i) => (
        <div key={g.id} className="mt-2 break-inside-avoid border-l-2 border-[#5a3d1c] pl-2 text-[15px]">
          <p className="font-bold">
            {t('Spiel {n}', { n: i + 1 })}: {t('{a} gegen {d}', { a: names(g.attackers) || '–', d: names(g.defenders) || '–' })}
            {g.vp ? ` (${g.vp.attacker}:${g.vp.defender} VP)` : ''}
          </p>
          {g.report && <Markdown text={g.report} />}
          <Photos ids={g.photos ?? []} />
        </div>
      ))}
    </div>
  );
}

/** Alle Fotos einer Schlacht bzw. eines Einzelspiels (im Druck in der Höhe begrenzt) */
function Photos({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {ids.map((p) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p} src={uploadUrl(p)!} alt="" className="max-h-40 w-full break-inside-avoid border border-[#5a3d1c] object-cover" />
      ))}
    </div>
  );
}

function PlanetLoreVersions({ st, planetId, orig, mode, locale }: { st: CampaignState; planetId: string; orig: ReturnType<typeof originalLang>; mode: ContentMode; locale: Locale }) {
  const ps = st.planets.find((p) => p.id === planetId)!;
  return <Versions list={textVersions(ps.lore, ps.loreTr, orig, mode)} locale={locale} render={(v) => <Markdown text={v} />} />;
}

/**
 * Inhalt in einer oder mehreren Sprachen (NTH2 7.3/7.4): eine Fassung (bei fehlender Übersetzung mit
 * Sprachhinweis) oder mehrere Fassungen nebeneinander, jede mit Sprachkennung.
 */
function Versions<V>({ list, render, locale }: { list: Picked<V>[]; render: (v: V) => React.ReactNode; locale: Locale }) {
  if (list.length === 1)
    return (
      <>
        {list[0].fallback && <LangNote lang={list[0].lang} locale={locale} className="mb-1 print:hidden" />}
        <div lang={list[0].lang}>{render(list[0].value)}</div>
      </>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
      {list.map((v) => (
        <div key={v.lang} lang={v.lang} className="min-w-0">
          <LangTag lang={v.lang} />
          {render(v.value)}
        </div>
      ))}
    </div>
  );
}
