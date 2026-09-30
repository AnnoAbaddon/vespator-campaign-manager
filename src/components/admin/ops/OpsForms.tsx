'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clearErrorsAction, importTranslationsAction, resetTranslationsAction, runPrivacyCleanupAction, setErrorWebhookAction, setPrivacySettingsAction } from '@/app/actions/betrieb';
import { Field } from '@/components/ui';
import { SaveIcon } from '@/components/icons';
import { useMsg, useT } from '@/i18n/client';
import type { PrivacySettings } from '@/server/privacy';
import type { Locale } from '@/i18n/core';

function useAction() {
  const router = useRouter();
  const msg = useMsg();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const go = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string | ((r: never) => string)) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? { ok: true, text: typeof okText === 'string' ? okText : okText(r as never) } : { ok: false, text: msg(r.error) });
      if (r.ok) router.refresh();
    });
  const Note = () =>
    note && (
      <p className={`text-[14px] ${note.ok ? 'text-ok' : 'text-danger'}`} role={note.ok ? 'status' : 'alert'}>
        {note.text}
      </p>
    );
  return { pending, go, Note };
}

/** Discord-Webhook für Fehlermeldungen (gedrosselt) und Fehlerprotokoll leeren */
export function ErrorWebhookForm({ configured }: { configured: boolean }) {
  const t = useT();
  const { pending, go, Note } = useAction();
  const [url, setUrl] = useState('');
  return (
    <div className="space-y-2">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          go(() => setErrorWebhookAction(url), t('Gespeichert'));
          setUrl('');
        }}
      >
        <div className="min-w-0 flex-1">
          <Field label={configured ? t('Discord-Webhook für Fehlermeldungen (eingerichtet – neue URL ersetzt ihn)') : t('Discord-Webhook für Fehlermeldungen (optional)')}>
            <input className="input" type="url" value={url} placeholder="https://discord.com/api/webhooks/…" onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>
        <button className="btn btn-sm" disabled={pending || !url.trim()}>
          <SaveIcon /> {t('Speichern')}
        </button>
        {configured && (
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => go(() => setErrorWebhookAction(''), t('Entfernt'))}>
            {t('Entfernen')}
          </button>
        )}
      </form>
      <p className="text-[13px] text-dim">{t('Höchstens eine Meldung je 15 Minuten; sie nennt die Zahl der Fehler seit der letzten Meldung.')}</p>
      <Note />
    </div>
  );
}

export function ClearErrorsButton() {
  const t = useT();
  const { pending, go, Note } = useAction();
  return (
    <div className="space-y-1">
      <button className="btn btn-sm" disabled={pending} onClick={() => go(() => clearErrorsAction(), t('Fehlerprotokoll geleert'))}>
        {t('Fehlerprotokoll leeren')}
      </button>
      <Note />
    </div>
  );
}

/** Automatische Bereinigung nach Kampagnenende (NTH2 6.4) */
export function PrivacySettingsForm({ initial }: { initial: PrivacySettings }) {
  const t = useT();
  const { pending, go, Note } = useAction();
  const [s, setS] = useState(initial);
  const box = 'h-4 w-4 shrink-0 accent-[#dda94d]';
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
        <input type="checkbox" className={box} checked={s.days !== null} onChange={(e) => setS({ ...s, days: e.target.checked ? (initial.days ?? 90) : null })} />
        {t('Nach Kampagnenende automatisch bereinigen')}
      </label>
      {s.days !== null && (
        <div className="space-y-2 pl-6">
          <Field label={t('Tage nach Kampagnenende')}>
            <input type="number" className="input w-28" min={1} max={3650} value={s.days} onChange={(e) => setS({ ...s, days: Number(e.target.value) || 1 })} />
          </Field>
          {(
            [
              ['contact', 'Kontaktdaten (E-Mail, Discord, Klarname)'],
              ['notes', 'Private Notizen (SL-Notiz zum Spieler, Allianz-Notizen)'],
              ['pulse', 'Kommentare im Phasen-Puls'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex min-h-9 items-center gap-2.5 text-[15px]">
              <input type="checkbox" className={box} checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
              {t(label)}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => go(() => setPrivacySettingsAction(s), t('Gespeichert'))}>
          <SaveIcon /> {t('Einstellungen speichern')}
        </button>
        {initial.days !== null && (
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              go(
                () => runPrivacyCleanupAction(),
                (r: { campaigns: number }) => t('{n} Kampagne(n) bereinigt', { n: r.campaigns }),
              )
            }
          >
            {t('Fällige jetzt bereinigen')}
          </button>
        )}
      </div>
      <Note />
    </div>
  );
}

/** Übersetzungsdatei importieren (CSV oder JSON) und importierte Übersetzungen verwerfen (NTH2 7.2) */
export function TranslationImport({ imported }: { imported: Partial<Record<Locale, number>> }) {
  const t = useT();
  const { pending, go, Note } = useAction();
  const file = useRef<HTMLInputElement>(null);
  const langs = Object.entries(imported).filter(([, n]) => n) as [Locale, number][];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-sm" href="/api/i18n?format=csv" download>
          {t('CSV exportieren')}
        </a>
        <a className="btn btn-sm" href="/api/i18n?format=json" download>
          {t('JSON exportieren')}
        </a>
        <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => file.current?.click()}>
          {t('Datei importieren')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const text = await f.text();
            go(
              () => importTranslationsAction(text),
              (r: { changed: Record<string, number>; unknown: number; rejected: number }) =>
                t('Übernommen: {list} · unbekannt: {u} · abgelehnt (Platzhalter): {r}', {
                  list:
                    Object.entries(r.changed)
                      .map(([l, n]) => `${l.toUpperCase()} ${n}`)
                      .join(', ') || '0',
                  u: r.unknown,
                  r: r.rejected,
                }),
            );
          }}
        />
      </div>
      <p className="text-[13px] text-dim">{t('Spalten: area, kind, de, en, fr, es, pl. Leere Zellen bleiben unverändert; Platzhalter wie {n} müssen erhalten bleiben.')}</p>
      {langs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="text-dim">{t('Importiert:')}</span>
          {langs.map(([l, n]) => (
            <button key={l} className="btn btn-sm" disabled={pending} onClick={() => go(() => resetTranslationsAction(l), t('Verworfen'))} title={t('Importierte Übersetzungen dieser Sprache verwerfen')}>
              {l.toUpperCase()} {n} · {t('verwerfen')}
            </button>
          ))}
        </div>
      )}
      <Note />
    </div>
  );
}
