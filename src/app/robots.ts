import type { MetadataRoute } from 'next';

/** Geheime Links (Leseansicht, Spielerseite, Einmal-Links, Kalender …), Verwaltung und API nie crawlen */
const ROBOTS_DISALLOW = ['/v/', '/p/', '/hall/', '/liga/', '/bestaetigen/', '/abmelden/', '/kalender/', '/einladung/', '/meldung/', '/admin', '/login', '/setup-admin', '/api/'];

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: ROBOTS_DISALLOW }] };
}
