'use client';

import { useMemo, useState } from 'react';
import {
  buildDecree,
  decreeFacts,
  DECREE_LANGS,
  DECREE_SLOTS,
  DECREE_TONES,
  newDecreeSeed,
  SLOT_LABEL,
  SLOT_VARS,
  TONE_LABEL,
  unknownVars,
  type DecreeBlock,
  type DecreeLang,
  type DecreeSlot,
  type DecreeTone,
} from '@/engine/decree';
import { originalLang, otherLang, type DispatchTr } from '@/engine/contentLang';
import { toPublicView } from '@/engine/publicView';
import { stagePhase } from '@/engine/players';
import { DiceIcon, SaveIcon } from '@/components/icons';
import { Empty, Field, Markdown } from '@/components/ui';
import { LANG_NAMES } from '@/components/LangNote';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

export interface DecreeDraft {
  title: string;
  body: string;
  tr?: DispatchTr;
}

// alle fünf Sprachen haben eigene Lückentexte
const LANGS: DecreeLang[] = DECREE_LANGS;

/**
 * Dekret-Baukasten (NTH2 4.1, ohne KI): Entwurf aus den Fakten einer Phase (nur öffentliche Projektion) und
 * Lückentexten je Tonfall. „Neu würfeln“ wählt andere Varianten. Der Entwurf geht in den Dispatch-Editor und
 * wird erst dort bearbeitet und veröffentlicht. Darunter pflegt der Warmaster eigene Bausteine.
 */
