import { notFound } from 'next/navigation';
import { currentState } from '@/server/campaigns';
import { ATTACK_TYPES, BUILDABLE_TYPES, INFRA, type AttackType } from '@/engine/data/vespator';
import { connectedFor, modifierActive, selfOrConnected } from '@/engine/graph';
import { planetIds, planetName } from '@/engine/map';
import { canBuild } from '@/engine/board';
import { OUTCOME_SUMMARY } from '@/engine/outcomes';
import { battleSizes } from '@/engine/campaignRules';
import { missionLabel } from '@/engine/missions';
import type { CampaignState } from '@/engine/types';
import { PrintShell, PrintTool } from '@/components/admin/PrintShell';
import { adminLocale, tFor } from '@/i18n/server';
import { LOCALE_NAMES, LOCALES, makeT, translateMessage, type Locale, type T } from '@/i18n/core';
import { originalLang, otherLang } from '@/engine/contentLang';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { publicOrigin } from '@/server/origin';
import type { Metadata } from 'next';
import { authorizePage } from '@/server/authz';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Druckbögen') };
}

/** Übersetzung für die Bögen: t für UI-Texte, msg für Engine-Texte */
type Tr = { t: T; msg: (m: string) => string };

const KINDS = { orders: 'Befehlsbogen', moves: 'Bewegungsbogen', results: 'Ergebnisbögen' } as const;
type Kind = keyof typeof KINDS;

const Box = ({ w = 'w-full' }: { w?: string }) => <span className={`inline-block h-6 border-b border-black ${w}`} />;
const Check = ({ label }: { label: string }) => (
  <span className="mr-3 inline-flex items-center gap-1">
    <span className="inline-block h-3 w-3 border border-black" /> {label}
  </span>
);

/** Druckbögen (N3.5): A4, schwarz-weiß-tauglich, vorausgefüllt mit den gültigen Zielen */
export default async function Sheets({ params, searchParams }: { params: Promise<{ id: string; kind: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { id, kind } = await params;
  // NTH2 7.4: ?lang=de|en|fr|es|pl wählt die Sprache (über die Anfrage-Sprache), ?lang=both druckt Kampagnensprache und zweite Sprache nebeneinander
  const both = (await searchParams).lang === 'both';
  // Zugriff hier prüfen – Layouts schützen Seiten nicht zuverlässig (RSC-Anfragen können sie überspringen)
  await authorizePage('campaign.read', { campaignId: id });
  const locale = await adminLocale();
  // Bedienung in der Sprache der Verwaltung, die Bögen selbst in der gewählten Sprache (tr)
  const t = tFor(locale);
  if (!(kind in KINDS)) notFound();
  let state: CampaignState;
  try {
    state = currentState(id).state;
  } catch {
    notFound();
  }
  const first = originalLang(state);
  const tr: Tr = both ? bilingual(first, otherLang(first)) : { t: tFor(locale), msg: (m) => translateMessage(locale, m) };
  const phase = state.stage.kind === 'PHASE' ? state.stage.phase : null;
  // nach der letzten Phase: Entscheidungsschlacht nur als Ergebnisbogen, nach dem Ende keine Bögen mehr
  const tiebreak = state.stage.kind === 'TIEBREAK';
  const notice =
    state.stage.kind === 'ENDED'
      ? tr.t('Die Kampagne ist beendet – Befehls-, Bewegungs- und Ergebnisbögen gibt es nur während der Phasen. Endstand und Chronik stehen in der Leseansicht und im Codex.')
      : tiebreak && kind !== 'results'
        ? tr.t('Entscheidungsschlacht – es gibt keine Befehle und Bewegungen mehr, nur den Ergebnisbogen.')
        : !phase && !tiebreak
          ? tr.t('Die Kampagne läuft noch nicht – Bögen gibt es ab Phase 1.')
          : null;
  return (
    <PrintShell
      title={t('Druckbögen')}
      backHref={`/admin/c/${id}`}
      backLabel={t('Zur Kampagne')}
      tools={
        <>
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <PrintTool key={k} href={`/admin/c/${id}/sheets/${k}${both ? '?lang=both' : ''}`} active={k === kind}>
              {t(KINDS[k])}
            </PrintTool>
          ))}
          <PrintTool href={`/admin/c/${id}/player-cards`}>{t('QR-Karten der Spieler')}</PrintTool>
          {/* NTH2 7.4: Sprache der Bögen */}
          <div className="flex flex-wrap gap-1 lg:pt-2" role="group" aria-label={t('Sprache der Bögen')}>
            {[...LOCALES.map((l) => [l, LOCALE_NAMES[l]] as const), ['both', t('beide')] as const].map(([l, label]) => (
              <a
                key={l}
                href={`/admin/c/${id}/sheets/${kind}?lang=${l}`}
                className={`chip touch-44 ${(both ? l === 'both' : l === locale) ? 'border-accent text-accent' : ''}`}
                aria-current={(both ? l === 'both' : l === locale) ? 'page' : undefined}
              >
                {label}
              </a>
            ))}
          </div>
        </>
      }
    >
      <main className="bg-white p-6 text-[12px] leading-snug text-black print:p-0">
        <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { header, footer, .candles { display: none !important; } } .sheet h2 { color: #000; }`}</style>
        <div className="sheet">
          {notice ? (
            <p>{notice}</p>
          ) : kind === 'orders' && phase ? (
            <Orders state={state} phase={phase} tr={tr} />
          ) : kind === 'moves' && phase ? (
            <Moves state={state} phase={phase} tr={tr} />
          ) : (
            <Results state={state} phase={phase ?? state.meta.phaseCount} tr={tr} qr={await resultQrCodes(state, phase ?? state.meta.phaseCount, id)} />
          )}
        </div>
      </main>
    </PrintShell>
  );
}

