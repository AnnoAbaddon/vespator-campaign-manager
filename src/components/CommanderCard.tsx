import type { CampaignState, Mark, Player } from '@/engine/types';
import { planetName } from '@/engine/map';
import { uploadUrl } from '@/components/public/fmt';
import { DEFAULT_LOCALE, makeT, translateMessage, type Locale } from '@/i18n/core';
import { battleKindName } from '@/components/battleName';

/**
 * Kommandant mit Ehrungen und Narben (N3.4) – Anzeige für Leseansicht, Spielerseite und Codex.
 * Anlass, Phase und Schlacht stehen sichtbar unter dem Titel (nicht nur im Tooltip);
 * automatische Ehrungen werden übersetzt. `parchment`: dunkle Farben für den Codex auf Pergament.
 */
export function CommanderCard({ state, player: p, compact = false, locale, parchment = false }: { state: CampaignState; player: Player; compact?: boolean; locale?: Locale; parchment?: boolean }) {
  const lc = locale ?? DEFAULT_LOCALE;
  const t = makeT(lc);
  const c = p.commander;
  const honors = p.honors ?? [];
  const scars = p.scars ?? [];
  if (!c?.name && !honors.length && !scars.length) return compact ? null : <p className={`text-sm ${parchment ? '' : 'text-faint'}`}>{t('Noch kein Kommandant eingetragen.')}</p>;
  const img = uploadUrl(c?.portrait, true);
  // Terminal: Messing/Elfenbein auf Stahl; Pergament (Codex): dunkle Tinte, Siegelrot für Narben
  const tone = parchment
    ? {
        title: 'text-[#5a3d1c]',
        name: 'text-[#6d1a12]',
        honor: 'bg-transparent text-[#3d2a0e] shadow-[inset_0_0_0_1px_#8a6a3a]',
        scar: 'bg-transparent text-[#6d1a12] shadow-[inset_0_0_0_1px_#8a2a1c]',
        meta: 'text-[#5a3d1c]',
        frame: 'border-[#8a6a3a] shadow-[0_0_0_2px_#efe5cf,0_0_0_3px_#8a6a3a]',
        head: 'text-[#5a3d1c]',
      }
    : {
        title: 'text-dim',
        name: 'text-[#f3e2b4]',
        honor: 'text-[#f3e2b4] shadow-[inset_0_0_0_1px_rgba(221,169,77,0.6)]',
        scar: 'text-[#f3a79d] shadow-[inset_0_0_0_1px_rgba(226,104,92,0.6)]',
        meta: 'text-dim',
        frame: 'border-black shadow-[0_0_0_1px_#050707,0_0_0_3px_#2b2f2b,0_0_0_4px_#b3975f]',
        head: 'text-brass',
      };
  // Automatische Ehrungen tragen deutsche Standardtexte der Engine – übersetzen
  const txt = (m: Mark, s: string) => (m.auto ? translateMessage(lc, s) : s);
  const detail = (m: Mark) => {
    const b = m.battleId ? state.battles.find((x) => x.id === m.battleId) : null;
    const battle = b ? `${battleKindName(b, t)}${b.planetId ? ` · ${planetName(b.planetId)}` : ''}` : '';
    return [m.reason ? txt(m, m.reason) : '', m.phase ? t('Phase {n}', { n: m.phase }) : '', battle].filter(Boolean).join(' · ');
  };
  const list = (marks: Mark[], cls: string, label: string) => (
    <div>
      <p className={`mb-1 font-serif text-[14px] font-semibold ${tone.head}`}>{label}</p>
      <ul className="space-y-1">
        {marks.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={`chip font-sans text-[14px] font-semibold ${cls}`}>{txt(m, m.title)}</span>
            {detail(m) && <span className={`text-[14px] ${tone.meta}`}>{detail(m)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="flex gap-3.5">
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className={`mt-1 h-24 w-[4.5rem] shrink-0 border object-cover ${tone.frame}`} />
      )}
      <div className="min-w-0 flex-1 space-y-2 text-[15px]">
        {c?.name && (
          <p className="leading-tight">
            {c.title && <span className={`block font-serif text-[15px] ${tone.title}`}>{c.title}</span>}
            <b className={`font-display text-[18px] ${tone.name}`}>{c.name}</b>
          </p>
        )}
        {honors.length > 0 && list(honors, tone.honor, t('Ehrungen'))}
        {scars.length > 0 && list(scars, tone.scar, t('Narben'))}
      </div>
    </div>
  );
}
