'use client';

import MarkdownIt from 'markdown-it';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MEDALS, type AttackType, type MedalId } from '@/engine/data/vespator';
import type { Alliance, CampaignState } from '@/engine/types';
import { uploadAction } from '@/app/actions/campaign';
import { GameIcon } from '@/components/icons/GameIcon';
import { ChevronIcon } from '@/components/icons';
import { ATTACK_ICON, FACTIONS, MEDAL_ICON, OP_ICON, allianceEmblem, factionIcon } from '@/components/icons/registry';
import { planetName, VESPATOR_MAP } from '@/engine/map';
import { DEFAULT_LOCALE, intlLocale, type Locale } from '@/i18n/core';
import { useLocale, useMsg, useT } from '@/i18n/client';
import { useNow } from '@/components/public/useNow';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noreferrer noopener');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  if (!text?.trim()) return null;
  return <div className={`prose-hud ${className}`} dangerouslySetInnerHTML={{ __html: md.render(text) }} />;
}

/**
 * Modul (Stahlgehäuse) mit Überschrift in Titelschrift, optionalem Symbol und Aktionen rechts.
 * Der Inhalt liegt über der Metallstruktur (relative z-[1]).
 */
export function Panel({ title, icon, actions, children, className = '' }: { title?: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`hud min-w-0 p-3 sm:p-4 ${className}`}>
      {(title || actions) && (
        <div className="relative z-[1] mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {title && (
            <h2 className="hud-title flex min-w-0 items-center gap-2.5 leading-snug">
              {icon && (
                <span className="shrink-0 text-brass" aria-hidden>
                  {icon}
                </span>
              )}
              <span className="min-w-0">{title}</span>
            </h2>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {/* Container: Inhalte richten ihre Spalten nach der Modulbreite, nicht nach dem Bildschirm */}
      <div className="@container relative z-[1]">{children}</div>
    </section>
  );
}

/** Einklappbarer Abschnitt (details/summary) mit Messingwinkel */
export function Fold({ title, children, open, className = '' }: { title: React.ReactNode; children: React.ReactNode; open?: boolean; className?: string }) {
  return (
    <details className={`fold ${className}`} open={open}>
      <summary>{title}</summary>
      <div className="pb-1 pt-1">{children}</div>
    </details>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint mt-1 block">{hint}</span>}
    </label>
  );
}

export function AllianceTag({ alliance, className = '' }: { alliance?: Alliance | null; className?: string }) {
  if (!alliance) return <span className="text-faint">–</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <GameIcon name={allianceEmblem(alliance)} size={18} color={alliance.color} className="drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]" />
      <span>{alliance.name}</span>
    </span>
  );
}

/** Armee mit generischem Symbol */
export function FactionTag({ name, className = '' }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className="text-faint">–</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <GameIcon name={factionIcon(name)} size={15} color="#bba77f" />
      <span>{name}</span>
    </span>
  );
}

/** Symbol einer Operation (bei Battle Operations das der Angriffsart) */
export function OpIcon({ op, size = 16 }: { op: { type: string; attackType?: AttackType | null; hidden?: boolean }; size?: number }) {
  if (op.hidden) return <GameIcon name="ui_SCROLL" size={size} color="#bba77f" />;
  const key = op.type === 'BATTLE' && op.attackType ? ATTACK_ICON[op.attackType] : (OP_ICON[op.type as keyof typeof OP_ICON] ?? 'ui_SKULL');
  return <GameIcon name={key} size={size} color="#e0b95c" />;
}

export function AttackIcon({ type, size = 16, color = '#e0b95c' }: { type: AttackType | null | undefined; size?: number; color?: string }) {
  return <GameIcon name={type ? ATTACK_ICON[type] : 'op_BATTLE'} size={size} color={color} />;
}

export function MedalIcon({ medal, size = 18 }: { medal: MedalId; size?: number }) {
  return <GameIcon name={MEDAL_ICON[medal]} size={size} color="#e8c872" title={MEDALS[medal].name} />;
}

/** Vorschlagsliste der Armeen für Eingabefelder (list="faction-list") */
export function FactionDatalist() {
  return (
    <datalist id="faction-list">
      {FACTIONS.map((f) => (
        <option key={f.name} value={f.name} />
      ))}
    </datalist>
  );
}

export function useAlliance(state: CampaignState) {
  return (id: string | null | undefined) => state.alliances.find((a) => a.id === id) ?? null;
}

export { planetName };

/** true ab Desktop-Breite (lg); serverseitig false */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(min-width: 1024px)');
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => false,
  );
}

/** Planeten-IDs der aktuellen Kampagnenkarte (vom CommandProvider gesetzt) */
export const MapIdsCtx = createContext<string[]>(VESPATOR_MAP.planets.map((p) => p.id));

