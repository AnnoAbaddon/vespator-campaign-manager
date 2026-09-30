'use client';

import { PlanetTraitsEditor } from '@/components/crusade/PlanetTraitsEditor';
import { useState } from 'react';
import type { Dispatch } from '@/engine/types';
import { useT, useLocale } from '@/i18n/client';
import { ArrowLeftIcon, BookIcon, PinIcon, SaveIcon } from '@/components/icons';
import { GameIcon } from '@/components/icons/GameIcon';
import { useCmd } from '../CommandProvider';
import { Empty, Field, Markdown, TabPanel, Tabs, fmtDate } from '@/components/ui';
import { mapOf, planetDef } from '@/engine/map';
import type { DispatchTr } from '@/engine/contentLang';
import { DecreeBuilder, type DecreeDraft } from './DecreeBuilder';
import { GalleryPanel } from './GalleryPanel';
import { DispatchTrFields, PlanetLoreTr, TrTextField } from './TrFields';

function MdEditor({ value, onChange, rows = 6, id, label }: { value: string; onChange: (v: string) => void; rows?: number; id?: string; label?: string }) {
  const t = useT();
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <button type="button" aria-pressed={!preview} className="btn btn-sm btn-ghost" onClick={() => setPreview(false)}>
          {t('Bearbeiten')}
        </button>
        <button type="button" aria-pressed={preview} className="btn btn-sm btn-ghost" onClick={() => setPreview(true)}>
          {t('Vorschau')}
        </button>
        <span className="ml-auto text-[13px] text-faint">{t('Markdown: **fett**, _kursiv_, - Liste, [Link](url)')}</span>
      </div>
      {preview ? (
        <div className="parchment min-h-24 p-3">{value.trim() ? <Markdown text={value} /> : <span className="text-[15px] text-faint">{t('leer')}</span>}</div>
      ) : (
        <textarea id={id} aria-label={id ? undefined : (label ?? t('Text (Markdown)'))} className="textarea font-mono" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Bearbeiten bzw. Anlegen eines Dispatches; Löschen liegt hier – nachrangig, nicht in der Liste */
function DispatchEditor({ initial, draft, onDone, onDeleted }: { initial?: Dispatch; draft?: DecreeDraft | null; onDone: () => void; onDeleted?: () => void }) {
  const { run, busy } = useCmd();
  const t = useT();
  const [title, setTitle] = useState(initial?.title ?? draft?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? draft?.body ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [pub, setPub] = useState(initial?.public ?? true);
  // NTH2 7.3: Fassungen in weiteren Sprachen
  const [tr, setTr] = useState<DispatchTr>(() => ({ ...(initial?.tr ?? draft?.tr ?? {}) }));
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ type: 'DISPATCH_UPSERT', id: initial?.id, title, body, pinned, public: pub, tr })) onDone();
      }}
    >
      <Field label={t('Titel')}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <MdEditor value={body} onChange={setBody} rows={8} />
      <DispatchTrFields value={tr} onChange={setTr} />
      <div className="flex flex-wrap items-center gap-4 text-[15px]">
        <label className="inline-flex min-h-10 items-center gap-2">
          <input type="checkbox" className="accent-[#dda94d]" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> {t('anheften')}
        </label>
        <label className="inline-flex min-h-10 items-center gap-2">
          <input type="checkbox" className="accent-[#dda94d]" checked={pub} onChange={(e) => setPub(e.target.checked)} /> {t('öffentlich')}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
        {initial && (
          <button
            type="button"
            className="btn btn-sm btn-ghost text-danger"
            disabled={busy}
            onClick={async () => {
              if (confirm(t('Dispatch „{title}“ löschen?', { title: initial.title })) && (await run({ type: 'DISPATCH_DELETE', id: initial.id }))) onDeleted?.();
            }}
          >
            {t('Dispatch löschen')}
          </button>
        )}
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn btn-sm" onClick={onDone}>
            {t('Abbrechen')}
          </button>
          <button className="btn btn-sm btn-primary" disabled={busy}>
            {t('Speichern')}
          </button>
        </span>
      </div>
    </form>
  );
}

/**
 * Dispatches als flache Liste (Titel, Status, Datum). Die Auswahl öffnet daneben (Desktop) bzw. an
 * ihrer Stelle (Mobil) die Vorschau; von dort geht es in die Bearbeitung.
 */
