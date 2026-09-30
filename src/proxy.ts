import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const upgrade = !isDev && process.env.INSECURE_COOKIES !== '1';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    upgrade ? 'upgrade-insecure-requests' : '',
  ]
    .filter(Boolean)
    .join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const p = request.nextUrl.pathname;
  // Sprache (N5.4): Pfad für das Root-Layout; ?lang=de|en gilt für diese Anfrage und wird in der
  // Leseansicht als Wahl des Lesers gespeichert (Links von der Spielerseite tragen die Spielersprache)
  requestHeaders.set('x-vf-path', p);
  requestHeaders.delete('x-vf-lang');
  const lang = request.nextUrl.searchParams.get('lang');
  const chosen = lang && ['de', 'en', 'fr', 'es', 'pl'].includes(lang) ? lang : null;
  if (chosen) {
    requestHeaders.set('x-vf-lang', chosen);
    if (p.startsWith('/v/')) {
      const rest = (request.headers.get('cookie') ?? '').split(/;\s*/).filter((c) => c && !c.startsWith('vf_lang='));
      requestHeaders.set('cookie', [...rest, `vf_lang=${chosen}`].join('; '));
    }
  }
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (chosen && p.startsWith('/v/')) res.cookies.set('vf_lang', chosen, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  res.headers.set('Content-Security-Policy', csp);
  // Statische Sicherheits-Kopfzeilen (nosniff, Referrer-Policy, X-Robots-Tag …) setzt next.config.ts für alle Antworten
  // Nur Komfort-Weiterleitung – die Seiten prüfen die Sitzung selbst. Cookie-Name je nach Secure (__Host-Präfix)
  if ((p === '/admin' || p.startsWith('/admin/')) && !request.cookies.get('__Host-vf_session') && !request.cookies.get('vf_session')) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }
  return res;
}

/**
 * Läuft auch für Prefetch-Anfragen (früher per `missing` ausgenommen): sonst lieferte ein Dokument-Prefetch
 * (`Purpose: prefetch`) vollständiges HTML ohne CSP. Statische Dateien, Bilder und der Import brauchen keine Nonce.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/uploads|api/import).*)'],
};
