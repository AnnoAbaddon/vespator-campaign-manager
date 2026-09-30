import { makeT, type Locale } from '@/i18n/core';
import type { StageTrack, StepStatus } from '@/components/public/stageSteps';

const lampClass = (s: StepStatus) => (s === 'current' ? 'lamp-on' : s === 'done' ? 'lamp-on opacity-60' : '');

function Lamps({ items }: { items: { key: string; label: string; status: StepStatus }[] }) {
  return (
    <span className="flex items-center gap-[5px]" aria-hidden>
      {items.map((s) => (
        <span key={s.key} title={s.label} className={`lamp h-2 w-2 ${lampClass(s.status)} ${s.status === 'current' ? 'scale-125' : ''}`} />
      ))}
    </span>
  );
}

/**
 * Fortschritt in der Kopfkonsole: Kampagnenphase (n/m) und Schritt (k/Anzahl) mit Namen ausdrücklich getrennt;
 * jede Leuchtenreihe hat genau so viele Leuchten wie die Größe, die sie darstellt. Ohne Hooks (Server und Client).
 */
export function StageProgress({ track, locale }: { track: StageTrack; locale: Locale }) {
  const t = makeT(locale);
  const idx = track.items.findIndex((s) => s.status === 'current');
  const current = idx >= 0 ? track.items[idx] : null;
  const phaseItems = track.phase
    ? Array.from({ length: track.phase.m }, (_, i) => ({
        key: `p${i + 1}`,
        label: t('Phase {n}', { n: i + 1 }),
        status: (i + 1 < track.phase!.n ? 'done' : i + 1 === track.phase!.n ? 'current' : 'open') as StepStatus,
      }))
    : null;
  const stepText = current ? t('Schritt {k}/{n}', { k: idx + 1, n: track.items.length }) : '';
  const aria = [track.phase ? t('Kampagnenphase {n}/{m}', { n: track.phase.n, m: track.phase.m }) : track.title, current ? `${stepText}: ${current.label}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="console-module flex h-[68px] min-w-[290px] max-w-[340px] flex-col justify-center py-1 pl-4 pr-4" role="status" aria-label={aria}>
      <div className="progress-row">
        {phaseItems ? (
          <>
            <span className="progress-key">
              {t('Kampagnenphase')}{' '}
              <b>
                {track.phase!.n}/{track.phase!.m}
              </b>
            </span>
            <Lamps items={phaseItems} />
          </>
        ) : (
          <span className="progress-key col-span-2 font-display text-[13px] uppercase tracking-[0.08em] text-brass">{track.title}</span>
        )}
      </div>
      {current && (
        <>
          <div className="progress-row">
            <span className="progress-key">
              {t('Schritt')}{' '}
              <b>
                {idx + 1}/{track.items.length}
              </b>
            </span>
            <Lamps items={track.items} />
          </div>
          <span className="truncate font-serif text-[15px] font-semibold leading-[19px] text-[#f3e2b4]">{current.label}</span>
        </>
      )}
    </div>
  );
}