function DispatchesSection({ draft, onDraftUsed, onBuilder }: { draft: DecreeDraft | null; onDraftUsed: () => void; onBuilder: () => void }) {
  const { state } = useCmd();
  const t = useT();
  const lc = useLocale();
  const dispatches = [...state.dispatches].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  // Entwurf aus dem Dekret-Baukasten öffnet direkt den Editor für einen neuen Dispatch
  const [selId, setSelId] = useState<string | 'new' | null>(draft ? 'new' : null);
  const [editing, setEditing] = useState(false);
  // ohne Auswahl zeigt der Desktop den neuesten Dispatch
  const sel = selId === 'new' ? null : (dispatches.find((d) => d.id === selId) ?? null);
  const shown = sel ?? (selId === null ? dispatches[0] : null) ?? null;
  const detailOpen = selId !== null;
  const pick = (id: string | 'new' | null, edit = false) => {
    setSelId(id);
    setEditing(edit);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[15px] text-dim">{t('Nachrichten des Spielleiters an alle Spieler')}</p>
        <button type="button" className="btn btn-sm" onClick={onBuilder}>
          {t('Entwurf aus dem Baukasten')}
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => pick('new', true)}>
          {t('Neuer Dispatch')}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Liste: mobil ausgeblendet, solange ein Eintrag geöffnet ist */}
        <div className={detailOpen ? 'hidden lg:block' : ''}>
          {dispatches.length ? (
            <ul className="divide-y divide-line/60 border-y border-line/60" aria-label={t('Dispatches')}>
              {dispatches.map((d) => {
                // ohne Auswahl ist der neueste Eintrag nur auf dem Desktop (Vorschau daneben) markiert
                const on = selId === d.id;
                const auto = selId === null && shown?.id === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      aria-current={on || auto ? 'true' : undefined}
                      onClick={() => pick(d.id)}
                      className={`flex min-h-12 w-full flex-col items-start gap-1 px-2 py-2 text-left transition-colors hover:bg-white/[0.03] ${on ? 'bg-[#1b1f1d] shadow-[inset_3px_0_0_#dda94d]' : auto ? 'lg:bg-[#1b1f1d] lg:shadow-[inset_3px_0_0_#dda94d]' : ''}`}
                    >
                      <span className="inline-flex max-w-full items-center gap-1.5 font-serif text-[17px] font-semibold text-ink">
                        {d.pinned && (
                          <>
                            <PinIcon className="shrink-0 text-accent" />
                            <span className="sr-only">{t('Angeheftet:')}</span>
                          </>
                        )}
                        <span className="truncate">{d.title}</span>
                      </span>
                      <span className="flex items-center gap-2 text-[13px]">
                        <span className={`chip ${d.public ? 'border-ok text-ok' : ''}`}>{d.public ? t('öffentlich') : t('privat')}</span>
                        <span className="font-mono text-faint">{fmtDate(d.at, true, lc)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>{t('Noch keine Dispatches.')}</Empty>
          )}
        </div>

        {/* Vorschau bzw. Bearbeitung */}
        <div className={`min-w-0 ${detailOpen ? '' : 'hidden lg:block'}`}>
          {detailOpen && (
            <button type="button" className="btn btn-sm btn-ghost mb-2 lg:hidden" onClick={() => pick(null)}>
              <ArrowLeftIcon /> {t('Zur Liste')}
            </button>
          )}
          {selId === 'new' ? (
            <div>
              <p className="section-title">{draft ? t('Neuer Dispatch aus dem Baukasten') : t('Neuer Dispatch')}</p>
              <DispatchEditor
                draft={draft}
                onDone={() => {
                  onDraftUsed();
                  pick(null);
                }}
              />
            </div>
          ) : shown ? (
            editing ? (
              <div>
                <p className="section-title">{t('Dispatch bearbeiten')}</p>
                <DispatchEditor key={shown.id} initial={shown} onDone={() => setEditing(false)} onDeleted={() => pick(null)} />
              </div>
            ) : (
              <article className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-serif text-[20px] font-semibold leading-tight text-ink">{shown.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                      <span className={`chip ${shown.public ? 'border-ok text-ok' : ''}`}>{shown.public ? t('öffentlich') : t('privat')}</span>
                      {shown.pinned && <span className="chip">{t('angeheftet')}</span>}
                      <span className="font-mono text-faint">{fmtDate(shown.at, true, lc)}</span>
                    </p>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => pick(shown.id, true)}>
                    {t('Bearbeiten')}
                  </button>
                </div>
                <div className="parchment p-4">{shown.body.trim() ? <Markdown text={shown.body} /> : <span className="text-faint">{t('leer')}</span>}</div>
              </article>
            )
          ) : (
            <Empty>{t('Dispatch in der Liste wählen oder einen neuen anlegen.')}</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

export function TextsTab() {
  const { state, run, busy } = useCmd();
  const t = useT();
  const [intro, setIntro] = useState(state.meta.intro);
  const [planetId, setPlanetId] = useState(mapOf(state).planets[0].id);
  const planet = state.planets.find((p) => p.id === planetId)!;
  const [lore, setLore] = useState<Record<string, { lore: string; notes: string }>>({});
  const cur = lore[planetId] ?? { lore: planet.lore, notes: planet.notes };
  const [sec, setSec] = useState<'dispatches' | 'decree' | 'intro' | 'lore' | 'gallery'>('dispatches');
  // Entwurf des Dekret-Baukastens (NTH2 4.1) auf dem Weg in den Dispatch-Editor
  const [draft, setDraft] = useState<DecreeDraft | null>(null);
  const [draftKey, setDraftKey] = useState(0);

  return (
    <div className="space-y-3">
      <Tabs
        sticky
        idBase="texts"
        label={t('Texte & Dekrete')}
        value={sec}
        onChange={setSec}
        tabs={[
          { id: 'dispatches', label: t('Dispatches'), badge: state.dispatches.length || undefined, icon: <GameIcon name="ui_SCROLL" size={16} /> },
          { id: 'decree', label: t('Dekret-Baukasten'), icon: <GameIcon name="ui_SCROLL" size={16} /> },
          { id: 'intro', label: t('Kampagnen-Intro'), icon: <BookIcon size={16} /> },
          { id: 'lore', label: t('Planeten-Lore'), icon: <GameIcon name="ui_PLANET" size={16} /> },
          { id: 'gallery', label: t('Galerie'), icon: <GameIcon name="ui_TROPHY" size={16} /> },
        ]}
      />
      <TabPanel idBase="texts" value={sec}>
        {sec === 'dispatches' && <DispatchesSection key={draftKey} draft={draft} onDraftUsed={() => setDraft(null)} onBuilder={() => setSec('decree')} />}
        {sec === 'decree' && (
          <DecreeBuilder
            onUse={(d) => {
              setDraft(d);
              setDraftKey((k) => k + 1);
              setSec('dispatches');
            }}
          />
        )}
        {sec === 'gallery' && <GalleryPanel />}

        {sec === 'intro' && (
          <div className="space-y-2">
            <p className="text-[15px] text-dim">{t('Erscheint oben in der Leseansicht und im Codex.')}</p>
            <MdEditor value={intro} onChange={setIntro} rows={10} label={t('Kampagnen-Intro')} />
            <div className="flex justify-end">
              <button className="btn btn-primary" disabled={busy || intro === state.meta.intro} onClick={() => run({ type: 'META_UPDATE', intro })}>
                <SaveIcon /> {t('Intro speichern')}
              </button>
            </div>
            <TrTextField key={JSON.stringify(state.meta.introTr ?? {})} tr={state.meta.introTr} label={t('Intro – Übersetzung')} rows={6} onSave={(introTr) => run({ type: 'META_UPDATE', introTr })} />
          </div>
        )}

        {sec === 'lore' && (
          <div className="@container space-y-3">
            <div>
              <p className="section-title">{t('Planet')}</p>
              <div className="flex flex-wrap gap-1.5">
                {mapOf(state).planets.map((p) => {
                  const has = !!state.planets.find((x) => x.id === p.id)?.lore;
                  return (
                    <button key={p.id} type="button" aria-pressed={planetId === p.id} className="btn btn-sm font-serif text-[15px]" onClick={() => setPlanetId(p.id)}>
                      {p.name}
                      {has && (
                        <span className="lamp lamp-ok ml-0.5 h-2 w-2" title={t('Lore vorhanden')}>
                          <span className="sr-only">{t('(Lore vorhanden)')}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-4 border-t border-line/60 pt-3 @5xl:grid-cols-2">
              <Field label={t('Lore {planet} (öffentlich)', { planet: planetDef(planetId)?.name })}>
                <MdEditor value={cur.lore} onChange={(v) => setLore((l) => ({ ...l, [planetId]: { ...cur, lore: v } }))} rows={6} />
              </Field>
              <div>
                <Field label={t('SL-Notiz (nie öffentlich)')}>
                  <textarea className="textarea" rows={6} value={cur.notes} onChange={(e) => setLore((l) => ({ ...l, [planetId]: { ...cur, notes: e.target.value } }))} />
                </Field>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                className="btn btn-primary"
                disabled={busy || (cur.lore === planet.lore && cur.notes === planet.notes)}
                onClick={async () => {
                  if (await run({ type: 'PLANET_TEXT', planetId, lore: cur.lore, notes: cur.notes }))
                    setLore((l) => {
                      const n = { ...l };
                      delete n[planetId];
                      return n;
                    });
                }}
              >
                <SaveIcon /> {t('Planetentexte speichern')}
              </button>
            </div>
            {/* A9: Planeten-Merkmale für Crusade */}
            <PlanetTraitsEditor key={planetId} planetId={planetId} />
            <PlanetLoreTr key={`${planetId}|${JSON.stringify(planet.loreTr ?? {})}`} planetId={planetId} />
          </div>
        )}
      </TabPanel>
    </div>
  );
}
