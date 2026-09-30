'use client';

import { useState } from 'react';
import type { Battle } from '@/engine/types';
import { tableOptionsAction, type TableAccess } from '@/app/actions/club';
import type { TableOption } from '@/server/club';
import { useCmd } from '@/components/admin/CommandProvider';
import { useMsg, useT } from '@/i18n/client';

/**
 * Spieltisch zum vereinbarten Termin (NTH2 2.5) – für Spieler (über ihren Link) und die Spielleitung.
 * Die Tischliste samt Belegung wird erst beim Öffnen geladen; belegte Tische sind gesperrt und nennen
 * die kollidierende Schlacht (Prüfung über alle laufenden Kampagnen des Clubs).
 */
export function TablePick({ battle: b, access, playerId }: { battle: Battle; access: TableAccess; playerId: string | null }) {
  const { run, busy, readOnly } = useCmd();
  const t = useT();
  const msg = useMsg();
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<TableOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    const r = await tableOptionsAction(access, b.id);
    if (r.ok) setTables(r.tables);
    else setError(msg(r.error));
  };
  const toggle = () => {
    if (!open) void load();
    setOpen(!open);
  };
  const choose = async (tb: TableOption | null) => {
    if (await run({ type: 'BATTLE_TABLE_SET', battleId: b.id, playerId, table: tb ? { id: tb.id, name: tb.name } : null })) setOpen(false);
    else void load();
  };
  return (
    <div className="space-y-1.5 text-[15px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-dim">{t('Spieltisch:')}</span>
        {b.table ? <b>{b.table.name}</b> : <span className="text-faint">{t('keiner')}</span>}
        {!readOnly && (
          <button type="button" className="btn btn-sm btn-ghost min-h-11" aria-expanded={open} onClick={toggle}>
            {b.table ? t('Tisch ändern') : t('Tisch wählen')}
          </button>
        )}
      </div>
      {open && (
        <div className="inset space-y-1.5 p-2">
          {error && <p className="text-warn">{error}</p>}
          {!tables && !error && <p className="text-faint">{t('Lade …')}</p>}
          {tables && !tables.length && <p className="text-faint">{t('Der Club hat noch keine Spieltische eingerichtet (Verwaltung → Kalender).')}</p>}
          {tables && tables.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {tables.map((tb) => (
                <li key={tb.id}>
                  <button
                    type="button"
                    className={`btn btn-sm min-h-11 ${b.table?.id === tb.id ? 'btn-primary' : ''}`}
                    disabled={busy || tb.busy.length > 0 || b.table?.id === tb.id}
                    title={tb.busy.length ? `${t('belegt:')} ${tb.busy.map(msg).join('; ')}` : undefined}
                    onClick={() => choose(tb)}
                  >
                    {tb.name}
                    {tb.busy.length > 0 && <span className="text-warn"> ({t('belegt')})</span>}
                  </button>
                </li>
              ))}
              {b.table && (
                <li>
                  <button type="button" className="btn btn-sm btn-ghost min-h-11" disabled={busy} onClick={() => choose(null)}>
                    {t('Tisch freigeben')}
                  </button>
                </li>
              )}
            </ul>
          )}
          {tables?.some((x) => x.busy.length) && (
            <ul className="text-[14px] text-faint">
              {tables
                .filter((x) => x.busy.length)
                .map((x) => (
                  <li key={x.id}>
                    {x.name}: {x.busy.join('; ')}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
