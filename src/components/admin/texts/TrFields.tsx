'use client';

import { useState } from 'react';
import { CONTENT_LANGS, originalLang, otherLang, type ContentLang, type DispatchTr, type TextTr } from '@/engine/contentLang';
import { LANG_NAMES } from '@/components/LangNote';
import { SaveIcon } from '@/components/icons';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Zweites Textfeld für Inhalte (NTH2 7.3): Übersetzung von Hand in eine weitere Sprache. Das Original steht in
 * der Kampagnensprache; hier wird die Fassung für Leser anderer Sprachen gepflegt (keine automatische Übersetzung).
 */

/** Auswahl der Zielsprache (ohne Originalsprache); Vorbelegung Deutsch ↔ Englisch */
export function TrLangSelect({ orig, value, onChange, id }: { orig: ContentLang; value: ContentLang; onChange: (l: ContentLang) => void; id?: string }) {
  const t = useT();
  return (
    <select id={id} className="select w-auto py-1" value={value} onChange={(e) => onChange(e.target.value as ContentLang)} aria-label={t('Sprache der Übersetzung')}>
      {CONTENT_LANGS.filter((l) => l !== orig).map((l) => (
        <option key={l} value={l}>
          {LANG_NAMES[l]}
        </option>
      ))}
    </select>
  );
}

/** Freitext-Übersetzung mit eigener Speichern-Taste (Intro, Planeten-Lore, Allianz-Lore) */
export function TrTextField({ tr, label, rows = 5, onSave, hint }: { tr: TextTr | undefined; label: string; rows?: number; onSave: (tr: TextTr) => Promise<unknown> | void; hint?: string }) {
  const { state, busy, readOnly } = useCmd();
  const t = useT();
  const orig = originalLang(state);
  const [lang, setLang] = useState<ContentLang>(otherLang(orig));
  const [draft, setDraft] = useState<TextTr>(() => ({ ...(tr ?? {}) }));
  const cur = draft[lang] ?? '';
  const dirty = (tr?.[lang] ?? '') !== cur;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">{label}</span>
        <TrLangSelect orig={orig} value={lang} onChange={setLang} />
        <span className="text-[13px] text-faint">{t('Original: {lang}', { lang: LANG_NAMES[orig] })}</span>
      </div>
      <textarea className="textarea" rows={rows} lang={lang} value={cur} onChange={(e) => setDraft((d) => ({ ...d, [lang]: e.target.value }))} aria-label={`${label} (${LANG_NAMES[lang]})`} disabled={readOnly} />
      {hint && <p className="hint">{hint}</p>}
      <div className="flex justify-end">
        <button type="button" className="btn btn-sm" disabled={busy || readOnly || !dirty} onClick={() => onSave({ ...(tr ?? {}), [lang]: cur })}>
          <SaveIcon /> {t('Übersetzung speichern')}
        </button>
      </div>
    </div>
  );
}

/** Lore eines Planeten in weiteren Sprachen (Planetenakte im Cockpit, Texte & Dekrete) */
export function PlanetLoreTr({ planetId }: { planetId: string }) {
  const { state, run } = useCmd();
  const t = useT();
  const ps = state.planets.find((p) => p.id === planetId);
  if (!ps) return null;
  return <TrTextField tr={ps.loreTr} label={t('Lore – Übersetzung')} rows={3} onSave={(loreTr) => run({ type: 'PLANET_TEXT', planetId, loreTr })} />;
}

/** Titel und Text eines Dispatches in einer weiteren Sprache (Teil des Dispatch-Formulars, gespeichert mit ihm) */
export function DispatchTrFields({ value, onChange }: { value: DispatchTr; onChange: (v: DispatchTr) => void }) {
  const { state } = useCmd();
  const t = useT();
  const orig = originalLang(state);
  const [lang, setLang] = useState<ContentLang>(otherLang(orig));
  const cur = value[lang] ?? { title: '', body: '' };
  const set = (patch: Partial<{ title: string; body: string }>) => onChange({ ...value, [lang]: { ...cur, ...patch } });
  return (
    <details className="fold" open={!!(cur.title || cur.body)}>
      <summary>
        {t('Übersetzung')} <span className="text-[13px] font-normal text-faint">({t('optional')})</span>
      </summary>
      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <TrLangSelect orig={orig} value={lang} onChange={setLang} />
          <span className="text-[13px] text-faint">{t('Leser dieser Sprache sehen diese Fassung; ohne Übersetzung das Original mit Sprachhinweis.')}</span>
        </div>
        <input
          className="input"
          lang={lang}
          value={cur.title}
          onChange={(e) => set({ title: e.target.value })}
          aria-label={t('Titel ({lang})', { lang: LANG_NAMES[lang] })}
          placeholder={t('Titel ({lang})', { lang: LANG_NAMES[lang] })}
        />
        <textarea className="textarea font-mono" lang={lang} rows={6} value={cur.body} onChange={(e) => set({ body: e.target.value })} aria-label={t('Text ({lang})', { lang: LANG_NAMES[lang] })} />
      </div>
    </details>
  );
}

/** Freitext-Übersetzung als Teil eines Formulars (gespeichert mit dem Formular, z. B. Allianz-Lore) */
export function TrInlineField({ value, onChange, label }: { value: TextTr; onChange: (v: TextTr) => void; label: string }) {
  const { state } = useCmd();
  const t = useT();
  const orig = originalLang(state);
  const [lang, setLang] = useState<ContentLang>(otherLang(orig));
  const cur = value[lang] ?? '';
  return (
    <details className="fold" open={!!cur}>
      <summary>
        {label} <span className="text-[13px] font-normal text-faint">({t('optional')})</span>
      </summary>
      <div className="space-y-1.5 pt-2">
        <TrLangSelect orig={orig} value={lang} onChange={setLang} />
        <textarea className="textarea" rows={3} lang={lang} value={cur} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} aria-label={`${label} (${LANG_NAMES[lang]})`} />
      </div>
    </details>
  );
}
