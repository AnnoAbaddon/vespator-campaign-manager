'use client';

import { createContext, useContext, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CalendarEntry, ClubTable } from '@/server/club';
import { Tabs } from '@/components/ui';
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, WarnIcon } from '@/components/icons';
import { CopyField } from '@/components/admin/settings/CopyField';
import { regenerateClubCalendarAction, saveClubTablesAction } from '@/app/actions/club';
import { useIntlLocale, useMsg, useT } from '@/i18n/client';

/**
 * Club-Kalender (NTH2 2.5): alle vereinbarten Schlachten aller laufenden Kampagnen in Wochen-, Monats- und
 * Tischansicht, Kollisionen je Tisch hervorgehoben. Mitte: Kalender; rechts: Termin-Details, .ics-Abo, Tische.
 */

type Mode = 'week' | 'month' | 'tables';

interface Ctx {
  entries: CalendarEntry[];
  tables: ClubTable[];
  selected: CalendarEntry | null;
  select: (e: CalendarEntry | null) => void;
}
const CalCtx = createContext<Ctx | null>(null);
const useCal = () => useContext(CalCtx)!;

const keyOf = (e: Pick<CalendarEntry, 'campaignId' | 'battleId'>) => `${e.campaignId}:${e.battleId}`;
const DAY = 86400_000;

/** Tagesbeginn (lokale Zeit des Browsers) */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Montag der Woche */
const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - ((s.getDay() + 6) % 7));
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function CalendarProvider({ entries, tables, children }: { entries: CalendarEntry[]; tables: ClubTable[]; children: React.ReactNode }) {
  const [sel, setSel] = useState<string | null>(null);
  const selected = entries.find((e) => keyOf(e) === sel) ?? null;
  return <CalCtx.Provider value={{ entries, tables, selected, select: (e) => setSel(e ? keyOf(e) : null) }}>{children}</CalCtx.Provider>;
}

