import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { requestLocale, tFor } from '@/i18n/server';
import { StatusScreen } from '@/components/StatusScreen';

/** Geheime Links (Leseansicht, Spielerseite, Hall of Fame, Liga): der Warmaster erzeugt sie neu */
const isSecretLink = (path: string) => /^\/(v|p|hall|liga)\//.test(path);

export async function generateMetadata(): Promise<Metadata> {
  const path = (await headers()).get('x-vf-path') ?? '';
  const t = tFor(await requestLocale());
  return { title: isSecretLink(path) ? t('Link ungültig') : t('Signal verloren'), robots: { index: false, follow: false } };
}

export default async function NotFound() {
  // Sprache der Anfrage (Wahl, Kontext des Pfads, Standardsprache, Browser)
  const locale = await requestLocale();
  const t = tFor(locale);
  const secret = isSecretLink((await headers()).get('x-vf-path') ?? '');
  return secret ? (
    // Ohne Verweis auf die Verwaltung: Leser und Spieler haben dort keinen Zugang
    <StatusScreen plate={t('Signal verloren')} code="404" title={t('Link ungültig')} text={t('Link ungültig oder neu erzeugt – bitte beim Warmaster einen neuen Link anfordern.')} locale={locale} />
  ) : (
    <StatusScreen plate={t('Signal verloren')} code="404" title={t('Seite nicht gefunden')} text={t('Diese Seite existiert nicht oder der Link ist nicht mehr gültig.')} locale={locale}>
      <Link href="/" className="btn btn-primary">
        {t('Zur Startseite')}
      </Link>
    </StatusScreen>
  );
}
