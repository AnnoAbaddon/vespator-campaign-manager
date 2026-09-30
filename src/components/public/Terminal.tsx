import type { CampaignState } from '@/engine/types';
import { FogStandings } from './R2Public';
import { CreditsLink } from '@/components/CreditsLink';
import { FadeScroll } from '@/components/FadeScroll';
import { DEFAULT_LOCALE, makeT, type Locale } from '@/i18n/core';
import type { StageTrack } from './stageSteps';
import { StageProgress } from '@/components/StageProgress';

/**
 * Bausteine des Kommandoterminals für Leseansicht, Spielerseite und Hall of Fame (ohne Hooks, damit sie
 * in Server- und Client-Komponenten passen). Vorbild ist das Admin-Cockpit (AdminCampaign).
 */

/** Rasterklassen des Terminals: Kopfzeile + drei Spalten (Desktop), eine Ansicht mit Leiste unten (mobil).
 * Die zweite Fuge (Klasse `bay-3`) setzen nur Seiten, die wirklich eine rechte Spalte haben – sonst läge der Steg über dem Inhalt. */
export const TERM_GRID =
  'bay-grid mx-auto h-[calc(100dvh-var(--hdr)-var(--mnav))] max-w-[1920px] px-2 pb-3 pt-3 sm:px-4 lg:grid lg:h-[calc(100dvh-var(--hdr))] lg:grid-cols-[250px_minmax(0,1fr)_440px] lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)] lg:px-[var(--gap)] lg:pb-[var(--gap)] lg:pt-[calc(var(--gap)+4px)] 2xl:grid-cols-[260px_minmax(0,1fr)_460px]';

/**
 * Linke Leiste wie im Cockpit: Kopf und Navigation fest oben, nur die Schrittfolge (`steps`) scrollt bei
 * Platzmangel, `pinned` (z. B. Aktionen) bleibt darunter immer sichtbar; Kathedrale im freien Raum, Nachweise unten.
 */
export function TermAside({ children, steps, pinned, locale, label }: { children: React.ReactNode; steps?: React.ReactNode; pinned?: React.ReactNode; locale: Locale; label: string }) {
  return (
    <aside className="no-print hidden min-h-0 lg:block">
      <nav tabIndex={-1} className="hud frame flex h-full flex-col gap-3 overflow-hidden p-3 pt-4" aria-label={label}>
        <FadeScroll className={`relative z-[1] space-y-4 ${steps ? 'shrink-0' : 'min-h-0 overflow-y-auto pr-0.5'}`}>{children}</FadeScroll>
        {steps && (
          <FadeScroll className="relative z-[1] min-h-[88px] shrink overflow-y-auto pr-0.5" tabIndex={0} role="region" aria-label={makeT(locale)('Schrittfolge')}>
            {steps}
          </FadeScroll>
        )}
        {pinned && <div className="relative z-[1] shrink-0">{pinned}</div>}
        {/* Kathedrale füllt nur freien Platz und verdrängt nichts */}
        <div
          aria-hidden
          className="pointer-events-none relative -mx-3 -mb-3 min-h-0 flex-1 bg-[url('/ui/cathedral.webp')] bg-[length:100%_auto] bg-bottom bg-no-repeat opacity-80 [mask-image:linear-gradient(180deg,transparent,#000_35%)]"
        />
        <CreditsLink locale={locale} className="relative z-[1] -mt-2 text-center" />
      </nav>
    </aside>
  );
}

/**
 * Große Einhausung mit Messingschild; der Inhalt scrollt innen und läuft bei weiterem Inhalt unten aus.
 * Mobil ist sie der einzige Rahmen: Module darin werden zu Abschnitten mit Trennlinie (admin-flat).
 */
