import type { AuditEntry } from '@/server/audit';
import { intlLocale, LOCALE_NAMES, normLocale, type Locale, makeT } from '@/i18n/core';

/** Lesbare Namen der Bildarten (Uploads) – statt technischer Kennungen wie PLANET_LANDSCAPE */
const UPLOAD_KIND: Record<string, string> = {
  AVATAR: 'Avatar',
  ALLIANCE_LOGO: 'Allianzlogo',
  BATTLE_PHOTO: 'Schlachtfoto',
  LORE_IMAGE: 'Lore-Bild',
  PLANET_PORTRAIT: 'Planetenporträt',
  PLANET_LANDSCAPE: 'Planetenlandschaft',
};

/** Technische Kennung (Kampagnen-, Upload- oder Link-ID): ohne Leerzeichen, gemischt aus Buchstaben und Ziffern */
const isId = (s: string) => /^[A-Za-z0-9_-]{8,}$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s);

type Part = { text: string; id?: boolean };

/** Detailtext in lesbare Teile und nachrangige Kennungen zerlegen */
function detailParts(detail: string, t: (s: string) => string): Part[] {
  return detail
    .split(' · ')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p): Part => {
      if (UPLOAD_KIND[p]) return { text: t(UPLOAD_KIND[p]) };
      const l = normLocale(p);
      if (l) return { text: LOCALE_NAMES[l] };
      return isId(p) ? { text: p, id: true } : { text: p };
    });
}

/**
 * Verwaltungsprotokoll (N5.2): die letzten Aktionen mit Kontonamen – Server-Komponente.
 * Nachrangig: flache Liste mit Trennlinien; mobil in der Höhe begrenzt und eigens scrollbar.
 * Je Eintrag: Zeit und Konto, darunter die Aktion mit lesbarem Detail; technische Kennungen stehen klein und
 * gedämpft am Ende und dürfen gezielt umbrechen – der übrige Text bricht nur an Wortgrenzen um.
 */
export function AuditPanel({ entries, campaigns, locale }: { entries: AuditEntry[]; campaigns: Record<string, string>; locale: Locale }) {
  const t = makeT(locale);
  const intl = intlLocale(locale);
  return (
    <div className="space-y-2">
      <p className="text-[14px] text-dim">{t('Die letzten 50 Verwaltungsaktionen außerhalb des Kampagnenlogs (Anlegen, Undo, Freigaben, Links, Backups …).')}</p>
      {entries.length === 0 ? (
        <p className="text-[15px] text-faint">{t('Noch keine Einträge.')}</p>
      ) : (
        <ul className="max-h-[45dvh] divide-y divide-line/50 overflow-y-auto border-y border-line/50 text-[14px] lg:max-h-none lg:overflow-visible" tabIndex={0} aria-label={t('Verwaltungsprotokoll')}>
          {entries.map((e) => {
            const parts = e.detail ? detailParts(e.detail, t) : [];
            const text = parts.filter((p) => !p.id);
            const ids = parts.filter((p) => p.id);
            const campaign = e.campaign_id ? campaigns[e.campaign_id] : undefined;
            // Kampagne unbekannt (gelöscht): nur die Kennung, nachrangig
            if (e.campaign_id && !campaign) ids.unshift({ text: e.campaign_id, id: true });
            return (
              <li key={e.id} className="py-1.5">
                <span className="flex flex-wrap items-center gap-x-2 font-mono text-[13px] text-faint">
                  {new Date(e.at).toLocaleString(intl, { dateStyle: 'short', timeStyle: 'short' })}
                  <span className="font-sans text-accent">{e.author === 'Anmeldung' && !e.campaign_id ? t('Anmeldung') : e.author}</span>
                  {campaign && <span className="min-w-0 truncate font-sans text-dim" title={campaign}>{campaign}</span>}
                </span>
                <span className="block [overflow-wrap:break-word]">
                  <span className="font-semibold text-ink">{t(e.action)}</span>
                  {text.map((p, i) => (
                    <span key={i} className="text-dim">
                      {' · '}
                      {p.text}
                    </span>
                  ))}
                  {ids.map((p, i) => (
                    <span key={`id${i}`} className="ml-1.5 inline-block max-w-full align-baseline font-mono text-[12px] text-faint [overflow-wrap:anywhere]" title={t('Kennung')}>
                      {p.text}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