export function PlanetSelect({
  value,
  onChange,
  options,
  placeholder: ph,
  className = '',
  disabled,
  label,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Zugänglicher Name, wenn der Platzhalter nichts über das Feld sagt (z. B. „– Pflicht –“) */
  label?: string;
}) {
  const t = useT();
  const placeholder = ph ?? t('– Planet –');
  const all = useContext(MapIdsCtx);
  const list = options ?? all;
  return (
    <select className={`select ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label ?? placeholder.replace(/^[–\s]+|[–\s]+$/g, '')}>
      <option value="">{placeholder}</option>
      {list.map((id) => (
        <option key={id} value={id}>
          {planetName(id)}
        </option>
      ))}
    </select>
  );
}

export function fmtDate(iso: string | null | undefined, withTime = false, locale: Locale = DEFAULT_LOCALE, timeZone = 'Europe/Berlin') {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(intlLocale(locale), { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

/** ISO → Wert für <input type="datetime-local"> (Europe/Berlin vereinfacht: lokale Zeit des Browsers) */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  // F1: ungültige oder extreme Altwerte nicht formatieren (toISOString würde werfen)
  if (!Number.isFinite(local.getTime())) return '';
  return local.toISOString().slice(0, 16);
}
export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}

export function Countdown({ to, label, timeZone }: { to: string | null | undefined; label: string; timeZone?: string }) {
  const t = useT();
  const locale = useLocale();
  // Restzeit erst im Browser (Server und erster Client-Render ohne Uhrzeit – keine Hydrationsfehler)
  const now = useNow();
  if (!to) return null;
  const ms = now === null ? null : new Date(to).getTime() - now;
  const days = ms === null ? 0 : Math.floor(Math.abs(ms) / 86400000);
  const hours = ms === null ? 0 : Math.floor((Math.abs(ms) % 86400000) / 3600000);
  // Datum und Restzeit sind je eine feste Einheit: umbrochen wird höchstens dazwischen, nie mitten in „29 T 22 Std“
  const nb = (s: string) => s.replace(/ /g, ' ');
  const rest = ms === null ? null : ms < 0 ? t('vor {d}{h} Std', { d: days ? t('{n} T ', { n: days }) : '', h: hours }) : t('noch {d}{h} Std', { d: days ? t('{n} T ', { n: days }) : '', h: hours });
  return (
    <span className={`chip flex-wrap gap-x-1.5 ${ms === null ? '' : ms < 0 ? 'border-danger text-danger' : ms < 3 * 86400000 ? 'border-warn text-warn' : ''}`}>
      {/* ohne feste Zeitzone formatiert der Browser in seiner eigenen – darf vom Server abweichen */}
      <span suppressHydrationWarning className="whitespace-nowrap">
        {label}: {nb(fmtDate(to, true, locale, timeZone))}
      </span>
      {rest && <span className="whitespace-nowrap">({nb(rest)})</span>}
    </span>
  );
}

export function uploadUrl(id: string | null | undefined, thumb = false) {
  return id ? `/api/uploads/${id}${thumb ? '?thumb=1' : ''}` : null;
}

export function Avatar({ id, name, size = 32 }: { id?: string | null; name: string; size?: number }) {
  const url = uploadUrl(id, true);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="inline-block shrink-0 border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="inline-flex shrink-0 items-center justify-center border border-line bg-panel-2 font-mono text-xs text-dim" style={{ width: size, height: size }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function UploadButton({
  kind,
  campaignId,
  onUploaded,
  label,
  multiple = false,
}: {
  kind: 'AVATAR' | 'ALLIANCE_LOGO' | 'BATTLE_PHOTO' | 'LORE_IMAGE' | 'PLANET_PORTRAIT' | 'PLANET_LANDSCAPE';
  campaignId: string;
  onUploaded: (id: string) => void;
  label?: string;
  multiple?: boolean;
}) {
  const t = useT();
  const msg = useMsg();
  const online = useOnline();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        multiple={multiple}
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          setBusy(true);
          setErr(null);
          for (const f of files) {
            const fd = new FormData();
            fd.set('file', f);
            fd.set('kind', kind);
            fd.set('campaignId', campaignId);
            const r = await uploadAction(fd);
            if (r.ok) onUploaded(r.id);
            else setErr(r.error);
          }
          setBusy(false);
          if (ref.current) ref.current.value = '';
        }}
      />
      <button type="button" className="btn btn-sm" disabled={busy || !online} onClick={() => ref.current?.click()}>
        {busy ? t('Lädt…') : (label ?? t('Bild hochladen'))}
      </button>
      {err && (
        <span className="mt-1 text-[13px] text-danger" role="alert">
          {msg(err)}
        </span>
      )}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-[15px] text-faint">{children}</p>;
}

/**
 * Tastaturbedienung einer role="tablist" (WAI-ARIA): Pfeiltasten, Pos1 und Ende bewegen den Fokus.
 * Standard: automatische Aktivierung (der Tab wird sofort gewählt). Mit `manual` wird nur der Fokus
 * bewegt und mit Enter/Leertaste aktiviert (z. B. wenn die Auswahl ein Blatt schließt).
 * Als onKeyDown an die Tabliste hängen; die Reihenfolge von `ids` muss der der Tabs entsprechen.
 */
export function tabKeys<T extends string>(ids: readonly T[], current: T, onChange: (id: T) => void, manual = false) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    const focused = tabs.indexOf(document.activeElement as HTMLElement);
    const i = focused >= 0 ? focused : Math.max(0, ids.indexOf(current));
    const n = ids.length;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0 || !n) return;
    e.preventDefault();
    if (!manual) onChange(ids[next]);
    tabs[next]?.focus();
  };
}

/** Kennungen für Tab und zugehöriges Panel (aria-controls / aria-labelledby) */
export function tabIds(base: string, id: string) {
  return { tab: `${base}-tab-${id}`, panel: `${base}-panel` };
}

/**
 * Tab-Leiste. Mit `idBase` verweisen die Tabs per aria-controls auf das Panel `${idBase}-panel`,
 * das der Aufrufer mit <TabPanel> rendert.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  idBase,
  label,
  sticky = false,
}: {
  tabs: { id: T; label: string; badge?: number; icon?: React.ReactNode }[];
  value: T;
  onChange: (t: T) => void;
  idBase?: string;
  label?: string;
  /** Leiste bleibt beim Scrollen im Gehäuse oben stehen */
  sticky?: boolean;
}) {
  const bar = useRef<HTMLDivElement>(null);
  // Randhinweise, solange die Leiste in diese Richtung weiter scrollt (schmale Bildschirme)
  const [more, setMore] = useState({ l: false, r: false });
  const measure = () => {
    const el = bar.current;
    if (!el) return;
    const l = el.scrollLeft > 2;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore((m) => (m.l === l && m.r === r ? m : { l, r }));
  };
  // aktiven Tab vollständig ins Sichtfeld holen (nur waagerecht – die Seite springt nicht)
  useEffect(() => {
    const el = bar.current;
    const act = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && act) {
      const left = act.offsetLeft - el.offsetLeft;
      if (left < el.scrollLeft) el.scrollLeft = left - 8;
      else if (left + act.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left + act.offsetWidth - el.clientWidth + 8;
    }
    measure();
  }, [value]);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={`no-print relative ${sticky ? 'tabbar-sticky' : ''}`}>
      <div
        ref={bar}
        onScroll={measure}
        className="tabbar tabbar-scroll"
        role="tablist"
        aria-label={label}
        onKeyDown={tabKeys(
          tabs.map((x) => x.id),
          value,
          onChange,
        )}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={idBase ? tabIds(idBase, t.id).tab : undefined}
            aria-controls={idBase && value === t.id ? tabIds(idBase, t.id).panel : undefined}
            aria-selected={value === t.id}
            tabIndex={value === t.id ? 0 : -1}
            className="tabkey whitespace-nowrap px-2.5 sm:px-3"
            onClick={() => onChange(t.id)}
          >
            {t.icon && (
              <span className="hidden text-brass sm:inline" aria-hidden>
                {t.icon}
              </span>
            )}
            {t.label}
            {t.badge ? <span className="rounded-[2px] bg-warn px-1.5 font-mono text-[12px] text-black">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {more.l && (
        <span aria-hidden className="tabbar-hint tabbar-hint-l">
          <ChevronIcon size={16} className="rotate-90" />
        </span>
      )}
      {more.r && (
        <span aria-hidden className="tabbar-hint tabbar-hint-r">
          <ChevronIcon size={16} className="-rotate-90" />
        </span>
      )}
    </div>
  );
}

/** Inhalt zum aktiven Tab einer <Tabs idBase=…>-Leiste */
export function TabPanel({ idBase, value, children, className = '' }: { idBase: string; value: string; children: React.ReactNode; className?: string }) {
  const ids = tabIds(idBase, value);
  return (
    <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} className={className}>
      {children}
    </div>
  );
}

/** true, solange der Browser online ist (serverseitig immer true) */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modaler Dialog: hält den Fokus im Dialog (Tab/Shift+Tab), schließt mit Escape und gibt
 * den Fokus beim Schließen an das zuvor fokussierte Element zurück. Bei gestapelten
 * Dialogen reagiert nur der zuletzt geöffnete (oberste). Ref an das Element mit aria-modal hängen.
 */
export function useModal<E extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<E>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const el = ref.current;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (!el) return;
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev?.isConnected) prev.focus();
    };
  }, []);
  return ref;
}
