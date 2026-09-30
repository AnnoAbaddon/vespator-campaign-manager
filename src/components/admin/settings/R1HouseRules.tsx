'use client';

import type { RuleToggles } from '@/engine/types';
import { useT } from '@/i18n/client';

/**
 * Hausregeln des Blocks R1 im Regel-Schalter-Panel: Wiederholungssperre (A1), harte Obergrenze (A4),
 * Auswürfeln statt verfallen (B1) und freie Gefechte (B5). Standard ist jeweils das Regelbuch (aus).
 */
export function R1HouseRules({ tog, set }: { tog: RuleToggles; set: (fn: (d: RuleToggles) => void) => void }) {
  const t = useT();
  const cap = tog.loadCap ?? { maxDefences: null, maxGames: null };
  const roll = tog.unplayedRollOff ?? { enabled: false, plModifier: false };
  const free = tog.freeSkirmishes ?? { enabled: false, reward: 'STATS' as const, pointsPerWin: 1, maxBonus: 3 };
  const num = (v: string) => (v ? Math.max(1, Math.floor(Number(v)) || 1) : null);
  const box = 'mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]';
  return (
    <div className="mt-3 space-y-2">
      <p className="section-title">{t('Missionen, Spiellast und Ausfälle (Hausregeln)')}</p>
      <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
        <input type="checkbox" className={box} checked={tog.missionRepeatLock ?? false} onChange={(e) => set((d) => void (d.missionRepeatLock = e.target.checked))} />
        <span>
          {t('Wiederholungssperre: dieselbe Mission nicht zweimal hintereinander (gleiche Allianz, gleiche Angriffsart)')}
          <span className="block text-[13px] text-dim">{t('Ohne Haken nur ein Hinweis. Greift nur, wenn der Missions-Pool der Angriffsart eine Alternative enthält.')}</span>
        </span>
      </label>
      <div className="text-[15px]">
        <p>{t('Harte Obergrenze je Spieler und Phase (Überschreiten nur per Override mit Begründung)')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">
            {t('Verteidigungen')}
            <input
              className="input w-20"
              type="number"
              min={1}
              value={cap.maxDefences ?? ''}
              placeholder={t('aus')}
              onChange={(e) => set((d) => void (d.loadCap = { ...cap, maxDefences: num(e.target.value) }))}
              aria-label={t('Höchstzahl Verteidigungen je Spieler und Phase')}
            />
          </label>
          <label className="flex items-center gap-2">
            {t('Schlachten')}
            <input
              className="input w-20"
              type="number"
              min={1}
              value={cap.maxGames ?? ''}
              placeholder={t('aus')}
              onChange={(e) => set((d) => void (d.loadCap = { ...cap, maxGames: num(e.target.value) }))}
              aria-label={t('Höchstzahl Schlachten je Spieler und Phase (hart)')}
            />
          </label>
        </div>
      </div>
      <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
        <input type="checkbox" className={box} checked={roll.enabled} onChange={(e) => set((d) => void (d.unplayedRollOff = { ...roll, enabled: e.target.checked }))} />
        <span>
          {t('Auswürfeln statt verfallen: ungespielte Schlachten per W6-Duell entscheiden (statt Sieg des Angreifers)')}
          <span className="block text-[13px] text-dim">{t('Gleichstand wird neu gewürfelt; der Wurf steht im Würfelprotokoll und im Phasenbericht.')}</span>
        </span>
      </label>
      {roll.enabled && (
        <label className="ml-7 flex min-h-8 items-center gap-2.5 text-[15px]">
          <input type="checkbox" className={box} checked={roll.plModifier} onChange={(e) => set((d) => void (d.unplayedRollOff = { ...roll, plModifier: e.target.checked }))} />
          {t('+1 für die Seite mit dem höheren Power Level auf dem Planeten')}
        </label>
      )}
      <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
        <input type="checkbox" className={box} checked={free.enabled} onChange={(e) => set((d) => void (d.freeSkirmishes = { ...free, enabled: e.target.checked }))} />
        <span>
          {t('Freie Gefechte: zusätzliche Spiele zwischen Allianzen ohne Operation melden')}
          <span className="block text-[13px] text-dim">{t('Spieler melden, die Gegenseite bestätigt. Zählt für Statistik und Paarungs-Historie.')}</span>
        </span>
      </label>
      {free.enabled && (
        <div className="ml-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
          <label className="flex items-center gap-2">
            {t('Belohnung')}
            <select className="select w-auto" value={free.reward} onChange={(e) => set((d) => void (d.freeSkirmishes = { ...free, reward: e.target.value === 'POINTS' ? 'POINTS' : 'STATS' }))}>
              <option value="STATS">{t('nur Statistik')}</option>
              <option value="POINTS">{t('Kampagnenpunkte')}</option>
            </select>
          </label>
          {free.reward === 'POINTS' && (
            <>
              <label className="flex items-center gap-2">
                {t('je Sieg')}
                <input
                  className="input w-20"
                  type="number"
                  min={1}
                  max={3}
                  value={free.pointsPerWin}
                  onChange={(e) => set((d) => void (d.freeSkirmishes = { ...free, pointsPerWin: Math.min(3, num(e.target.value) ?? 1) }))}
                  aria-label={t('Punkte je Sieg')}
                />
              </label>
              <label className="flex items-center gap-2">
                {t('Deckel je Allianz')}
                <input
                  className="input w-20"
                  type="number"
                  min={1}
                  max={10}
                  value={free.maxBonus}
                  onChange={(e) => set((d) => void (d.freeSkirmishes = { ...free, maxBonus: Math.min(10, num(e.target.value) ?? 1) }))}
                  aria-label={t('Höchster Bonus je Allianz')}
                />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
