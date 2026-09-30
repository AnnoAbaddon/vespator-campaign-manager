'use client';

import { useState } from 'react';
import type { Battle } from '@/engine/types';
import { house } from '@/engine/houseRules';
import { rollOffActive } from '@/engine/unplayedRoll';
import { AttackIcon, Empty, fmtDate } from '@/components/ui';
import { useIntlLocale, useT, useLocale } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { useMapFocus } from '../mapFocus';
import { BattleEditor } from './BattleEditor';
import { BattleSides, battleTitle, StatusChip, victorLabel, vpText } from './common';

const UNPLAYED: { id: 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'VOID' | 'POSTPONED'; label: string }[] = [
  { id: 'ATTACKER_WINS', label: 'Angreifer siegt (Regel)' },
  { id: 'DEFENDER_WINS', label: 'Verteidiger siegt' },
  { id: 'VOID', label: 'Verfällt' },
  { id: 'POSTPONED', label: 'In nächste Phase verschieben' },
];

/** Liste von Schlachten mit Inline-Editor, optional Bündeln und Ungespielt-Wertung */
export function BattleList({
  battles,
  bundling = false,
  unplayed = false,
  openId,
  onOpenChange,
}: {
  battles: Battle[];
  bundling?: boolean;
  unplayed?: boolean;
  /** geöffnete Schlacht von außen steuern (Sprung aus der Übersicht) */
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
}) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const lc = useLocale();
  const il = useIntlLocale();
  const focus = useMapFocus();
  const [openLocal, setOpenLocal] = useState<string | null>(null);
  const open = openId !== undefined ? openId : openLocal;
  const setOpen = (id: string | null) => (onOpenChange ? onOpenChange(id) : setOpenLocal(id));
  const [sel, setSel] = useState<string[]>([]);
  // B12: mit Hausregel F-8 (keine Bündelung) gibt es kein Bündeln-Werkzeug
  const bundle = bundling && !house(state, 'F8_NO_BUNDLING');
  if (!battles.length) return <Empty>{t('Keine Schlachten.')}</Empty>;

  // nur noch bündelbare Schlachten zählen zur Auswahl (Status kann sich inzwischen geändert haben)
  const selectable = new Set(battles.filter((b) => b.status === 'SCHEDULED' || b.status === 'PLAYED').map((b) => b.id));
  const selIds = sel.filter((id) => selectable.has(id));
  const selBattles = battles.filter((b) => selIds.includes(b.id));
  const canBundle =
    selBattles.length >= 2 &&
    selBattles.every(
      (b) =>
        b.planetId === selBattles[0].planetId &&
        b.attackerAllianceId === selBattles[0].attackerAllianceId &&
        b.defenderAllianceId === selBattles[0].defenderAllianceId &&
        b.attackType === selBattles[0].attackType &&
        (b.status === 'SCHEDULED' || b.status === 'PLAYED'),
    );

  return (
    <div className="space-y-2">
      {bundle && (
        <div className="inset flex flex-wrap items-center gap-2 p-2 text-[15px]">
          <button
            className="btn btn-sm"
            disabled={!canBundle || busy}
            onClick={async () => {
              if (await run({ type: 'BATTLE_BUNDLE', battleIds: selIds })) setSel([]);
            }}
          >
            {t('Auswahl bündeln (2v2)')}
          </button>
          <span className="text-[13px] text-faint">{t('Nur gleicher Planet, gleiche Allianzen und gleicher Attack Type.')}</span>
        </div>
      )}
      {battles.map((b) => {
        const isOpen = open === b.id;
        return (
          <div key={b.id} id={`battle-${b.id}`} className="slab scroll-mt-2" data-active={isOpen ? 'true' : undefined}>
            <div className="flex flex-wrap items-center gap-2 p-2">
              {bundle && b.kind === 'CAMPAIGN' && (b.status === 'SCHEDULED' || b.status === 'PLAYED') && (
                <input
                  type="checkbox"
                  aria-label={t('Zum Bündeln auswählen')}
                  className="h-5 w-5"
                  checked={sel.includes(b.id)}
                  onChange={(e) => setSel((s) => (e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))}
                />
              )}
              <button
                className="flex min-h-10 min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : b.id);
                  if (b.planetId) focus.setSelected(b.planetId);
                }}
              >
                {/* kompakt auch in der schmalen Auftragsspalte: Titel einzeilig, Zusatzangaben in der Meta-Zeile */}
                <span className="flex w-full min-w-0 items-center gap-2 text-[16px] font-semibold text-ink">
                  <AttackIcon type={b.attackType} />
                  <span className="min-w-0 flex-1 truncate" title={battleTitle(b, t)}>
                    {battleTitle(b, t)}
                  </span>
                  <StatusChip status={b.status} />
                </span>
                <span className="text-[14px] text-dim">
                  <BattleSides state={state} b={b} />
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-dim">
                  {b.draft && (
                    <span className={`chip ${b.draft.status === 'DISPUTED' ? 'border-danger text-danger' : 'border-accent text-accent'}`}>
                      {b.draft.status === 'DISPUTED' ? t('Ergebnis angefochten') : t('Ergebnis gemeldet')}
                    </span>
                  )}
                  {b.operationIds.length > 1 && <span className="chip">{t('{n}× Op', { n: b.operationIds.length })}</span>}
                  <span>
                    {b.playedAt
                      ? fmtDate(b.playedAt, true, lc)
                      : b.scheduledAt
                        ? t('Termin {date}', { date: new Date(b.scheduledAt).toLocaleString(il, { timeZone: state.meta.timezone, dateStyle: 'short', timeStyle: 'short' }) })
                        : t('nicht gespielt')}{' '}
                    {vpText(b) && `· ${vpText(b)}`} · {victorLabel(state, b, t)}
                  </span>
                </span>
              </button>
              {b.operationIds.length > 1 && (b.status === 'SCHEDULED' || b.status === 'PLAYED') && (
                <select className="select w-auto" value="" aria-label={t('Operation aus der Bündelung lösen')} onChange={(e) => e.target.value && run({ type: 'BATTLE_UNBUNDLE', battleId: b.id, opId: e.target.value })}>
                  <option value="">{t('Op lösen…')}</option>
                  {b.operationIds.map((o, i) => (
                    <option key={o} value={o}>
                      {t('Operation {n}', { n: i + 1 })}
                    </option>
                  ))}
                </select>
              )}
              {unplayed && b.kind === 'CAMPAIGN' && b.status === 'SCHEDULED' && (
                <select
                  className="select w-auto"
                  value=""
                  aria-label={t('Ungespielt werten')}
                  onChange={(e) => {
                    // B1: Hausregel „Auswürfeln statt verfallen“ – W6-Duell ohne Begründung (die Hausregel ist der Regelfall)
                    if (e.target.value === 'ROLL_OFF') return void run({ type: 'BATTLE_ROLL_OFF', battleId: b.id });
                    const u = UNPLAYED.find((x) => x.id === e.target.value);
                    // SPEC 9.5: ungespielt werten / verschieben nur mit Begründung (Pflicht, wird geloggt)
                    // „Angreifer siegt“ ist der Regelfall und braucht keine Begründung
                    if (u) run({ type: 'BATTLE_UNPLAYED', battleId: b.id, resolution: u.id }, u.id === 'ATTACKER_WINS' ? {} : { reasonTitle: t('Begründung: {what}', { what: t(u.label) }) });
                  }}
                >
                  <option value="">{t('Ungespielt werten…')}</option>
                  {rollOffActive(state) && <option value="ROLL_OFF">{t('Auswürfeln (W6-Duell, Hausregel)')}</option>}
                  {UNPLAYED.map((u) => (
                    <option key={u.id} value={u.id}>
                      {t(u.label)}
                    </option>
                  ))}
                </select>
              )}
              {(b.status === 'UNPLAYED_RESOLVED' || b.status === 'VOID') && (
                <button className="btn btn-sm" disabled={busy} onClick={() => run({ type: 'BATTLE_REOPEN', battleId: b.id })}>
                  {t('Wieder öffnen')}
                </button>
              )}
            </div>
            {isOpen && (
              <div className="border-t border-[#665333]/50 p-3">
                <BattleEditor battle={b} onClose={() => setOpen(null)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