/** Hauptfläche: Umschalter, Zeitraum, Tischfilter, Kalenderraster */
export function CalendarMain() {
  const { entries, tables } = useCal();
  const t = useT();
  const il = useIntlLocale();
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [table, setTable] = useState<string>('ALL');
  const shown = entries.filter((e) => table === 'ALL' || (table === 'NONE' ? !e.tableId : e.tableId === table));
  const clashCount = entries.filter((e) => e.clashes.length).length;
  // Datumsangaben in der Zeitzone des Browsers – erst nach dem Laden im Browser rendern (kein Server-/Client-Versatz)
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!mounted) return <p className="text-faint">{t('Lade …')}</p>;

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const weekStart = startOfWeek(anchor);
  const move = (dir: -1 | 1) => setAnchor(mode === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1) : addDays(anchor, 7 * dir));
  const range =
    mode === 'month'
      ? monthStart.toLocaleDateString(il, { month: 'long', year: 'numeric' })
      : `${weekStart.toLocaleDateString(il, { day: '2-digit', month: '2-digit' })} – ${addDays(weekStart, 6).toLocaleDateString(il, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          tabs={[
            { id: 'week' as Mode, label: t('Woche') },
            { id: 'month' as Mode, label: t('Monat') },
            { id: 'tables' as Mode, label: t('Tische') },
          ]}
          value={mode}
          onChange={setMode}
          label={t('Ansicht')}
        />
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-sm min-h-11 min-w-11" onClick={() => move(-1)} aria-label={t('Zurück')}>
            <ArrowLeftIcon size={16} />
          </button>
          <button type="button" className="btn btn-sm min-h-11" onClick={() => setAnchor(startOfDay(new Date()))}>
            {t('Heute')}
          </button>
          <button type="button" className="btn btn-sm min-h-11 min-w-11" onClick={() => move(1)} aria-label={t('Weiter')}>
            <ArrowRightIcon size={16} />
          </button>
        </div>
        <span className="font-serif text-[17px] font-semibold text-ink">{range}</span>
        <select className="select ml-auto w-auto min-h-11" value={table} onChange={(e) => setTable(e.target.value)} aria-label={t('Spieltisch')}>
          <option value="ALL">{t('Alle Tische')}</option>
          {tables.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          <option value="NONE">{t('ohne Tisch')}</option>
        </select>
      </div>
      {clashCount > 0 && (
        <p className="notice flex items-center gap-2 text-[14px]">
          <WarnIcon size={16} />
          {t('{n} Termin(e) mit Tischüberschneidung', { n: clashCount })}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === 'month' ? <MonthGrid start={monthStart} entries={shown} /> : mode === 'week' ? <WeekGrid start={weekStart} entries={shown} /> : <TableWeek start={weekStart} entries={shown} />}
      </div>
    </div>
  );
}

function EntryChip({ e, compact = false }: { e: CalendarEntry; compact?: boolean }) {
  const { selected, select } = useCal();
  const il = useIntlLocale();
  const t = useT();
  const active = selected && keyOf(selected) === keyOf(e);
  const time = new Date(e.at).toLocaleTimeString(il, { hour: '2-digit', minute: '2-digit' });
  return (
    <button
      type="button"
      onClick={() => {
        select(active ? null : e);
        // mobil stehen die Details unter dem Kalender – dorthin springen
        if (!active && window.innerWidth < 1024) requestAnimationFrame(() => document.getElementById('cal-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }}
      aria-pressed={!!active}
      className={`block w-full min-h-11 border-l-2 px-1.5 py-1 text-left text-[14px] leading-snug hover:bg-white/[0.04] ${e.clashes.length ? 'border-danger bg-blood/20' : 'border-brass/70 bg-white/[0.02]'} ${active ? 'outline outline-1 outline-accent' : ''}`}
      title={`${e.title} · ${e.campaignName}${e.tableName ? ` · ${e.tableName}` : ''}${e.clashes.length ? ` · ${t('Tischüberschneidung')}` : ''}`}
    >
      <span className="font-mono text-[13px] text-accent">{time}</span> <span className="text-ink">{e.title}</span>
      {!compact && (
        <>
          <span className="block truncate text-[13px] text-dim">{e.campaignName}</span>
          {e.tableName && <span className={`block truncate text-[13px] ${e.clashes.length ? 'text-danger' : 'text-brass'}`}>{e.tableName}</span>}
        </>
      )}
    </button>
  );
}

const dayEntries = (entries: CalendarEntry[], d: Date) => entries.filter((e) => sameDay(new Date(e.at), d));

function DayHead({ d }: { d: Date }) {
  const il = useIntlLocale();
  const today = sameDay(d, new Date());
  return (
    <p className={`font-serif text-[15px] font-semibold ${today ? 'text-accent' : 'text-dim'}`}>
      {d.toLocaleDateString(il, { weekday: 'short' })} {d.toLocaleDateString(il, { day: '2-digit', month: '2-digit' })}
    </p>
  );
}

function WeekGrid({ start, entries }: { start: Date; entries: CalendarEntry[] }) {
  const t = useT();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <ol className="grid gap-1.5 md:h-full md:min-h-72 md:grid-cols-7">
      {days.map((d) => {
        const list = dayEntries(entries, d);
        return (
          <li key={d.toISOString()} className={`inset min-h-0 space-y-1 p-1.5 md:min-h-40 ${!list.length ? 'max-md:hidden' : ''}`}>
            <DayHead d={d} />
            {list.map((e) => (
              <EntryChip key={keyOf(e)} e={e} />
            ))}
          </li>
        );
      })}
      {!days.some((d) => dayEntries(entries, d).length) && <li className="p-3 text-[15px] text-faint md:hidden">{t('Keine Termine in dieser Woche.')}</li>}
    </ol>
  );
}

function MonthGrid({ start, entries }: { start: Date; entries: CalendarEntry[] }) {
  const t = useT();
  const il = useIntlLocale();
  const first = startOfWeek(start);
  const weeks = Math.ceil((start.getTime() - first.getTime() + new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate() * DAY) / (7 * DAY));
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i));
  const monthDays = days.filter((d) => d.getMonth() === start.getMonth() && dayEntries(entries, d).length);
  return (
    <>
      {/* Desktop: Monatsraster */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {days.slice(0, 7).map((d) => (
            <p key={d.toISOString()} className="text-center font-serif text-[14px] text-faint">
              {d.toLocaleDateString(il, { weekday: 'short' })}
            </p>
          ))}
        </div>
        <ol className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const list = dayEntries(entries, d);
            const other = d.getMonth() !== start.getMonth();
            return (
              <li key={d.toISOString()} className={`inset min-h-24 space-y-0.5 p-1 ${other ? 'opacity-45' : ''}`}>
                <p className={`text-right font-mono text-[13px] ${sameDay(d, new Date()) ? 'text-accent' : 'text-faint'}`}>{d.getDate()}</p>
                {list.slice(0, 3).map((e) => (
                  <EntryChip key={keyOf(e)} e={e} compact />
                ))}
                {list.length > 3 && <p className="text-[13px] text-dim">{t('+{n} weitere', { n: list.length - 3 })}</p>}
              </li>
            );
          })}
        </ol>
      </div>
      {/* Mobil: Liste der Tage mit Terminen */}
      <ol className="space-y-1.5 md:hidden">
        {monthDays.map((d) => (
          <li key={d.toISOString()} className="inset space-y-1 p-1.5">
            <DayHead d={d} />
            {dayEntries(entries, d).map((e) => (
              <EntryChip key={keyOf(e)} e={e} />
            ))}
          </li>
        ))}
        {!monthDays.length && <li className="p-3 text-[15px] text-faint">{t('Keine Termine in diesem Monat.')}</li>}
      </ol>
    </>
  );
}

/** Woche je Tisch: Zeilen = Tische (plus „ohne Tisch“), Spalten = Tage */
function TableWeek({ start, entries }: { start: Date; entries: CalendarEntry[] }) {
  const { tables } = useCal();
  const t = useT();
  const il = useIntlLocale();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rows: { id: string | null; name: string }[] = [...tables.map((x) => ({ id: x.id as string | null, name: x.name })), { id: null, name: t('ohne Tisch') }];
  const inWeek = entries.filter((e) => new Date(e.at) >= start && new Date(e.at) < addDays(start, 7));
  // Tische, die nicht mehr existieren, aber noch Termine haben
  for (const e of inWeek) if (e.tableId && !rows.some((r) => r.id === e.tableId)) rows.splice(rows.length - 1, 0, { id: e.tableId, name: e.tableName ?? '?' });
  return (
    <div className="overflow-x-auto">
      <table className="table w-full min-w-[560px] table-fixed text-[14px]">
        <thead>
          <tr>
            <th className="w-24 text-left">{t('Spieltisch')}</th>
            {days.map((d) => (
              <th key={d.toISOString()} className={`text-left ${sameDay(d, new Date()) ? 'text-accent' : ''}`}>
                {d.toLocaleDateString(il, { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? 'none'}>
              <th scope="row" className="align-top font-serif text-[15px] text-ink">
                {r.name}
              </th>
              {days.map((d) => (
                <td key={d.toISOString()} className="space-y-1 align-top">
                  {inWeek
                    .filter((e) => e.tableId === r.id && sameDay(new Date(e.at), d))
                    .map((e) => (
                      <EntryChip key={keyOf(e)} e={e} compact />
                    ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Seitenspalte: Details des gewählten Termins, .ics-Abo und Tischverwaltung */
export function CalendarSide({ icsUrl, owner, accessible }: { icsUrl: string | null; owner: boolean; accessible: string[] | 'ALL' }) {
  const { selected, select, entries } = useCal();
  const t = useT();
  const il = useIntlLocale();
  return (
    <div className="space-y-4 text-[15px]">
      {selected ? (
        <section id="cal-detail" className="inset space-y-1.5 p-3" aria-label={t('Termin')}>
          <div className="flex items-start gap-2">
            <p className="flex-1 font-display text-[16px] font-bold uppercase leading-tight text-ink">{selected.title}</p>
            <button type="button" className="btn btn-sm btn-ghost min-h-11 min-w-11" onClick={() => select(null)} aria-label={t('Schließen')}>
              <CloseIcon size={16} />
            </button>
          </div>
          <p className="text-dim">{selected.campaignName}</p>
          <p>
            <span className="font-semibold text-accent">{new Date(selected.at).toLocaleString(il, { dateStyle: 'full', timeStyle: 'short' })}</span>
          </p>
          <p>
            {selected.attacker} – {selected.defender}
          </p>
          {selected.players.length > 0 && <p className="text-dim">{selected.players.join(', ')}</p>}
          <p>
            {t('Spieltisch:')} {selected.tableName ? <b>{selected.tableName}</b> : <span className="text-faint">{t('keiner')}</span>}
          </p>
          {selected.clashes.length > 0 && (
            <div className="notice space-y-1 text-[14px]">
              <p className="flex items-center gap-1.5 font-semibold">
                <WarnIcon size={15} /> {t('Tischüberschneidung mit:')}
              </p>
              <ul>
                {selected.clashes.map((c) => {
                  const o = entries.find((x) => x.campaignId === c.campaignId && x.battleId === c.battleId);
                  return (
                    <li key={keyOf(c)}>
                      {o ? (
                        <button type="button" className="link text-left" onClick={() => select(o)}>
                          {new Date(o.at).toLocaleString(il, { dateStyle: 'short', timeStyle: 'short' })} · {o.title} ({o.campaignName})
                        </button>
                      ) : (
                        t('einer Schlacht einer anderen Kampagne')
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {(accessible === 'ALL' || accessible.includes(selected.campaignId)) && (
            <Link className="btn btn-sm min-h-11" href={`/admin/c/${selected.campaignId}`}>
              {t('Zur Kampagne')}
            </Link>
          )}
        </section>
      ) : (
        <p className="text-dim">{t('Einen Termin anklicken, um Details und Überschneidungen zu sehen. Den Spieltisch wählen Spieler und Spielleitung beim Termin der Schlacht.')}</p>
      )}
      {icsUrl && <IcsSection url={icsUrl} />}
      {owner && <TablesEditor />}
    </div>
  );
}

function useAct() {
  const router = useRouter();
  const msg = useMsg();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setNote({ ok: r.ok, text: msg(r.ok ? (r.message ?? 'Erledigt') : (r.error ?? 'Fehler')) });
      if (r.ok) router.refresh();
    });
  return { pending, act, note };
}

function IcsSection({ url }: { url: string }) {
  const t = useT();
  const { pending, act, note } = useAct();
  return (
    <section className="space-y-2 border-t border-line/60 pt-3">
      <p className="section-title">{t('Kalender-Abo (.ics)')}</p>
      <p className="text-[14px] text-dim">{t('Alle Termine aller laufenden Kampagnen mit Spieltisch als Ort. Nur lesend – der Link darf an Kalender-Apps gehen.')}</p>
      <CopyField value={url} label={t('Kalender-Abo')} masked />
      <button
        type="button"
        className="btn btn-sm btn-danger min-h-11"
        disabled={pending}
        onClick={() => confirm(t('Neuen Link erzeugen? Bestehende Abos funktionieren dann nicht mehr.')) && act(regenerateClubCalendarAction)}
      >
        {t('Link neu erzeugen')}
      </button>
      {note && <p className={`text-[14px] ${note.ok ? 'text-ok' : 'text-danger'}`}>{note.text}</p>}
    </section>
  );
}

function TablesEditor() {
  const { tables } = useCal();
  const t = useT();
  const { pending, act, note } = useAct();
  const [list, setList] = useState<{ id?: string; name: string }[]>(() => tables.map((x) => ({ ...x })));
  const dirty = useMemo(() => JSON.stringify(list.filter((x) => x.name.trim())) !== JSON.stringify(tables), [list, tables]);
  return (
    <section className="space-y-2 border-t border-line/60 pt-3">
      <p className="section-title">{t('Spieltische und Räume')}</p>
      <ul className="space-y-1.5">
        {list.map((x, i) => (
          <li key={x.id ?? `new-${i}`} className="flex gap-2">
            <input className="input min-h-11" value={x.name} maxLength={60} aria-label={t('Name des Tisches')} onChange={(e) => setList((l) => l.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
            <button type="button" className="btn btn-sm btn-ghost min-h-11 min-w-11" aria-label={t('Tisch entfernen')} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
              <CloseIcon size={16} />
            </button>
          </li>
        ))}
      </ul>
      {!list.length && <p className="text-[14px] text-faint">{t('Noch keine Tische – z. B. „Tisch 1“, „Hinterzimmer“.')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm min-h-11" onClick={() => setList((l) => [...l, { name: '' }])} disabled={list.length >= 40}>
          {t('Tisch hinzufügen')}
        </button>
        <button type="button" className="btn btn-sm btn-primary min-h-11" disabled={pending || !dirty} onClick={() => act(() => saveClubTablesAction(list))}>
          {t('Tische speichern')}
        </button>
      </div>
      {note && <p className={`text-[14px] ${note.ok ? 'text-ok' : 'text-danger'}`}>{note.text}</p>}
    </section>
  );
}
