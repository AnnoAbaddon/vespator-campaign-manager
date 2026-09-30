'use client';

import { useRef, useState } from 'react';
import { PlanetPortrait, hasPortrait } from '@/components/map/PlanetArt';
import { usePlanetImages } from '@/components/map/planetImages';
import { INFRA, THEATRES, type InfraType } from '@/engine/data/vespator';
import { minPL } from '@/engine/board';
import { house } from '@/engine/houseRules';
import type { Slot } from '@/engine/types';
import { AllianceTag, AttackIcon } from '@/components/ui';
import { TheatreBadge } from '@/components/map/icons';
import { BoltIcon, BookIcon, ChevronIcon, NoteIcon, SaveIcon, TowerIcon, WrenchIcon } from '@/components/icons';
import { DossierHead } from '@/components/public/DossierParts';
import { GameIcon } from '@/components/icons/GameIcon';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';
import { battleTitle, StatusChip, victorLabel } from '../battles/common';
import { planetIds, planetDef } from '@/engine/map';
import { PlanetImagePicker } from '../setup/PlanetImagePicker';
import { PlanetLoreTr } from '../texts/TrFields';

/** Wert einer Location für die Auswahlliste */
const slotValue = (s: Slot) => (s.destroyed ? 'DESTROYED' : s.infra ? `${s.infra.type}|${s.infra.allianceId}` : 'FREE');

/** Eine Location: Auswahl zeigt den aktuellen Stand, eine Änderung ist ein Override des Spielleiters */
function SlotRow({ planetId, index, slot }: { planetId: string; index: number; slot: Slot }) {
  const { state, run, busy } = useCmd();
  const t = useT();
  const val = slotValue(slot);
  const al = slot.infra ? state.alliances.find((a) => a.id === slot.infra!.allianceId) : null;
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 text-center font-mono text-[14px] text-dim">{index + 1}</span>
      <span
        aria-hidden
        className="lamp h-3 w-3"
        style={slot.destroyed ? { background: '#5a1414' } : al ? { background: al.color, boxShadow: `0 0 8px ${al.color}, 0 0 0 1px #050707, 0 0 0 2px rgba(179,151,95,0.5)` } : undefined}
      />
      <select
        className="select py-1"
        value={val}
        disabled={busy}
        aria-label={t('Location {n} (Override)', { n: index + 1 })}
        onChange={(e) => {
          const v = e.target.value;
          if (v === val) return;
          if (v === 'FREE') run({ type: 'OVERRIDE_SLOT', planetId, slot: index, destroyed: false, infra: null });
          else if (v === 'DESTROYED') run({ type: 'OVERRIDE_SLOT', planetId, slot: index, destroyed: true, infra: null });
          else {
            const [type, allianceId] = v.split('|');
            run({ type: 'OVERRIDE_SLOT', planetId, slot: index, destroyed: false, infra: { type: type as InfraType, allianceId } });
          }
        }}
      >
        <option value="FREE">{t('Frei')}</option>
        <option value="DESTROYED">{t('Zerstört')}</option>
        {state.alliances.map((a) =>
          (Object.keys(INFRA) as InfraType[]).map((x) => (
            <option key={`${x}|${a.id}`} value={`${x}|${a.id}`}>
              {INFRA[x].name} ({a.name})
            </option>
          )),
        )}
      </select>
    </div>
  );
}

/** Abschnitt der Planetenakte: kompakte Stahlfläche mit kleiner Überschrift (wie PlanetDossier) */
function Section({ icon, title, children, extra }: { icon: React.ReactNode; title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="dossier-sec">
      <h3 className="dossier-h">
        <span className="text-brass">{icon}</span>
        <span className="flex-1">{title}</span>
        {extra}
      </h3>
      <div className="relative z-[1]">{children}</div>
    </section>
  );
}

/**
 * Planetenakte (Designreferenz): Name und System, Landschaftsbild, Umgebungstypen, Power Level,
 * Infrastruktur, Flotten, öffentliche Lore und private SL-Notiz mit Speichern, danach einklappbar
 * Schlachten und Verwaltung (Overrides). Der Aktionsbereich (Texte + Speichern) steht damit immer an
 * derselben Stelle direkt nach den festen Planetendaten – unabhängig von der Zahl der Schlachten.
 */
