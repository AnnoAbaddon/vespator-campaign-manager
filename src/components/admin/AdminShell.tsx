import Link from 'next/link';
import { GameIcon } from '@/components/icons/GameIcon';
import { BookIcon } from '@/components/icons';
import { CreditsLink } from '@/components/CreditsLink';
import { makeT, type Locale } from '@/i18n/core';

type Section = 'list' | 'settings' | 'faq' | 'help' | 'calendar' | 'league' | 'ops';

/**
 * Terminal-Hülle der Verwaltungsseiten außerhalb einer Kampagne (Kampagnenliste, Konto, Regel-FAQ, Hilfe):
 * wie das Cockpit Kopfzeile plus Raster aus Gehäusen – links Navigation mit Kathedrale, Mitte die
 * Hauptfläche, rechts optional eine Seitenspalte. Genau ein Bildschirm; jedes Gehäuse scrollt für sich.
 * Mobil: eine Spalte, die als Ganzes innerhalb des Bildschirms scrollt (keine Seitenscroll-Leiste).
 */
export function AdminShell({
  locale,
  active,
  user,
  title,
  icon,
  children,
  side,
  sideTitle,
  sideIcon,
  sideFlatMobile = false,
  sideFoldMobile = false,
}: {
  locale: Locale;
  active: Section;
  /** „Angemeldet als …“ */
  user: string;
  title: string;
  icon?: string;
  children: React.ReactNode;
  side?: React.ReactNode;
  sideTitle?: string;
  sideIcon?: string;
  /** Mobil: Seitenspalte ohne eigenes Gehäuse und Schild (kein zweites Messingschild direkt unter dem ersten) */
  sideFlatMobile?: boolean;
  /** Mobil: Seitenspalte als einklappbarer Abschnitt (nachrangige Inhalte wie das Verwaltungsprotokoll) */
  sideFoldMobile?: boolean;
}) {
  const t = makeT(locale);
  const nav: { id: Section; href: string; label: string; icon: string }[] = [
    { id: 'list', href: '/admin', label: t('Kampagnen'), icon: 'ui_PLANET' },
    // NTH2 2.5: Club-Kalender aller Kampagnen
    { id: 'calendar', href: '/admin/kalender', label: t('Kalender'), icon: 'op_BATTLE' },
    { id: 'settings', href: '/admin/settings', label: t('Konto'), icon: 'ui_COG' },
    { id: 'faq', href: '/admin/faq', label: t('Regel-FAQ'), icon: 'ui_SCROLL' },
    // Hilfe zum Umgang mit der App (docs/GUIDE*.md)
    { id: 'help', href: '/admin/hilfe', label: t('Hilfe'), icon: 'book' },
    // P3: Liga (NTH2 3.1) und Betrieb (Health, Datenschutz, Übersetzungen – NTH2 6.2/6.4/7.2)
    { id: 'league', href: '/admin/liga', label: t('Liga'), icon: 'ui_TROPHY' },
    { id: 'ops', href: '/admin/betrieb', label: t('Betrieb'), icon: 'ui_COG' },
  ];
  return (
    <div
      className={`bay-grid admin-flat mx-auto h-[calc(100dvh-var(--hdr))] max-w-[1920px] space-y-5 overflow-y-auto px-2 pb-4 pt-5 sm:px-4 lg:grid lg:grid-rows-[minmax(0,1fr)] lg:gap-[var(--gap)] lg:space-y-0 lg:overflow-visible lg:px-[var(--gap)] lg:pb-[var(--gap)] lg:pt-[calc(var(--gap)+4px)] ${
        side ? 'bay-3 lg:grid-cols-[250px_minmax(0,1fr)_440px] 2xl:grid-cols-[260px_minmax(0,1fr)_460px]' : 'lg:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]'
      }`}
    >
      {/* Linke Leiste: Navigation, Anmeldung, Kathedrale */}
      <aside className="no-print hidden min-h-0 lg:block">
        <nav className="hud frame flex h-full flex-col gap-4 overflow-hidden p-3 pt-4" aria-label={t('Verwaltung')}>
          <div className="relative z-[1] min-h-0 space-y-4 overflow-y-auto pr-0.5">
            <div>
              <p className="font-display text-[17px] font-bold uppercase leading-tight tracking-[0.04em] text-ink [text-shadow:0_1px_0_#000]">{t('Kommando')}</p>
              <p className="readout mt-0.5">{user}</p>
            </div>
            <ul className="space-y-1.5">
              {nav.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} className="navkey" aria-current={active === n.id ? 'page' : undefined}>
                    {n.icon === 'book' ? (
                      <BookIcon size={20} className={active === n.id ? 'text-[#f3e2b4]' : 'text-brass'} />
                    ) : (
                      <GameIcon name={n.icon} size={20} color={active === n.id ? '#f3e2b4' : '#b3975f'} />
                    )}
                    <span className="flex-1 truncate">{n.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div
            aria-hidden
            className="pointer-events-none relative -mx-3 -mb-3 min-h-0 flex-1 bg-[url('/ui/cathedral.webp')] bg-[length:100%_auto] bg-bottom bg-no-repeat opacity-80 [mask-image:linear-gradient(180deg,transparent,#000_35%)]"
          />
          <CreditsLink locale={locale} className="relative z-[1] -mt-2 text-center" />
        </nav>
      </aside>

      <Housing title={title} icon={icon}>
        {children}
      </Housing>
      {side && (
        <Housing title={sideTitle ?? ''} icon={sideIcon} flatMobile={sideFlatMobile} className={sideFoldMobile ? 'max-lg:hidden' : ''}>
          {side}
        </Housing>
      )}
      {side && sideFoldMobile && (
        <section className="hud frame p-2 sm:p-3 lg:hidden" aria-label={sideTitle}>
          <details className="fold relative z-[1]">
            <summary>
              {sideIcon && <GameIcon name={sideIcon} size={18} color="#b3975f" />}
              <span className="flex-1">{sideTitle}</span>
            </summary>
            <div className="pt-2">{side}</div>
          </details>
        </section>
      )}
      <CreditsLink locale={locale} className="pb-2 text-center lg:hidden" />
    </div>
  );
}

/** Großes Gehäuse mit Messingschild; der Inhalt scrollt darunter (Schild und Beschläge bleiben sichtbar) */
export function Housing({ title, icon, children, className = '', flatMobile = false }: { title: string; icon?: string; children: React.ReactNode; className?: string; flatMobile?: boolean }) {
  return (
    <section
      className={`hud frame flex min-h-0 min-w-0 flex-col p-2 pt-7 sm:p-4 sm:pt-7 ${flatMobile ? 'max-lg:border-0 max-lg:bg-transparent max-lg:bg-none max-lg:p-0! max-lg:shadow-none max-lg:before:hidden max-lg:after:hidden' : ''} ${className}`}
      aria-label={title}
    >
      <h2 className={`plate plate-head max-w-[calc(100%-40px)] truncate ${flatMobile ? 'max-lg:hidden' : ''}`}>
        {icon && <GameIcon name={icon} size={16} color="#1d1608" />}
        {title}
      </h2>
      <span className="emblem-watermark" aria-hidden />
      <div className="relative z-[1] min-h-0 flex-1 lg:-mr-2 lg:overflow-y-auto lg:pr-2">{children}</div>
    </section>
  );
}
