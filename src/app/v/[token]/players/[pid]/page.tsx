import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPublic } from '@/server/public';
import { MEDALS } from '@/engine/data/vespator';
import { allianceOf, stagePhase } from '@/engine/players';
import { AllianceTag, Avatar, FactionTag, MedalIcon, Panel } from '@/components/ui';
import { planetName } from '@/components/public/fmt';
import { playerStats, pct, avg } from '@/components/stats/compute';
import { CommanderCard } from '@/components/CommanderCard';
import { GameIcon } from '@/components/icons/GameIcon';
import { ArrowLeftIcon } from '@/components/icons';
import { publicLocale, tFor } from '@/i18n/server';
import { battleKindName } from '@/components/battleName';
import { RivalryView } from '@/components/public/R2Public';
import { HobbyLog } from '@/components/public/HobbyLog';

/**
 * Spielerakte der Leseansicht: Kopf mit Allianz, Fraktion und Rolle gebündelt, wenige beschriftete Kennzahlen
 * (erst ab der ersten gewerteten Schlacht), Medaillen, Kommandant und Schlachtenliste. Ohne Schlachten ein
 * kurzer erklärender Leerzustand statt leerer Rahmen.
 */
/** Seitentitel: Name des Spielers (Vorlage der Leseansicht ergänzt die Kampagne) */
export async function generateMetadata({ params }: { params: Promise<{ token: string; pid: string }> }) {
  const { token, pid } = await params;
  try {
    return { title: loadPublic(token).state.players.find((x) => x.id === pid)?.nickname ?? undefined };
  } catch {
    return {};
  }
}

