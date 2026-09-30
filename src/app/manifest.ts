import type { MetadataRoute } from 'next';
import { makeT } from '@/i18n/core';
import { readerLocale } from '@/server/requestLocale';

/** Installierbare Web-App (N5.3) – in der Sprache des Lesers (Sprachschalter, Standardsprache, Browser) */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await readerLocale();
  const t = makeT(locale);
  return {
    name: t('Vespator Front – Kampagnenverwaltung'),
    short_name: 'Vespator Front',
    description: t('Kampagne „War on the Vespator Front“: Karte, Punkte, Schlachten und Befehle'),
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0806',
    theme_color: '#1b1610',
    lang: locale,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
