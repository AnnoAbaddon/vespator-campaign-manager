'use client';

import { useState } from 'react';
import { photoOfPhase, voteTally } from '@/engine/gallery';
import { GalleryView } from '@/components/public/GalleryView';
import { uploadUrl } from '@/components/ui';
import { SaveIcon } from '@/components/icons';
import { useT } from '@/i18n/client';
import { useCmd } from '../CommandProvider';

/**
 * Galerie im Cockpit (NTH2 4.3 + D1): alle Fotos mit Filtern; der Warmaster wählt je Phase das Bild der Phase
 * (mit Bildunterschrift). Optional stimmen die Spieler über ihren Link ab – das meistgewählte Foto gilt, solange
 * der Warmaster keines festlegt. Das Bild erscheint im Codex-Kapitel der Phase und in der Leseansicht.
 */
export function GalleryPanel() {
  const { state, run, busy, readOnly } = useCmd();
  const t = useT();
  const vote = !!state.gallery?.vote;
  const phases = state.phases.filter((p) => p.photo || voteTally(state, p.number).length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-[15px] text-dim">{t('Fotos aus Schlachtberichten und Bemal-Chronik. Das Bild der Phase erscheint im Codex und in der Leseansicht.')}</p>
        <label className="inline-flex min-h-10 items-center gap-2 text-[15px]">
          <input type="checkbox" className="accent-[#dda94d]" checked={vote} disabled={busy || readOnly} onChange={(e) => run({ type: 'PHOTO_VOTE_MODE', enabled: e.target.checked })} />
          {t('Spieler stimmen über ihren Link ab')}
        </label>
      </div>
      {phases.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('Bilder der Phasen')}>
          {phases.map((ph) => (
            <PhasePick key={`${ph.number}|${ph.photo?.uploadId ?? ''}|${ph.photo?.caption ?? ''}`} phase={ph.number} />
          ))}
        </ul>
      )}
      <GalleryView
        state={state}
        actions={(p) => {
          if (readOnly || !state.phases.some((ph) => ph.number === p.phase)) return null;
          const on = state.phases.find((ph) => ph.number === p.phase)?.photo?.uploadId === p.uploadId;
          return (
            <button
              type="button"
              className={`btn btn-sm w-full ${on ? 'btn-primary' : ''}`}
              aria-pressed={on}
              disabled={busy}
              onClick={() => run({ type: 'PHASE_PHOTO_SET', phase: p.phase, uploadId: on ? null : p.uploadId, caption: '' })}
            >
              {on ? t('Auswahl aufheben') : t('Bild der Phase {n}', { n: p.phase })}
            </button>
          );
        }}
      />
    </div>
  );
}

function PhasePick({ phase }: { phase: number }) {
  const { state, run, busy, readOnly } = useCmd();
  const t = useT();
  const ph = state.phases.find((p) => p.number === phase)!;
  const pick = photoOfPhase(state, phase);
  const tally = voteTally(state, phase);
  const [caption, setCaption] = useState(ph.photo?.caption ?? '');
  return (
    <li className="inset flex gap-3 p-2">
      {pick ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uploadUrl(pick.uploadId, true)!} alt="" className="h-20 w-28 shrink-0 border border-line object-cover" />
      ) : (
        <span className="flex h-20 w-28 shrink-0 items-center justify-center border border-dashed border-line text-[13px] text-faint">{t('kein Bild')}</span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5 text-[14px]">
        <p className="font-serif text-[16px] font-semibold text-ink">
          {t('Phase {n}', { n: phase })}
          {pick && <span className="ml-2 text-[13px] font-normal text-dim">{pick.by === 'GM' ? t('gewählt vom Warmaster') : t('Abstimmung: {n} Stimmen', { n: pick.votes ?? 0 })}</span>}
        </p>
        {tally.length > 0 && <p className="text-[13px] text-dim">{t('Stimmen: {list}', { list: tally.map((v, i) => `#${i + 1} ${v.votes}`).join(' · ') })}</p>}
        {ph.photo && !readOnly && (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              run({ type: 'PHASE_PHOTO_SET', phase, uploadId: ph.photo!.uploadId, caption });
            }}
          >
            <input className="input py-1" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} aria-label={t('Bildunterschrift')} placeholder={t('Bildunterschrift')} />
            <button className="btn btn-sm" disabled={busy || caption === (ph.photo.caption ?? '')} aria-label={t('Bildunterschrift speichern')}>
              <SaveIcon />
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