export default async function PublicPlayer({ params }: { params: Promise<{ token: string; pid: string }> }) {
  const { token, pid } = await params;
  const { state } = loadPublic(token);
  const p = state.players.find((x) => x.id === pid);
  if (!p) notFound();
  const locale = await publicLocale(state);
  const t = tFor(locale);
  const st = playerStats(state).find((s) => s.playerId === pid);
  const al = (id: string | null) => state.alliances.find((a) => a.id === id) ?? null;
  const phaseNow = stagePhase(state);
  const alliance = al(allianceOf(p, phaseNow));
  const battles = state.battles.filter((b) => b.status !== 'VOID' && [...b.attackers, ...b.defenders].some((x) => x.playerId === pid)).sort((a, b) => b.phaseNumber - a.phaseNumber);
  const medals = state.medals.filter((m) => m.playerIds.includes(pid));
  // Rolle in der Kampagne: Anführer der Allianz, Kommandant einer Flotte in der laufenden Phase, sonst Mitglied
  const commands = state.stage.kind === 'PHASE' ? state.fleets.filter((f) => f.commanders[String(phaseNow)] === pid) : [];
  const roles = [alliance?.leaderPlayerId === pid ? t('Anführer der Allianz') : null, commands.length ? t('Kommandant: {fleets}', { fleets: commands.map((f) => f.name).join(', ') }) : null].filter(
    (x): x is string => !!x,
  );
  const result = (b: (typeof battles)[number]) => {
    if (!b.victor) return { text: t('offen'), cls: 'text-dim' };
    if (b.victor === 'DRAW') return { text: t('Unentschieden'), cls: 'text-ink' };
    const mine = b.attackers.some((x) => x.playerId === pid) ? 'ATTACKER' : 'DEFENDER';
    return b.victor === mine ? { text: t('Sieg'), cls: 'text-ok' } : { text: t('Niederlage'), cls: 'text-danger' };
  };
  const figures: [string, React.ReactNode][] = st?.battles
    ? [
        [t('Schlachten'), st.battles],
        [t('Siege / Unentschieden / Niederlagen'), `${st.wins} / ${st.draws} / ${st.losses}`],
        [t('Siegquote'), pct(st.wins, st.battles)],
        [t('Ø Siegpunkte'), avg(st.vpFor, st.battles)],
        [t('bemalt gespielt'), pct(st.battleReady, st.battles)],
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {/* Spielerakten gehören zur Statistik: sichtbarer Rückweg zur Rangliste */}
      <Link className="link inline-flex items-center gap-1 text-[15px]" href={`/v/${token}/stats`}>
        <ArrowLeftIcon size={14} />
        {t('Zur Rangliste')}
      </Link>
      <section className="hud p-3 sm:p-4" aria-label={p.nickname}>
        <div className="relative z-[1] flex flex-wrap items-center gap-x-4 gap-y-3">
          <Avatar id={p.avatar} name={p.nickname} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[26px] font-bold uppercase leading-tight tracking-[0.05em] text-ink">{p.nickname}</h1>
            {/* Allianz, Fraktion und Rolle als ein Block beschrifteter Angaben */}
            <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[15px] sm:flex sm:flex-wrap sm:gap-x-6">
              <div className="contents sm:flex sm:items-center sm:gap-2">
                <dt className="text-dim">{t('Allianz')}</dt>
                <dd>{alliance ? <AllianceTag alliance={alliance} /> : <span className="text-faint">{t('ohne Allianz')}</span>}</dd>
              </div>
              <div className="contents sm:flex sm:items-center sm:gap-2">
                <dt className="text-dim">{t('Fraktion')}</dt>
                <dd>
                  {p.faction ? <FactionTag name={p.faction} /> : <span className="text-faint">–</span>}
                  {p.subfaction ? <span className="text-dim"> – {p.subfaction}</span> : ''}
                </dd>
              </div>
              <div className="contents sm:flex sm:items-center sm:gap-2">
                <dt className="text-dim">{t('Rolle')}</dt>
                <dd className="text-ink">{roles.length ? roles.join(' · ') : t('Mitglied')}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {figures.length > 0 ? (
        <section aria-label={t('Bilanz')}>
          <h2 className="section-title">{t('Bilanz')}</h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {figures.map(([k, v]) => (
              <div key={k} className="inset px-3 py-2">
                <dt className="text-[13px] leading-tight text-dim">{k}</dt>
                <dd className="mt-0.5 font-mono text-[22px] font-bold leading-tight text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {medals.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-3">
              {medals.map((m) => (
                <span key={m.medal} className="inline-flex items-center gap-1.5 text-warn">
                  <MedalIcon medal={m.medal} /> {MEDALS[m.medal].name}
                </span>
              ))}
            </p>
          )}
        </section>
      ) : null}

      {(p.commander?.name || p.honors?.length || p.scars?.length) && (
        <Panel title={t('Kommandant')}>
          <CommanderCard state={state} player={p} locale={locale} />
        </Panel>
      )}

      {/* C5: Nemesis und Rivalitäten; C4: persönliche Ziele nach Kampagnenende aufgedeckt */}
      {(st?.battles || p.nemesisId) && (
        <Panel title={t('Rivalitäten')}>
          <RivalryView state={state} playerId={pid} locale={locale} />
        </Panel>
      )}
      {(p.goals ?? []).length > 0 && (
        <Panel title={t('Persönliche Ziele')}>
          <ul className="space-y-1 text-[15px]">
            {(p.goals ?? []).map((g) => (
              <li key={g.id}>
                <b className="text-ink">{g.title}</b> <span className={g.status === 'MET' ? 'text-ok' : 'text-dim'}>· {g.status === 'MET' ? t('erfüllt') : t('nicht erfüllt')}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* D5: Bemal-Chronik */}
      {(p.hobby ?? []).length > 0 && (
        <Panel title={t('Bemal-Chronik')}>
          <HobbyLog player={p} locale={locale} />
        </Panel>
      )}

      {battles.length ? (
        <Panel title={t('Schlachten')}>
          <ul className="divide-y divide-line/40 text-[15px]">
            {battles.map((b) => {
              const r = result(b);
              return (
                <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                  <Link className="link" href={`/v/${token}/battles/${b.id}`}>
                    {t('Phase {n}', { n: b.phaseNumber })}: {battleKindName(b, t)} {b.planetId ? `· ${planetName(b.planetId)}` : ''}
                  </Link>
                  <span className={`text-[14px] font-semibold ${r.cls}`}>{r.text}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : (
        <section className="inset flex items-start gap-3 px-4 py-3" aria-label={t('Schlachten')}>
          <GameIcon name="op_BATTLE" size={26} color="#b3975f" className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-ink">{t('Noch keine Schlachten')}</p>
            <p className="text-[15px] text-dim">{t('Sobald {name} eine Schlacht bestreitet, erscheinen hier Ergebnis, Bilanz und Siegquote.', { name: p.nickname })}</p>
          </div>
        </section>
      )}
    </div>
  );
}