export function DecreeBuilder({ onUse }: { onUse: (d: DecreeDraft) => void }) {
  const { state } = useCmd();
  const t = useT();
  const pub = useMemo(() => toPublicView(state), [state]);
  const cur = stagePhase(state);
  const phases = state.phases.filter((p) => p.number <= Math.max(1, cur)).map((p) => p.number);
  const orig = originalLang(state);
  const [phase, setPhase] = useState(() => phases.at(-1) ?? 1);
  const [tone, setTone] = useState<DecreeTone>('PROCLAMATION');
  const [lang, setLang] = useState<DecreeLang>(orig);
  const [both, setBoth] = useState(false);
  const [ownFirst, setOwnFirst] = useState(false);
  const [seed, setSeed] = useState(() => newDecreeSeed());
  const facts = useMemo(() => decreeFacts(pub, phase), [pub, phase]);
  const opts = { tone, seed, blocks: state.decreeBlocks, ownFirst };
  const draft = buildDecree(facts, { ...opts, lang });
  // „beide Sprachen“: gewählte Sprache (= Kampagnensprache) plus die zweite Sprache der Kampagne
  const other: DecreeLang = otherLang(orig);
  const second = both ? buildDecree(facts, { ...opts, lang: other }) : null;

  if (!phases.length || state.stage.kind === 'SETUP') return <Empty>{t('Der Baukasten braucht eine laufende oder beendete Phase.')}</Empty>;

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-dim">{t('Entwurf aus den Fakten der Phase (nur öffentliche Daten) und Textbausteinen. Nichts wird veröffentlicht, bevor du den Entwurf im Dispatch-Editor speicherst.')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('Phase')}>
          <select className="select w-auto" value={phase} onChange={(e) => setPhase(Number(e.target.value))}>
            {phases.map((n) => (
              <option key={n} value={n}>
                {t('Phase {n}', { n })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Tonfall')}>
          <select className="select w-auto" value={tone} onChange={(e) => setTone(e.target.value as DecreeTone)}>
            {DECREE_TONES.map((x) => (
              <option key={x} value={x}>
                {t(TONE_LABEL[x])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Sprache')}>
          <select className="select w-auto" value={lang} onChange={(e) => setLang(e.target.value as DecreeLang)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_NAMES[l]}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="btn" onClick={() => setSeed(newDecreeSeed())}>
          <DiceIcon /> {t('Neu würfeln')}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
        {lang === orig && (
          <label className="inline-flex min-h-10 items-center gap-2">
            <input type="checkbox" className="accent-[#dda94d]" checked={both} onChange={(e) => setBoth(e.target.checked)} /> {t('Übersetzung ({lang}) gleich mit erzeugen', { lang: LANG_NAMES[other] })}
          </label>
        )}
        {(state.decreeBlocks ?? []).length > 0 && (
          <label className="inline-flex min-h-10 items-center gap-2">
            <input type="checkbox" className="accent-[#dda94d]" checked={ownFirst} onChange={(e) => setOwnFirst(e.target.checked)} /> {t('Eigene Bausteine bevorzugen')}
          </label>
        )}
      </div>

      {state.stage.kind === 'PHASE' && state.stage.phase === phase && !state.phases.find((p) => p.number === phase)?.flags.scored && (
        <p className="notice text-[14px]">{t('Die Phase läuft noch – der Entwurf zeigt den bisherigen Stand, Punkte erst nach der Wertung.')}</p>
      )}
      <article className="parchment space-y-2 p-4" aria-label={t('Vorschau des Entwurfs')}>
        <h3 className="font-display text-[18px] font-bold leading-tight text-[#6d1a12]">{draft.title}</h3>
        <Markdown text={draft.body} />
      </article>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[13px] text-faint">{t('Fakten: {b} Schlachten, {p} PL-Änderungen, {e} Ereignisse', { b: facts.battles.length, p: facts.pl.length, e: facts.events.length })}</span>
        <button type="button" className="btn btn-primary" onClick={() => onUse({ title: draft.title, body: draft.body, ...(second && lang === orig ? { tr: { [other]: second } } : {}) })}>
          {t('In den Dispatch-Editor übernehmen')}
        </button>
      </div>

      <BlocksEditor />
    </div>
  );
}

/** Eigene Textbausteine: Art, Tonfall, Sprache, Lückentext mit Platzhaltern */
function BlocksEditor() {
  const { state, run, busy, readOnly } = useCmd();
  const t = useT();
  const blocks = state.decreeBlocks ?? [];
  const [slot, setSlot] = useState<DecreeSlot>('BATTLE_WIN');
  const [tone, setTone] = useState<DecreeTone | 'ANY'>('ANY');
  const [lang, setLang] = useState<DecreeLang>(originalLang(state));
  const [text, setText] = useState('');
  const unknown = unknownVars(slot, text);
  const save = (next: DecreeBlock[]) => run({ type: 'DECREE_BLOCKS_SET', blocks: next });
  return (
    <section className="space-y-3 border-t border-line/60 pt-3" aria-label={t('Eigene Bausteine')}>
      <p className="section-title">{t('Eigene Bausteine')}</p>
      <p className="text-[14px] text-dim">{t('Eigene Sätze ergänzen die vorbereiteten Varianten. Platzhalter in geschweiften Klammern werden aus den Fakten gefüllt.')}</p>
      {blocks.length ? (
        <ul className="divide-y divide-line/60 border-y border-line/60">
          {blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-start gap-2 py-2 text-[15px]">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap gap-1.5 text-[13px]">
                  <span className="chip">{t(SLOT_LABEL[b.slot])}</span>
                  <span className="chip">{b.tone === 'ANY' ? t('jeder Tonfall') : t(TONE_LABEL[b.tone])}</span>
                  <span className="chip">{LANG_NAMES[b.lang]}</span>
                </span>
                <span className="mt-1 block font-mono text-[14px] text-ink" lang={b.lang}>
                  {b.text}
                </span>
              </span>
              {!readOnly && (
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => save(blocks.filter((x) => x.id !== b.id))}>
                  {t('entfernen')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('Noch keine eigenen Bausteine.')}</Empty>
      )}
      {!readOnly && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            if (await save([...blocks, { id: '', slot, tone, lang, text }])) setText('');
          }}
        >
          <div className="flex flex-wrap gap-2">
            <select className="select w-auto" value={slot} onChange={(e) => setSlot(e.target.value as DecreeSlot)} aria-label={t('Baustein-Art')}>
              {DECREE_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {t(SLOT_LABEL[s])}
                </option>
              ))}
            </select>
            <select className="select w-auto" value={tone} onChange={(e) => setTone(e.target.value as DecreeTone | 'ANY')} aria-label={t('Tonfall')}>
              <option value="ANY">{t('jeder Tonfall')}</option>
              {DECREE_TONES.map((x) => (
                <option key={x} value={x}>
                  {t(TONE_LABEL[x])}
                </option>
              ))}
            </select>
            <select className="select w-auto" value={lang} onChange={(e) => setLang(e.target.value as DecreeLang)} aria-label={t('Sprache')}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_NAMES[l]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="textarea font-mono"
            rows={2}
            lang={lang}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t('Text des Bausteins')}
            placeholder={SLOT_VARS[slot].map((v) => `{${v}}`).join(' ')}
          />
          <p className="hint">
            {t('Platzhalter:')} <span className="font-mono">{SLOT_VARS[slot].map((v) => `{${v}}`).join(' ')}</span>
          </p>
          {unknown.length > 0 && <p className="text-[14px] text-warn">{t('Unbekannte Platzhalter bleiben stehen: {list}', { list: unknown.map((v) => `{${v}}`).join(' ') })}</p>}
          <div className="flex justify-end">
            <button className="btn btn-sm btn-primary" disabled={busy || !text.trim()}>
              <SaveIcon /> {t('Baustein hinzufügen')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