export function Housing({
  title,
  children,
  className = '',
  bodyClass = '',
  actions,
  label,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
  actions?: React.ReactNode;
  label?: string;
}) {
  return (
    <div role="region" aria-label={label ?? (typeof title === 'string' ? title : undefined)} className={`hud frame admin-flat relative flex h-full min-h-0 flex-col p-2 pt-6 sm:p-3 sm:pt-6 ${className}`}>
      <span className="plate plate-head">{title}</span>
      <span className="emblem-watermark" aria-hidden />
      {actions && <div className="no-print relative z-[1] mb-2 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      <FadeScroll className={`term-body relative z-[1] min-h-0 flex-1 overflow-y-auto sm:pr-1 ${bodyClass}`} tabIndex={0}>
        {children}
      </FadeScroll>
    </div>
  );
}

/** Nummerierte Schrittfolge der aktuellen Stufe (nur lesend, wie im Cockpit) */
export function StepTrack({ track }: { track: StageTrack }) {
  if (!track.items.length) return null;
  return (
    <div>
      <p className="section-title">{track.listTitle ?? track.title}</p>
      <ol className="space-y-0.5">
        {track.items.map((it, i) => (
          <li
            key={it.key}
            className={`flex items-center gap-2.5 text-[15px] ${it.status === 'current' ? 'font-semibold text-ink' : it.status === 'done' ? 'text-dim' : 'text-faint'}`}
            aria-current={it.status === 'current' ? 'step' : undefined}
          >
            <span
              aria-hidden
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-display text-[12px] font-bold ${
                it.status === 'current'
                  ? 'bg-[radial-gradient(circle_at_35%_35%,#ffe9b5,#dda94d_60%,#7a5418)] text-black shadow-[0_0_10px_rgba(221,169,77,0.7),0_0_0_2px_#b3975f]'
                  : it.status === 'done'
                    ? 'bg-[#1d2220] text-brass shadow-[inset_0_0_0_1px_#b3975f]'
                    : 'bg-[#121514] text-faint shadow-[inset_0_0_0_1px_#3a3a33]'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Kampagnenstatus für die Kopfzeile (Portal-Ziel #hdr-status): Kampagnenphase und Schritt getrennt */
export function StageStatus({ track, locale = DEFAULT_LOCALE }: { track: StageTrack; locale?: Locale }) {
  return <StageProgress track={track} locale={locale} />;
}

/** Dezente Kartenornamente und echte Kenndaten (keine Maus-/Touchereignisse) */
export function SectorDecor({ name, stage, planets, locale }: { name: string; stage: string; planets: number; locale: Locale }) {
  const t = makeT(locale);
  return (
    // `sector-decor`: im Detailmodus blendet globals.css den Kartenschmuck aus (wie im Admin)
    <div aria-hidden className="sector-decor pointer-events-none absolute inset-0 z-0 hidden select-none lg:block">
      <div className="absolute left-5 top-5 h-[64px] w-[150px] bg-[url('/ui/emblem-winged.webp')] bg-contain bg-no-repeat opacity-[0.12] [filter:sepia(1)_hue-rotate(110deg)_saturate(2)]" />
      <svg className="absolute bottom-5 right-6 h-24 w-24 opacity-25" viewBox="-50 -50 100 100">
        <g fill="none" stroke="#5fa08c" strokeWidth="1">
          <circle r="30" />
          <circle r="22" strokeDasharray="2 3" />
          <path d="M0 -46 L6 -6 L0 0 L-6 -6 Z M0 46 L6 6 L0 0 L-6 6 Z M-46 0 L-6 -6 L0 0 L-6 6 Z M46 0 L6 -6 L0 0 L6 6 Z" fill="#37685b" fillOpacity="0.5" />
        </g>
      </svg>
      <div className="absolute bottom-4 left-5 font-mono text-[12px] leading-5 text-[#6fa593]">
        <div>{t('Sektor: {name}', { name })}</div>
        <div>{stage}</div>
        <div>{t('Welten: {n}', { n: planets })}</div>
      </div>
    </div>
  );
}

/** Kampagnenpunkte je Allianz als Leiste unter der Karte (letzter veröffentlichter Stand) */
export function PointsBar({ state, locale, children }: { state: CampaignState; locale: Locale; children?: React.ReactNode }) {
  const t = makeT(locale);
  const last = state.pointsHistory.at(-1);
  return (
    <div className="no-print relative z-[1] flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2 text-[14px] text-dim">
      {children}
      {/* C1: Nebel über dem Punktestand – Rangfolge und Tendenz statt Punkten */}
      {state.fog ? (
        <span className="ml-auto">
          <FogStandings state={state} locale={locale} compact />
        </span>
      ) : (
        <span className="ml-auto flex flex-wrap items-center gap-3" aria-label={t('Kampagnenpunkte')}>
          {state.alliances.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_6px_currentColor]" style={{ background: a.color, color: a.color }} />
              <span className="text-ink">{a.name}</span> <b className="font-mono text-[15px] text-ink">{last?.points[a.id] ?? '–'}</b>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Taste der mobilen Leiste */
export function MobileKey({ label, icon, on, badge }: { label: string; icon: React.ReactNode; on: boolean; badge?: number }) {
  return (
    <>
      {icon}
      <span className="max-w-full truncate px-0.5">{label}</span>
      {on && <span className="absolute inset-x-4 top-0 h-0.5 bg-accent shadow-[0_0_6px_#dda94d]" aria-hidden />}
      {badge ? <span className="absolute right-2 top-1.5 rounded-[2px] bg-warn px-1 font-mono text-[10px] text-black">{badge}</span> : null}
    </>
  );
}

export const MOBILE_KEY_CLASS = 'relative flex min-w-0 flex-col items-center justify-center gap-0.5 text-[12px]';
export const MOBILE_NAV_CLASS = 'no-print fixed inset-x-0 bottom-0 z-50 grid h-[var(--mnav)] border-t border-brass/40 bg-[#0d1110] shadow-[0_-1px_0_#050707] lg:hidden';

type IconProps = { size?: number; className?: string };

/** Sanduhr (Zeitraffer) im Stil der Liniensymbole */
export function HourglassIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 1.5h9M3.5 14.5h9M4.5 1.5c0 3.5 3.5 4.5 3.5 6.5S4.5 11 4.5 14.5M11.5 1.5c0 3.5-3.5 4.5-3.5 6.5s3.5 3 3.5 6.5" />
    </svg>
  );
}

/** Fragezeichen im Kreis (FAQ) */
export function QuestionIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.6" />
      <path d="M8 11.6v.1" />
    </svg>
  );
}
