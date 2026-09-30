'use client';

import { useIntlLocale, useT } from '@/i18n/client';
import { useNow } from './useNow';

export interface Deadline {
  label: string;
  at: string | null | undefined;
}

/**
 * Fristen als kompakte Zeilen „Bezeichnung | Datum · Restzeit“. Datum und Restzeit sind je eine feste Einheit
 * (umbrochen wird höchstens dazwischen, nie mitten in „noch 29 T 22 Std“). Die Restzeit erscheint erst im
 * Browser (keine Hydrationsabweichung); unter drei Tagen in Bernstein, überfällig in Rot.
 */
export function Deadlines({ items, timeZone, className = '' }: { items: Deadline[]; timeZone?: string; className?: string }) {
  const t = useT();
  const il = useIntlLocale();
  const now = useNow();
  const list = items.filter((d) => d.at);
  if (!list.length) return null;
  return (
    <dl className={`grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-[15px] ${className}`}>
      {list.map((d) => {
        const at = new Date(d.at!);
        const ms = now == null ? null : at.getTime() - now;
        const abs = Math.abs(ms ?? 0);
        const days = Math.floor(abs / 86400000);
        const hours = Math.floor((abs % 86400000) / 3600000);
        const span = { d: days ? t('{n} T ', { n: days }) : '', h: hours };
        const rest = ms == null ? null : ms < 0 ? t('vor {d}{h} Std', span) : t('noch {d}{h} Std', span);
        const tone = ms == null ? 'text-dim' : ms < 0 ? 'text-danger' : ms < 3 * 86400000 ? 'text-warn' : 'text-accent';
        return (
          <div key={d.label} className="contents">
            <dt className="whitespace-nowrap text-dim">{d.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="whitespace-nowrap font-mono text-[14px] text-ink">{at.toLocaleString(il, { timeZone, dateStyle: 'short', timeStyle: 'short' })}</span>
              {rest && (
                <span suppressHydrationWarning className={`whitespace-nowrap text-[14px] font-semibold ${tone}`}>
                  {rest}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
