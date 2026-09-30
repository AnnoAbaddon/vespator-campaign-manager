'use client';

import type { RuleToggles } from '@/engine/types';
import { DEFAULT_GRAND_BONUS, END_SCORING_LABEL, type EndScoringMode } from '@/engine/finale';
import { mapOf } from '@/engine/map';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Schalter des Blocks R2 im Regel-Schalter-Panel: Nebel über dem Punktestand (C1), alternative Endwertung
 * (C2), Großschlacht (C6) sowie Spielerbetreuung und Erzählung (B2, B4, C4, C5). Standard ist jeweils aus
 * bzw. das Regelbuch.
 */
export function R2Rules({ tog, set }: { tog: RuleToggles; set: (fn: (d: RuleToggles) => void) => void }) {
  const t = useT();
  const { state } = useCmd();
  const box = 'mt-0.5 h-4 w-4 shrink-0 accent-[#dda94d]';
  const mode = tog.endScoring?.mode ?? 'BOOK';
  const grand = tog.grandFinale ?? { enabled: false, bonus: DEFAULT_GRAND_BONUS.slice(0, state.meta.allianceCount) };
  const nar = tog.narrative ?? {};
  const weights = tog.endScoring?.planetWeights ?? {};
  const places = Array.from({ length: state.meta.allianceCount }, (_, i) => i);
  const narrative: [keyof NonNullable<RuleToggles['narrative']>, string, string][] = [
    ['pulse', 'Phasen-Puls: Spieler bewerten jede Phase (Spaß 1–5, Zeit, Kommentar)', 'Übersicht unter Allianzen & Spieler · Abwesenheit & Wechsel.'],
    ['secretGoals', 'Geheime persönliche Ziele: Spieler wählen selbst aus der Zielliste', 'Zuteilen kann der Warmaster immer; Liste unter Allianzen & Spieler · Ziele & Finale.'],
    ['nemesis', 'Nemesis: Spieler wählen einen Rivalen; der Verteidigervorschlag bevorzugt diese Paarung einmal', ''],
    ['lateJoinBonus', 'Startbonus für Nachzügler: Ehrung „Späte Verstärkung“ für den Kommandanten', ''],
  ];
  return (
    <div className="mt-3 space-y-2">
      <p className="section-title">{t('Punktestand und Endwertung (Hausregeln)')}</p>
      <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
        <input type="checkbox" className={box} checked={tog.fog ?? false} onChange={(e) => set((d) => void (d.fog = e.target.checked))} />
        <span>
          {t('Nebel über dem Punktestand: Leseansicht und Spielerlinks zeigen nur Rangfolge und Tendenz')}
          <span className="block text-[13px] text-dim">{t('Die Engine rechnet exakt weiter (Schwellen der Events bleiben korrekt). Mit dem Kampagnenende wird aufgedeckt.')}</span>
        </span>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-[15px]">
        {t('Endwertung')}
        <select className="select w-auto" value={mode} onChange={(e) => set((d) => void (d.endScoring = e.target.value === 'BOOK' ? undefined : { ...d.endScoring, mode: e.target.value as EndScoringMode }))}>
          {(Object.keys(END_SCORING_LABEL) as EndScoringMode[]).map((m) => (
            <option key={m} value={m}>
              {t(END_SCORING_LABEL[m])}
            </option>
          ))}
        </select>
      </label>
      {mode !== 'BOOK' && <p className="notice text-[14px]">{t('Abweichung vom Buch: Der Sieger wird nicht nach Kampagnenpunkten ermittelt. Gleichstände entscheiden weiter Stronghold und Entscheidungsschlacht.')}</p>}
      {mode === 'PLANETS' && (
        <details className="fold">
          <summary>{t('Gewicht je Planet (Standard 1)')}</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 @lg:grid-cols-3">
            {mapOf(state).planets.map((p) => (
              <label key={p.id} className="flex items-center justify-between gap-2 text-[14px]">
                <span className="truncate">{p.name}</span>
                <input
                  className="input w-16"
                  type="number"
                  min={0}
                  max={10}
                  value={weights[p.id] ?? 1}
                  onChange={(e) => set((d) => void (d.endScoring = { mode: 'PLANETS', planetWeights: { ...d.endScoring?.planetWeights, [p.id]: Math.max(0, Math.min(10, Math.floor(Number(e.target.value)) || 0)) } }))}
                  aria-label={t('Gewicht {name}', { name: p.name })}
                />
              </label>
            ))}
          </div>
        </details>
      )}
      <label className="flex min-h-8 items-start gap-2.5 text-[15px]">
        <input type="checkbox" className={box} checked={grand.enabled} onChange={(e) => set((d) => void (d.grandFinale = { ...grand, enabled: e.target.checked }))} />
        <span>
          {t('Finale „Großschlacht“ aller Allianzen in der letzten Phase')}
          <span className="block text-[13px] text-dim">{t('Ergebnis je Tisch bzw. Ziel; die Platzierung bringt Punkte für die Endwertung (nicht für die Kampagnenpunkte).')}</span>
        </span>
      </label>
      {grand.enabled && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-7 text-[15px]">
          {places.map((i) => (
            <label key={i} className="flex items-center gap-2">
              {t('Platz {n}', { n: i + 1 })}
              <input
                className="input w-16"
                type="number"
                min={0}
                max={20}
                value={grand.bonus[i] ?? 0}
                onChange={(e) =>
                  set((d) => {
                    const bonus = places.map((j) => grand.bonus[j] ?? 0);
                    bonus[i] = Math.max(0, Math.min(20, Math.floor(Number(e.target.value)) || 0));
                    d.grandFinale = { ...grand, bonus };
                  })
                }
                aria-label={t('Bonus für Platz {n}', { n: i + 1 })}
              />
            </label>
          ))}
        </div>
      )}
      <p className="section-title mt-3">{t('Spielerbetreuung und Erzählung')}</p>
      {narrative.map(([k, label, hint]) => (
        <label key={k} className="flex min-h-8 items-start gap-2.5 text-[15px]">
          <input type="checkbox" className={box} checked={nar[k] ?? false} onChange={(e) => set((d) => void (d.narrative = { ...d.narrative, [k]: e.target.checked }))} />
          <span>
            {t(label)}
            {hint && <span className="block text-[13px] text-dim">{t(hint)}</span>}
          </span>
        </label>
      ))}
      <p className="text-[13px] text-faint">{t('Abwesenheit, Flottenübergabe und Sonderziele sind immer verfügbar; sie ändern keine Regel.')}</p>
    </div>
  );
}
