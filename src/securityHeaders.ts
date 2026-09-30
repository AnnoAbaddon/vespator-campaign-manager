/**
 * Statische Sicherheits-Kopfzeilen für alle Antworten (next.config.ts `headers()`), auch dort, wo der Proxy nicht
 * läuft (statische Dateien, Uploads, Import). Die CSP mit Nonce setzt weiterhin der Proxy (src/proxy.ts).
 * Ohne Abhängigkeiten, damit next.config.ts und Tests sie laden können.
 */

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/** Präfixe der geheimen Links und Anmeldeseiten – nicht indexieren (auch in robots.ts) */
export const NOINDEX_PREFIXES = ['/p', '/v', '/bestaetigen', '/kalender', '/einladung', '/meldung', '/abmelden', '/hall', '/liga', '/admin', '/login', '/setup-admin'];

export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'serial=()',
  'usb=()',
  'xr-spatial-tracking=()',
].join(', ');

export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Leseansicht, Spielerseite & Co. sind Links mit geheimem Schlüssel (Capability-URLs): nie an fremde Seiten als
  // Referrer weitergeben. Bewusst nicht „no-referrer“: damit senden Browser bei eigenen POST-Anfragen `Origin: null`,
  // und die CSRF-Prüfung der Server Actions (Origin gegen Host) lehnt jede Aktion ab.
  { key: 'Referrer-Policy', value: 'same-origin' },
  // zusätzlich zu frame-ancestors 'none' in der CSP (ältere Browser)
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Service Worker, Manifest, Icons und Uploads werden nur von der eigenen Seite geladen
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

export function securityHeaderRules(): HeaderRule[] {
  return [
    { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
    ...NOINDEX_PREFIXES.map((p) => ({ source: `${p}/:path*`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] })),
  ];
}