export function PlanetPanel({ planetId, onClose, head = true }: { planetId: string; onClose: () => void; head?: boolean }) {
  const { state, run, busy, campaignId, readOnly } = useCmd();
  const t = useT();
  const planetImages = usePlanetImages();
  const def = planetDef(planetId)!;
  const ps = state.planets.find((p) => p.id === planetId)!;
  const fleets = state.fleets.filter((f) => f.planetId === planetId);
  const battles = state.battles.filter((b) => b.planetId === planetId).sort((a, b) => b.createdSeq - a.createdSeq);
  // Landschaftsbilder gibt es nur für die unveränderten Vespator-Welten (N6)
  const land = ps.landscape ? `/api/uploads/${ps.landscape}` : planetImages !== false && hasPortrait(planetId) ? `/ui/land/${planetId}.webp` : null;
  // Höchstwert wie in der Engine (Hausregel F-17 erlaubt 5)
  const maxPl = house(state, 'F17_PL_FIVE') ? 5 : 4;

  return (
    <article className="relative space-y-2" aria-label={t('Planetenakte {name}', { name: def.name })}>
      {head && <DossierHead name={def.name} system={def.system} onClose={onClose} closeLabel={t('Planetenakte schließen')} />}

      <div className="bezel overflow-hidden">
        {land ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={land} alt="" className={`block h-[clamp(96px,13.5vh,150px)] w-full object-cover object-[50%_40%] ${ps.destroyed ? 'grayscale-[0.8] brightness-50 sepia-[0.3]' : ''}`} loading="lazy" />
        ) : (
          <div className="screen flex h-[clamp(96px,13.5vh,150px)] items-center justify-center">
            <PlanetPortrait planetId={planetId} size={90} destroyed={ps.destroyed} planetImages={planetImages} image={ps.portrait} />
          </div>
        )}
        {ps.destroyed && <span className="absolute left-3 top-3 z-[4] rounded-[2px] bg-[#5a1414]/90 px-2 py-0.5 font-display text-[13px] font-bold uppercase tracking-wider text-[#ffd0c9]">{t('Zerstört')}</span>}
      </div>

      <ul className="theatres" aria-label={t('Umgebungstypen')}>
        {def.theatres.map((th) => (
          <li key={th}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0e1211] shadow-[inset_0_0_0_1px_#b3975f,0_0_0_2px_#050707]">
              <TheatreBadge id={th} size={21} />
            </span>
            {THEATRES[th].name}
          </li>
        ))}
      </ul>

      <Section icon={<BoltIcon size={17} />} title={t('Power Level')}>
        <ul className="divide-y divide-[#665333]/30">
          {state.alliances.map((a) => {
            const v = ps.power[a.id] ?? 0;
            const min = minPL(state, a.id, planetId);
            const downWhy = v <= 0 ? t('Kleinster Wert 0 erreicht') : null;
            const upWhy = v >= maxPl ? t('Höchstwert {n} erreicht', { n: maxPl }) : null;
            return (
              <li key={a.id} className="flex items-center gap-2 py-0.5 text-[15px]">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <AllianceTag alliance={a} className="min-w-0 truncate" />
                  {/* sichtbarer Grund für die gesperrte Plus-Taste (Touch hat keinen Tooltip); Spalten bleiben ausgerichtet */}
                  {upWhy && (
                    <span className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-faint" aria-hidden>
                      {t('Maximum {n}', { n: maxPl })}
                    </span>
                  )}
                </span>
                {/* Wert und Mindestwert als eine Gruppe */}
                <span className="inset inline-flex min-w-[5.5rem] items-baseline justify-center gap-1.5 px-2 py-1" title={t('Mindestwert durch Befestigung: {n}', { n: min })}>
                  <b className="font-mono text-[19px] leading-none text-ink">{v}</b>
                  <span className="text-[13px] text-faint">{t('min {n}', { n: min })}</span>
                </span>
                {/* +/- als eine Bediengruppe; eine gesperrte Taste nennt ihren Grund */}
                <span className="keypair" role="group" aria-label={t('Power Level von {a} ändern', { a: a.name })}>
                  <span title={downWhy ?? undefined} className="inline-flex">
                    <button
                      className="btn btn-sm"
                      disabled={busy || v <= 0}
                      aria-label={downWhy ? `${t('PL von {a} senken', { a: a.name })} – ${downWhy}` : t('PL von {a} senken', { a: a.name })}
                      onClick={() => run({ type: 'OVERRIDE_PL', allianceId: a.id, planetId, value: v - 1 })}
                    >
                      <MinusGlyph />
                    </button>
                  </span>
                  <span title={upWhy ?? undefined} className="inline-flex">
                    <button
                      className="btn btn-sm"
                      disabled={busy || v >= maxPl}
                      aria-label={upWhy ? `${t('PL von {a} erhöhen', { a: a.name })} – ${upWhy}` : t('PL von {a} erhöhen', { a: a.name })}
                      onClick={() => run({ type: 'OVERRIDE_PL', allianceId: a.id, planetId, value: v + 1 })}
                    >
                      <PlusGlyph />
                    </button>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section icon={<TowerIcon size={17} />} title={t('Infrastruktur')}>
        <div className="space-y-1">
          {ps.slots.map((s, i) => (
            <SlotRow key={i} planetId={planetId} index={i} slot={s} />
          ))}
        </div>
      </Section>

      <Section icon={<GameIcon name="ui_FLEET" size={17} color="#b3975f" />} title={t('Flotten im Orbit')}>
        {!fleets.length && <p className="text-[15px] text-faint">{t('Keine Flotten stationiert.')}</p>}
        <ul className="space-y-1">
          {fleets.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-[15px]">
              <AllianceTag alliance={state.alliances.find((a) => a.id === f.allianceId)} className="shrink-0" />
              <span className="truncate text-ink">{f.name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <PlanetTexts key={`${planetId}|${ps.lore}|${ps.notes}`} planetId={planetId} lore0={ps.lore} notes0={ps.notes} />

      {battles.length > 0 && (
        <details className="dossier-sec group p-0">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 font-display text-[15px] font-bold uppercase tracking-[0.06em] text-ink [&::-webkit-details-marker]:hidden">
            <GameIcon name="op_BATTLE" size={18} color="#b3975f" />
            <span className="flex-1">{t('Schlachten ({n})', { n: battles.length })}</span>
            <ChevronIcon className="transition-transform group-open:rotate-180" />
          </summary>
          <ul className="relative z-[1] space-y-1 border-t border-[#665333]/40 p-3">
            {battles.slice(0, 8).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="font-mono text-[13px] text-faint">P{b.phaseNumber}</span>
                <AttackIcon type={b.attackType} /> {battleTitle(b, t)} <StatusChip status={b.status} /> <span className="text-dim">{victorLabel(state, b)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* NTH2 4.2 eigene Bilder, 7.3 Lore in weiteren Sprachen */}
      <details className="dossier-sec group p-0">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 font-display text-[15px] font-bold uppercase tracking-[0.06em] text-ink [&::-webkit-details-marker]:hidden">
          <GameIcon name="ui_PLANET" size={18} color="#b3975f" />
          <span className="flex-1">{t('Bilder und Übersetzung')}</span>
          <ChevronIcon className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="relative z-[1] space-y-4 border-t border-[#665333]/40 p-3">
          <PlanetImagePicker
            campaignId={campaignId}
            planetId={planetId}
            portrait={ps.portrait}
            landscape={ps.landscape}
            disabled={busy || readOnly}
            onChange={(next) => run({ type: 'PLANET_IMAGE_SET', planetId, ...next })}
          />
          <PlanetLoreTr key={`${planetId}|${JSON.stringify(ps.loreTr ?? {})}`} planetId={planetId} />
        </div>
      </details>

      <details className="dossier-sec group p-0">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 font-display text-[15px] font-bold uppercase tracking-[0.06em] text-ink [&::-webkit-details-marker]:hidden">
          <WrenchIcon size={18} className="text-brass" />
          <span className="flex-1">{t('Verwaltung')}</span>
          <ChevronIcon className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="relative z-[1] space-y-3 border-t border-[#665333]/40 p-3">
          <p className="text-[14px] text-dim">{t('Eingriffe des Spielleiters werden im Log als Override vermerkt.')}</p>
          {fleets.map((f) => (
            <label key={f.id} className="block">
              <span className="label">{t('{fleet} versetzen', { fleet: f.name })}</span>
              <select className="select" value="" disabled={busy} onChange={(e) => e.target.value && run({ type: 'OVERRIDE_FLEET', fleetId: f.id, planetId: e.target.value })}>
                <option value="">{t('Zielplanet wählen…')}</option>
                {planetIds(state)
                  .filter((p) => p !== planetId)
                  .map((p) => (
                    <option key={p} value={p}>
                      {planetDef(p)?.name ?? p}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <label className="block">
            <span className="label">{t('Flotte hierher versetzen')}</span>
            <select className="select" value="" disabled={busy} onChange={(e) => e.target.value && run({ type: 'OVERRIDE_FLEET', fleetId: e.target.value, planetId })}>
              <option value="">{t('Flotte wählen…')}</option>
              {state.fleets
                .filter((f) => f.planetId !== planetId)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="btn btn-danger w-full" disabled={busy} onClick={() => run({ type: 'OVERRIDE_PLANET_DESTROYED', planetId, destroyed: !ps.destroyed })}>
            {ps.destroyed ? t('Planet wiederherstellen (Override)') : t('Planet als zerstört markieren (Override)')}
          </button>
        </div>
      </details>
    </article>
  );
}

/** Öffentliche Lore und private SL-Notiz – klar getrennt, gemeinsam gespeichert */
function PlanetTexts({ planetId, lore0, notes0 }: { planetId: string; lore0: string; notes0: string }) {
  const { run, busy } = useCmd();
  const t = useT();
  const [lore, setLore] = useState(lore0);
  const [notes, setNotes] = useState(notes0);
  const [which, setWhich] = useState<'lore' | 'notes'>('lore');
  const dirty = lore !== lore0 || notes !== notes0;
  // Beim Schreiben Textfeld und Speichern-Taste ganz in den sichtbaren Bereich der Aktenspalte holen
  const saveRef = useRef<HTMLDivElement>(null);
  const reveal = () => saveRef.current?.scrollIntoView({ block: 'nearest' });
  return (
    <section className="space-y-2">
      <div className="tabbar" role="tablist" aria-label={t('Texte zum Planeten')}>
        <button type="button" role="tab" id={`pt-lore-${planetId}`} aria-controls={`pt-panel-${planetId}`} aria-selected={which === 'lore'} className="tabkey" onClick={() => setWhich('lore')}>
          <BookIcon size={17} className="text-brass" /> {t('Lore')} <span className="text-[13px] font-normal text-faint">({t('öffentlich')})</span>
        </button>
        <button type="button" role="tab" id={`pt-notes-${planetId}`} aria-controls={`pt-panel-${planetId}`} aria-selected={which === 'notes'} className="tabkey" onClick={() => setWhich('notes')}>
          <NoteIcon size={17} className="text-brass" /> {t('SL-Notiz')} <span className="text-[13px] font-normal text-faint">({t('privat')})</span>
        </button>
      </div>
      <div role="tabpanel" id={`pt-panel-${planetId}`} aria-labelledby={which === 'lore' ? `pt-lore-${planetId}` : `pt-notes-${planetId}`}>
        {which === 'lore' ? (
          <textarea
            className="textarea"
            rows={2}
            value={lore}
            onChange={(e) => setLore(e.target.value)}
            onFocus={reveal}
            placeholder={t('Hintergrund, Ereignisse oder Hinweise zu diesem Planeten (öffentlich, Markdown).')}
            aria-label={t('Lore (öffentlich, Markdown)')}
          />
        ) : (
          <textarea
            className="textarea border-[#721f25]/70"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onFocus={reveal}
            placeholder={t('Nur für die Spielleitung sichtbar.')}
            aria-label={t('SL-Notiz (privat)')}
          />
        )}
      </div>
      {/* Ungespeicherte Texte: Speichern-Taste haftet am unteren Rand der Aktenspalte, solange der Textbereich im Blick ist */}
      <div ref={saveRef} className={dirty ? 'sticky-save sticky bottom-0 z-[6] -mx-1 bg-[linear-gradient(180deg,rgba(15,19,18,0),#0f1312_40%)] px-1 pb-1 pt-4' : ''}>
        <button className="btn btn-primary w-full" disabled={busy || !dirty} onClick={() => run({ type: 'PLANET_TEXT', planetId, lore, notes })}>
          <SaveIcon /> {t('Änderungen speichern')}
          {dirty && <span className="lamp lamp-on ml-1" aria-hidden />}
        </button>
      </div>
    </section>
  );
}

/** Plus/Minus als Linien-Glyphen (keine Unicode-Zeichen als Bedienelement) */
function MinusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
