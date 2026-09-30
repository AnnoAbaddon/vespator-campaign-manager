/* Service Worker (N5.3): Leseansicht und Spielerseite offline lesbar. Keine Offline-Eingaben. */
// Version je Build (Registrierung mit ?v=<Build-ID>) – alte Caches werden beim Aktivieren gelöscht
const VERSION = `vf-${new URL(self.location.href).searchParams.get('v') || 'dev'}`;
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => prunePlayerPages())
      .then(() => self.clients.claim()),
  );
});

/**
 * Spielerseiten (/p/<token>) enthalten den geheimen Link und Allianz-Geheimnisse. Sie bleiben höchstens 24 Stunden
 * offline lesbar (Zeitstempel im Cache), und ein gesperrter oder erneuerter Link (404/403) entfernt alle Seiten
 * dieses Links – auch Unterseiten wie /p/<token>/battles/….
 */
const PLAYER_MAX_AGE = 24 * 3600 * 1000;
const STAMP = 'x-vf-cached-at';
const playerPrefix = (url) => {
  const m = /^\/p\/([^/?#]+)/.exec(url.pathname);
  return m ? `/p/${m[1]}` : null;
};
const expired = (res) => {
  const at = Number(res.headers.get(STAMP));
  return !Number.isFinite(at) || Date.now() - at > PLAYER_MAX_AGE;
};
async function stamped(res) {
  const h = new Headers(res.headers);
  h.set(STAMP, String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}
async function prunePlayerPages(prefix) {
  const cache = await caches.open(PAGES);
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (!u.pathname.startsWith('/p/')) continue;
    if (prefix ? u.pathname === prefix || u.pathname.startsWith(`${prefix}/`) : expired((await cache.match(req)) ?? new Response(null))) await cache.delete(req);
  }
}

const isAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/art/') ||
  url.pathname.startsWith('/icons/') ||
  url.pathname.startsWith('/api/uploads/') ||
  url.pathname === '/icon.svg';

/** Nur öffentliche Seiten und Spielerseiten zwischenspeichern – nie die Verwaltung */
const isReadable = (url) => url.pathname.startsWith('/v/') || url.pathname.startsWith('/p/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Statische Dateien und Bilder: aus dem Cache, im Hintergrund aktualisieren
  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        const net = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  // Seiten der Leseansicht/Spielerseite (inkl. RSC-Abrufe): Netz zuerst, offline der letzte Stand
  if (isReadable(url)) {
    const player = playerPrefix(url);
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Kopie sofort anlegen – später ist der Body schon gelesen; Spielerseiten mit Zeitstempel (höchstens 24 h)
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then(async (c) => c.put(req, player ? await stamped(copy) : copy));
          } else if (res.status === 404 || res.status === 403) {
            // gesperrter oder ungültiger Link: zwischengespeicherte Fassungen sofort entfernen (alle Seiten des Links)
            if (player) prunePlayerPages(player);
            else caches.open(PAGES).then((c) => c.delete(req, { ignoreSearch: true, ignoreVary: true }));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          const hit = await cache.match(req, { ignoreVary: true });
          if (hit && player && expired(hit)) await cache.delete(req);
          else if (hit) return hit;
          return new Response(await offlinePage(url), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }),
    );
  }
});

/** Ersatzseite ohne Verbindung in allen Sprachen: ?lang= der Seite, sonst Sprachschalter (Cookie vf_lang), sonst Sprache des Browsers, sonst Englisch */
const OFFLINE = {
  de: { title: 'Keine Verbindung', text: 'Diese Seite wurde noch nicht zwischengespeichert. Sobald die Verbindung wieder da ist, lädt sie normal.' },
  en: { title: 'No connection', text: 'This page has not been cached yet. It will load normally as soon as the connection is back.' },
  fr: { title: 'Pas de connexion', text: 'Cette page n’a pas encore été mise en cache. Elle se chargera normalement dès que la connexion sera rétablie.' },
  es: { title: 'Sin conexión', text: 'Esta página aún no se ha guardado en caché. Se cargará con normalidad en cuanto vuelva la conexión.' },
  pl: { title: 'Brak połączenia', text: 'Ta strona nie została jeszcze zapisana w pamięci podręcznej. Załaduje się normalnie, gdy tylko połączenie wróci.' },
};
const offlineLang = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(OFFLINE, v) ? v : null);
// Build-Standardsprache (NEXT_PUBLIC_DEFAULT_LOCALE), von src/components/Pwa.tsx als ?dl= beim Registrieren übergeben
const BUILD_LANG = offlineLang(new URL(self.location.href).searchParams.get('dl')) || 'en';
async function offlinePage(url) {
  const q = offlineLang(url.searchParams.get('lang'));
  let cookie = null;
  try {
    // Cookie Store API (im Service Worker ohne document.cookie); fehlt sie, gilt die Browsersprache
    const c = self.cookieStore ? await self.cookieStore.get('vf_lang') : null;
    cookie = c ? offlineLang(c.value) : null;
  } catch {
    cookie = null;
  }
  const browser = offlineLang(String(self.navigator && self.navigator.language ? self.navigator.language : '').toLowerCase().slice(0, 2));
  const lang = q || cookie || browser || BUILD_LANG;
  const o = OFFLINE[lang];
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline</title><body style="background:#0a0806;color:#efe3c8;font-family:sans-serif;padding:2rem"><h1>${o.title}</h1><p>${o.text}</p>`;
}

// ─── Web-Push (NTH2 1.1) ─────────────────────────────────────────────────────
// Nachricht vom Server: { title, body, url, tag }. Ohne lesbaren Inhalt eine neutrale Meldung.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Vespator Front';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    }),
  );
});

// Klick: passende Seite öffnen – ein bereits offenes Fenster derselben Adresse wird nach vorn geholt
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/';
  // nur Ziele auf dieser Seite öffnen
  const target = new URL(raw, self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