function Header({ state, title, phase, sub, t }: { state: CampaignState; title: string; phase: number; sub?: string; t: T }) {
  return (
    <div className="mb-3 border-b-2 border-black pb-1">
      <h1 className="text-lg font-bold text-black">
        {t(title)} – {t('Phase {n}', { n: phase })}
      </h1>
      <p>
        {state.meta.name}
        {sub ? ` · ${sub}` : ''}
      </p>
    </div>
  );
}

function Orders({ state, phase, tr: { t } }: { state: CampaignState; phase: number; tr: Tr }) {
  const ops = state.toggles.operations;
  const attacks = (Object.keys(ATTACK_TYPES) as AttackType[]).filter((a) => ops.attackTypes[a]);
  const alive = (pid: string) => !state.planets.find((p) => p.id === pid)?.destroyed;
  return (
    <>
      {state.alliances.map((a, i) => {
        const fleets = state.fleets.filter((f) => f.allianceId === a.id && !f.reserve && f.planetId);
        return (
          <section key={a.id} style={i > 0 ? { breakBefore: 'page' } : undefined}>
            <Header state={state} title="Befehlsbogen" phase={phase} sub={a.name} t={t} />
            <p className="mb-2">
              {t('Operationen:')} Battle Operation ({attacks.map((x) => ATTACK_TYPES[x].name).join(', ')}){ops.voidLeap && !modifierActive(state, 'NO_VOID_LEAP', phase) ? ', Void Leap' : ''}
              {ops.raiseEdifices ? ', Raise Edifices' : ''}
              {ops.logisticalAuxilia && !modifierActive(state, 'NO_LOGISTICAL_AUXILIA', phase) ? ', Logistical Auxilia' : ''}
              {ops.killTeams ? ', Deploy Kill Teams' : ''}. {t('Ohne Befehl gilt Logistical Auxilia.')}
            </p>
            {fleets.map((f) => {
              const cmd = state.players.find((p) => p.id === f.commanders[String(phase)]);
              const reach = selfOrConnected(state, a.id, f.planetId!, phase).filter(alive);
              return (
                <div key={f.id} className="mb-3 break-inside-avoid border border-black p-2">
                  <p className="font-bold">
                    {f.name} · {t('steht auf {planet}', { planet: planetName(f.planetId) })} {cmd ? `· ${t('Kommandant: {name}', { name: cmd.nickname })}` : ''}
                  </p>
                  <p>
                    {t('Ziele für Battle Operation / Kill Teams:')} {reach.map(planetName).join(', ')}
                  </p>
                  <p>
                    {/* nur Typen, die hier tatsächlich baubar sind (Limit, freie Location) */}
                    {t('Raise Edifices hier möglich:')}{' '}
                    {BUILDABLE_TYPES.filter((x) => !canBuild(state, a.id, x, f.planetId!))
                      .map((x) => INFRA[x].name)
                      .join(', ') || t('nichts (Planet voll oder Limit erreicht)')}
                  </p>
                  <div className="mt-2 grid grid-cols-[auto_1fr] items-end gap-x-2 gap-y-1">
                    <span>{t('Operation:')}</span>
                    <Box />
                    <span>{t('Ziel / Gegner:')}</span>
                    <Box />
                    <span>{t('Details:')}</span>
                    <Box />
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

function Moves({ state, phase, tr: { t } }: { state: CampaignState; phase: number; tr: Tr }) {
  const all = planetIds(state);
  return (
    <>
      {state.alliances.map((a, i) => {
        const fleets = state.fleets.filter((f) => f.allianceId === a.id && !f.reserve && f.planetId);
        return (
          <section key={a.id} style={i > 0 ? { breakBefore: 'page' } : undefined}>
            <Header state={state} title="Bewegungsbogen" phase={phase} sub={a.name} t={t} />
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-black p-1 text-left">{t('Flotte')}</th>
                  <th className="border border-black p-1 text-left">{t('Steht auf')}</th>
                  <th className="border border-black p-1 text-left">{t('Mögliche Ziele')}</th>
                  <th className="border border-black p-1 text-left">{t('Ziel')}</th>
                </tr>
              </thead>
              <tbody>
                {fleets.map((f) => {
                  const two = modifierActive(state, 'STAR_OF_VOIDFARER', phase, a.id);
                  const hop1 = all.filter((p) => connectedFor(state, a.id, f.planetId!, p, phase, 'move'));
                  const hop2 = two ? [...new Set(hop1.flatMap((h) => all.filter((p) => p !== f.planetId && connectedFor(state, a.id, h, p, phase, 'move'))))].filter((p) => !hop1.includes(p)) : [];
                  return (
                    <tr key={f.id}>
                      <td className="border border-black p-1 font-semibold">{f.name}</td>
                      <td className="border border-black p-1">{planetName(f.planetId)}</td>
                      <td className="border border-black p-1">
                        {hop1.map(planetName).join(', ') || '–'}
                        {hop2.length > 0 && (
                          <span>
                            {' '}
                            · {t('2. Schritt:')} {hop2.map(planetName).join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="w-32 border border-black p-1" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2">{t('Leer lassen = Flotte bleibt stehen.')}</p>
          </section>
        );
      })}
    </>
  );
}

/** Beide Sprachen nebeneinander: „Deutsch / English“ (gleiche Texte nur einmal) */
function bilingual(a: Locale, b: Locale): Tr {
  const ta = makeT(a);
  const tb = makeT(b);
  const pair = (x: string, y: string) => (x === y ? x : `${x} / ${y}`);
  return { t: (s, v) => pair(ta(s, v), tb(s, v)), msg: (m) => pair(translateMessage(a, m), translateMessage(b, m)) };
}

/**
 * QR-Codes der Ergebnisbögen (NTH2 1.3): je Schlacht /meldung/{kampagne}/{schlacht}. Der Code enthält keinen
 * persönlichen Link – das Handy des Spielers ergänzt seinen eigenen (gemerkt beim Öffnen des Spielerlinks).
 */
async function resultQrCodes(state: CampaignState, phase: number, campaignId: string): Promise<Record<string, string>> {
  const origin = publicOrigin(await headers());
  const out: Record<string, string> = {};
  for (const b of state.battles.filter((x) => x.phaseNumber === phase && (x.status === 'SCHEDULED' || x.status === 'PLAYED')))
    out[b.id] = await QRCode.toString(`${origin}/meldung/${campaignId}/${b.id}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  return out;
}

function Results({ state, phase, tr: { t, msg }, qr = {} }: { state: CampaignState; phase: number; tr: Tr; qr?: Record<string, string> }) {
  const battles = state.battles.filter((b) => b.phaseNumber === phase && (b.status === 'SCHEDULED' || b.status === 'PLAYED'));
  const pl = (ids: { playerId: string }[]) =>
    ids
      .map((x) => state.players.find((p) => p.id === x.playerId)?.nickname)
      .filter(Boolean)
      .join(' & ') || '__________';
  if (!battles.length) return <p>{t('Keine angesetzten Schlachten in Phase {n}.', { n: phase })}</p>;
  return (
    <>
      {battles.map((b, i) => {
        const A = state.alliances.find((a) => a.id === b.attackerAllianceId)?.name;
        const D = state.alliances.find((a) => a.id === b.defenderAllianceId)?.name;
        const sum = b.attackType ? OUTCOME_SUMMARY[b.attackType] : null;
        return (
          <section key={b.id} className="break-inside-avoid" style={i > 0 ? { breakBefore: 'page' } : undefined}>
            <Header
              state={state}
              title="Ergebnisbogen"
              phase={phase}
              sub={`${b.attackType ? ATTACK_TYPES[b.attackType].name : b.kind === 'KILL_TEAM' ? t('Kill-Team-Gefecht') : t('Gefecht')} · ${planetName(b.planetId)}`}
              t={t}
            />
            <table className="mb-3 w-full border-collapse">
              <tbody>
                <tr>
                  <td className="w-1/3 border border-black p-1">{t('Angreifer ({name})', { name: A })}</td>
                  <td className="border border-black p-1">{pl(b.attackers)}</td>
                </tr>
                <tr>
                  <td className="border border-black p-1">{t('Verteidiger ({name})', { name: D })}</td>
                  <td className="border border-black p-1">{pl(b.defenders)}</td>
                </tr>
                <tr>
                  <td className="border border-black p-1">{t('Mission')}</td>
                  <td className="border border-black p-1">
                    {msg(missionLabel(state, b))} · {t('andere:')} __________________
                  </td>
                </tr>
                <tr>
                  <td className="border border-black p-1">{t('Größe')}</td>
                  <td className="border border-black p-1">
                    {battleSizes(state).map((s) => (
                      <Check key={s.id} label={`${s.name} (${s.points})`} />
                    ))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black p-1">{t('Gespielt am')}</td>
                  <td className="border border-black p-1" />
                </tr>
                <tr>
                  <td className="border border-black p-1">{t('Siegpunkte')}</td>
                  <td className="border border-black p-1">
                    {t('Angreifer')} ______ : ______ {t('Verteidiger')} · <Check label={t('Battle Ready Angreifer (+10)')} />
                    <Check label={t('Battle Ready Verteidiger (+10)')} />
                  </td>
                </tr>
                <tr>
                  <td className="border border-black p-1">{t('Sieger')}</td>
                  <td className="border border-black p-1">
                    <Check label={t('Angreifer')} />
                    <Check label={t('Verteidiger')} />
                    <Check label={t('Unentschieden')} />
                  </td>
                </tr>
              </tbody>
            </table>
            {sum && (
              <div className="space-y-2">
                <p className="font-bold">{t('Campaign Outcome (ankreuzen und Details notieren)')}</p>
                <p>
                  <Check label={t('Angreifer siegt:')} /> {msg(sum.A)}
                </p>
                <Box />
                <p>
                  <Check label={t('Verteidiger siegt:')} /> {msg(sum.D)}
                </p>
                <Box />
                <p>
                  <Check label={t('Unentschieden:')} /> {t('Angreifer +1 PL.')}
                </p>
              </div>
            )}
            <p className="mt-4">{t('Unterschriften: Angreifer ______________ Verteidiger ______________')}</p>
            {qr[b.id] && (
              <div className="mt-4 flex items-center gap-3 border-t border-black pt-2">
                <div className="w-24 shrink-0" aria-hidden dangerouslySetInnerHTML={{ __html: qr[b.id] }} />
                <p>{t('Direkt melden: Code mit dem Handy scannen – es öffnet sich das Meldeformular dieser Schlacht auf deinem Spielerlink (den Link vorher einmal auf dem Handy öffnen).')}</p>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
