import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Alegreya_Sans, Cinzel, EB_Garamond, Share_Tech_Mono } from 'next/font/google';
import './globals.css';
import { Pwa } from '@/components/Pwa';
import { SiteFooter } from '@/components/SiteFooter';
import { SkipLink } from '@/components/SkipLink';
import { planetArtEnabled } from '@/server/db';
import { makeT } from '@/i18n/core';
import { requestLocale } from '@/server/requestLocale';
import { i18nOverrides } from '@/server/i18nStore';
import { I18nOverrides } from '@/i18n/client';
import { THEME_SCRIPT, themeApplies } from '@/components/themeCore';

const body = Alegreya_Sans({ subsets: ['latin'], weight: ['400', '500', '700', '800'], variable: '--font-body' });
const cinzel = Cinzel({ subsets: ['latin'], weight: ['500', '700', '900'], variable: '--font-cinzel' });
const serif = EB_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-garamond' });
const mono = Share_Tech_Mono({ subsets: ['latin'], weight: '400', variable: '--font-techmono' });

export async function generateMetadata(): Promise<Metadata> {
  const t = makeT(await requestLocale());
  return {
    title: { default: 'Vespator Front', template: '%s · Vespator Front' },
    description: t('Kampagnenverwaltung für War on the Vespator Front'),
    appleWebApp: { capable: true, title: 'Vespator Front', statusBarStyle: 'black-translucent' },
    icons: { apple: '/icons/icon-192.png' },
  };
}

export const viewport: Viewport = { themeColor: '#080b0b', colorScheme: 'dark' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Dynamisches Rendering erzwingen: nur so erhalten alle Skripte die CSP-Nonce aus dem Proxy
  const h = await headers();
  // NTH2 5.3: helles Archiv-Thema der Leseansicht/Spielerseite vor dem ersten Zeichnen setzen (nur /v/ und /p/)
  const themed = themeApplies(h.get('x-vf-path'));
  // Sprache aus dem Kontext: Konto (Verwaltung), Spieler, Kampagne (Leseansicht), sonst Cookie
  const locale = await requestLocale();
  const t = makeT(locale);
  return (
    <html lang={locale} suppressHydrationWarning data-planet-art={planetArtEnabled() ? 'on' : 'off'} className={`${body.variable} ${cinzel.variable} ${serif.variable} ${mono.variable}`}>
      {themed && (
        <head>
          <script nonce={h.get('x-nonce') ?? undefined} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        </head>
      )}
      <body className="font-sans antialiased">
        <SkipLink label={t('Zum Inhalt')} />
        <Pwa locale={locale} />
        <I18nOverrides dicts={i18nOverrides()}>{children}</I18nOverrides>
        {/* Nicht in den Ein-Bildschirm-Apps (Cockpit, Leseansicht, Spielerseite): dort steht der CreditsLink in der Shell */}
        <SiteFooter>
          <footer className="credits no-print mx-auto max-w-7xl px-4 py-8 text-center">
            <span className="mb-1 block font-display text-[13px] uppercase tracking-[0.1em] text-brass">{t('Ende der Übertragung')}</span>
            {t('Inoffizielles Fanprojekt, keine Verbindung zu Games Workshop. Warhammer 40,000 ist eine Marke von Games Workshop. Regeln: „War on the Vespator Front“ aus 500 Worlds: Titus – Regeltexte siehe Buch.')}
            <br />
            {t('Icons: game-icons.net (Lorc, Delapouite u. a., CC BY 3.0) · Schriften: SIL OFL 1.1 · Herkunft und Lizenzen aller Bilder –')}{' '}
            <a href={`/credits?lang=${locale}`}>{t('Nachweise')}</a>
            <a href={`/datenschutz?lang=${locale}`}>{t('Datenschutz')}</a>
            <a href={`/impressum?lang=${locale}`}>{t('Impressum')}</a>
          </footer>
        </SiteFooter>
      </body>
    </html>
  );
}
