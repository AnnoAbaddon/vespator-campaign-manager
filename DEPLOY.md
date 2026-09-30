# Deployment des Vespator Front Campaign Manager

Die App läuft als Docker-Container hinter [Caddy](https://caddyserver.com/). Caddy holt sich das HTTPS-Zertifikat (Let's Encrypt) selbst.

## Voraussetzungen

- Ein Server (VPS) mit Docker und Docker Compose
- Eine Domain oder Subdomain, deren DNS-A/AAAA-Eintrag auf den Server zeigt
- Offene Ports 80 und 443
- Netzzugang beim Bauen: `npm ci` lädt die Pakete, und `next/font/google` lädt die Schriften (EB Garamond u. a.) von Google Fonts. Einen vollständig offline reproduzierbaren Build gibt es derzeit nicht.

## Installation

```bash
git clone <dein-repo> vespator && cd vespator
cp .env.example .env
# .env bearbeiten: DOMAIN=kampagne.deine-domain.de
docker compose up -d --build
```

Danach `https://kampagne.deine-domain.de` öffnen. Beim ersten Aufruf legst du das Spielleiter-Konto an (Benutzername und Passwort).

**Setup-Token:** Die Ersteinrichtung verlangt einen Einmal-Token, damit niemand anderes eine frisch gestartete Instanz übernehmen kann. Solange kein Konto existiert, schreibt die App bei jedem Start einen neuen zufälligen Token ins Log:

```bash
docker compose logs app | grep Ersteinrichtung
# [Ersteinrichtung] Einmal-Token: … – https://kampagne.deine-domain.de/setup-admin?token=…
```

Öffne den Link (der Token ist dann vorbelegt) oder kopiere den Token ins Feld *Setup-Token*. Du kannst auch einen eigenen Token in `.env` festlegen (`SETUP_TOKEN=…`, mindestens 16 Zeichen, z. B. `openssl rand -hex 24`); dann gilt nur dieser. Sobald das Konto angelegt ist, ist der Token wertlos, und `SETUP_TOKEN` kann wieder aus `.env` entfernt werden.

## Daten

Die Daten liegen in benannten Docker-Volumes, nicht in Host-Ordnern. Der Container läuft als Nicht-Root-Nutzer `app`, und benannte Volumes übernehmen dessen Rechte automatisch.

| Volume | Pfad im Container | Inhalt |
|---|---|---|
| `app_data` | `/app/data/app.db` | SQLite-Datenbank (alle Kampagnen, Revisionen, Konto) |
| `app_uploads` | `/app/uploads/` | Hochgeladene Bilder (Avatare, Logos, Schlachtfotos) |
| `app_backups` | `/app/backups/` | Automatische und manuelle Backups je Kampagne (`BACKUP_DIR`) |

Die Backups liegen in einem eigenen Volume. Geht das Daten-Volume kaputt oder wird es versehentlich gelöscht, bleiben die Sicherungen erhalten.

> Willst du doch Host-Ordner mounten (`./data:/app/data`), müssen diese dem Container-Nutzer gehören, z. B. `sudo chown -R $(docker compose run --rm --entrypoint id app -u):$(docker compose run --rm --entrypoint id app -g) data uploads`. Sonst startet die App mit `SQLITE_CANTOPEN`.

## Backup

Die App sichert jede Kampagne automatisch täglich ab 03:00 Uhr (Serverzeit, `TZ`) als Komplett-ZIP (Stand, alle Revisionen, Bilder, Verwaltungsprotokoll) nach `BACKUP_DIR`. Im Docker-Setup ist das das eigene Volume `app_backups` unter `/app/backups`; ohne `BACKUP_DIR` gilt `$DATA_DIR/backups`. Der Tag zählt in derselben Zeitzone wie die Uhrzeit (`TZ`).

Von Hand legt *Einstellungen → Automatische Backups → Jetzt sichern* sofort ein zusätzliches ZIP an (Dateiname mit `-manuell`).

Je Kampagne bleiben die letzten 14 täglichen und zusätzlich die letzten 5 manuellen Sicherungen erhalten. Beide werden getrennt rotiert, manuelle Sicherungen verdrängen also keine täglichen. Archivierte Kampagnen sichert die App nur noch, solange es seit dem Archivieren kein Backup gibt. Schlägt die Sicherung einer Kampagne fehl, laufen die übrigen weiter; der Fehler steht auf der Health-Seite, und der nächste Durchgang (alle 5 Minuten) versucht es erneut.

Außerdem sichert die App täglich ab 03:00 Uhr die ganze Datenbank (`VACUUM INTO`, konsistent im laufenden Betrieb) nach `BACKUP_DIR/db/app-JJJJ-MM-TT.db`; die letzten 7 bleiben erhalten. Zum Wiederherstellen die App stoppen und die Datei als `DATA_DIR/app.db` einsetzen (vorher `app.db-wal` und `app.db-shm` entfernen).

**Backups enthalten Geheimnisse.** In den Datenbank-Sicherungen stehen SMTP-Passwort, Discord-Bot-Token, VAPID-Schlüssel, die Schlüssel der Einmal- und Abmeldelinks sowie die Spielerlinks. Schütze das Backup-Volume und heruntergeladene Sicherungen deshalb wie Zugangsdaten. Sitzungs-IDs sind nur gehasht enthalten.

Was wie zu schützen ist:

| Daten | Enthält | Schutz |
|---|---|---|
| Ganze Datenbank (`app.db`, Volume-Sicherungen, `BACKUP_DIR/db/*.db`) | alle Kampagnen, Kontakte, Passwort-Hashes, SMTP-Passwort, Discord-Token, VAPID-Privatschlüssel, HMAC-Schlüssel, Spielerlinks | wie Zugangsdaten; nie öffentlich teilen, nicht an Issues anhängen |
| Server-Log | vor der Ersteinrichtung den Setup-Token (und damit die Übernahme der Instanz) | Log-Zugriff beschränken; nach der Einrichtung ist der Token wertlos |
| Uploads (`/app/uploads`) | Avatare, Logos, Schlachtfotos (ggf. personenbezogen) | wie die Datenbank |
| Kampagnen-Export (JSON/ZIP aus *Einstellungen → Export*) | eine Kampagne samt Historie und Bildern, ohne Spielerlinks und Instanz-Geheimnisse | nur an Vertrauenspersonen weitergeben (enthält Spielernamen, ggf. Kontaktdaten) |

Ein Kampagnen-Export ist also kein vollständiges Instanz-Backup, und ein Instanz-Backup ist deutlich sensibler als ein Export.

**Backups und Datenschutz:** Löschungen (Kontaktdaten eines Spielers, automatische Bereinigung nach Kampagnenende, Löschen einer Kampagne) wirken sofort in der Datenbank, in allen Revisionen und in den Sandboxes der Kampagne. Ältere Sicherungen enthalten die Daten noch, bis sie herausrotieren: tägliche Kampagnen-Backups nach 14 Tagen, manuelle nach 5 weiteren manuellen Sicherungen, Datenbank-Sicherungen nach 7 Tagen. Beim Löschen einer Kampagne entfernt die App auch deren Backup-Ordner. Externe Kopien (Volume-Sicherungen, heruntergeladene ZIPs) musst du selbst nachziehen. Stellst du eine ältere Sicherung wieder her, sind darin gelöschte Daten wieder da; die Löschungen danach also wiederholen.

**Wiederherstellen:** Unter *Einstellungen → Automatische Backups* siehst du das letzte Backup und kannst jede Sicherung als neue Kampagne wiederherstellen. Die App übernimmt die komplette Historie (Log, Undo, Phasen-Snapshots), damit Codex und Zeitraffer alle Bilder behalten, und trägt den Vorgang mit Kontonamen ins Verwaltungsprotokoll ein. Weil Wiederherstellen eine neue Kampagne anlegt, ist es (wie Anlegen und Importieren) nur Admins erlaubt. Die Kopie startet mit ausgeschalteter Leseansicht und erscheint auch nicht in der Hall of Fame oder Liga. Veröffentlichen musst du sie selbst unter *Einstellungen*.

> **Umstieg von älteren Versionen:** Früher lagen die Backups unter `/app/data/backups`. Sie bleiben dort liegen, erscheinen aber nicht mehr in der App. Bei Bedarf einmalig kopieren: `docker compose exec app sh -c 'cp -a /app/data/backups/. /app/backups/'`.

Da auch der Server selbst ausfallen kann, empfiehlt sich zusätzlich:

1. Nach jeder abgeschlossenen Phase unter *Einstellungen → Export → Komplett-Backup (ZIP inkl. Bilder)* die Kampagne herunterladen.
2. Regelmäßig das ganze Volume sichern:

```bash
docker compose stop app
docker run --rm --volumes-from $(docker compose ps -aq app) -v "$PWD":/backup busybox   tar czf /backup/vespator-backup-$(date +%F).tar.gz /app/data /app/uploads /app/backups
docker compose start app
```

Ein ZIP- oder JSON-Backup lässt sich unter *Kampagnen → Backup importieren* wieder einspielen (nur Admins). Es entsteht immer eine neue Kampagne; ein ZIP bringt Bilder und Historie mit, ein JSON nur den aktuellen Stand.

**Größenlimit beim Import:** Caddy nimmt für `/api/import` höchstens 200 MB an (`request_body … max_size 200MB` im `Caddyfile`), und die App prüft dieselbe Grenze. Alle anderen Anfragen sind auf 12 MB begrenzt. Größere Backups vorher verkleinern (z. B. Fotos entfernen) oder das Limit an beiden Stellen anheben (`Caddyfile` und `MAX_BYTES` in `src/app/api/import/route.ts`). Persönliche Spielerlinks gehören absichtlich nicht zum Backup und müssen nach einer Wiederherstellung neu erzeugt werden.

## Benachrichtigungen

- **E-Mail nur verschlüsselt:** Auf Port 465 (`SMTP_SECURE=1` bzw. *TLS direkt*) läuft die Verbindung von Anfang an über TLS, auf allen anderen Ports ist STARTTLS Pflicht (mindestens TLS 1.2). Bietet der Server kein STARTTLS an, schlägt der Versand fehl, statt Passwort und Mails im Klartext zu senden. Nur für ein lokales Relay ohne TLS (z. B. Postfix auf demselben Host) gibt es die Ausnahme *Unverschlüsselt erlauben (nur lokales Relay)* in den SMTP-Einstellungen bzw. `SMTP_ALLOW_INSECURE=1` für alle Konfigurationen. **Nach dem Update prüfen:** Wer bisher einen Server ohne STARTTLS auf Port 25/587 nutzte, muss diese Ausnahme ausdrücklich setzen, sonst bleiben Mails im Versandprotokoll als fehlgeschlagen stehen.

- Discord: je Kampagne unter *Einstellungen → Benachrichtigungen* einen Webhook eintragen (Discord: Kanal → Integrationen → Webhooks).
- E-Mail: SMTP global unter *Konto → E-Mail-Versand* oder per Umgebungsvariablen (siehe unten). Spieler brauchen eine E-Mail-Adresse im Spielerprofil.
- Ein Hintergrund-Timer im Serverprozess verschickt die Warteschlange (Outbox in der Datenbank) jede Minute und prüft alle 5 Minuten die Deadlines (48 h / 12 h vorher). Jede Nachricht wird nur einmal eingereiht (eindeutiger Schlüssel je Ereignis und Empfänger), auch nach Neustarts.
- Die Zustellung gilt „mindestens einmal“: Bricht der Prozess genau zwischen Versand und Quittung ab, geht die Nachricht nach dem Neustart noch einmal hinaus. Im seltenen Fall kommt sie also doppelt an, verloren geht sie nicht.
- Schlägt ein Versand fehl, folgt der nächste Versuch mit wachsendem Abstand (1, 2, 4, 8 … Minuten). Nach 8 Fehlversuchen gilt die Nachricht als fehlgeschlagen. Discord-Rate-Limits (HTTP 429) zählen nicht als Fehlversuch; die App sendet nach der von Discord genannten Wartezeit erneut.
- Unter *Einstellungen → Benachrichtigungen → Versandprotokoll* setzt der Knopf *Fehlgeschlagene erneut senden* alle fehlgeschlagenen Nachrichten der Kampagne zurück und startet den Versand sofort.
- **`APP_URL` setzen:** Links in E-Mails, Push- und Discord-Nachrichten (Spielerseite, Leseansicht, Abmeldelink, Einmal-Link) bauen auf `APP_URL` auf. Ohne die Variable gilt die Adresse, die ein Admin unter *Konto → Dienste → Öffentliche Adresse* ausdrücklich gespeichert hat, sonst `http://localhost:3000`. Aus Anfragen (Host-Header) übernimmt die App nie eine Adresse. Ältere Versionen haben sich die zuletzt gesehene Admin-Adresse gemerkt; dieser Wert wird nicht mehr verwendet. Im Docker-Setup ist `APP_URL=https://$DOMAIN` bereits gesetzt.
- **E-Mails enthalten den persönlichen Spielerlink:** Jede Benachrichtigung an einen Spieler nennt seinen geheimen Link zur Spielerseite (und ggf. einen Einmal-Link zum Bestätigen). Wer die Mail liest oder weiterleitet, kann im Namen des Spielers handeln. Nutze deshalb nur vertrauenswürdige SMTP-Anbieter, bitte die Spieler, Benachrichtigungen nicht weiterzuleiten, und sperre einen durchgesickerten Link unter *Spielerlinks* oder erzeuge ihn neu. Das macht auch Kalender-Abo, Push-Abos, Discord-Verknüpfung und alle Einmal-Links dieses Spielers ungültig. Je Spieler ist genau eine E-Mail-Adresse erlaubt (keine Listen).
- Test-E-Mails darf nur ein Admin verschicken, an genau eine Adresse und höchstens 5 pro Stunde. Co-Warmaster können nur den Discord-Test auslösen.
- Wird ein Spieler gelöscht oder (weil er schon gespielt hat) nur deaktiviert, sperrt die App seinen Spielerlink samt Push-Abos, Discord-Verknüpfung, Kalender-Abo und Einmal-Links. Nach einer Reaktivierung muss der Spielleiter den Link unter *Spielerlinks* neu erzeugen.
- Web-Push geht nur an die bekannten Push-Dienste der Browser (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`); andere Endpunkte lehnt die App ab. Je Spielerlink bzw. Konto gelten höchstens 5 Geräte, ein weiteres ersetzt das älteste. Ausgehende Anfragen (Discord, Push, SMTP) brechen nach 10 Sekunden ab.

## Anmeldung und Rate-Limit

Nach 5 Fehlversuchen in 15 Minuten sperrt die Anmeldung je IP-Adresse; ab 20 Fehlversuchen für denselben Benutzernamen wird jede Anmeldung um 3 Sekunden gebremst. Die IP-Adresse liest die App nur mit `TRUST_PROXY=1` aus `X-Forwarded-For` bzw. `X-Real-IP`, also nur, wenn sie ausschließlich hinter dem eigenen Reverse Proxy erreichbar ist (im Docker-Setup gesetzt, Caddy setzt die Kopfzeilen). Ohne `TRUST_PROXY` könnte jeder Client die Kopfzeilen fälschen, deshalb teilen sich dann alle Anmeldungen ein gemeinsames Limit (Next.js gibt Server Actions keine Socket-Adresse). Läuft die App ohne Proxy direkt im Internet, sperren 5 Fehlversuche von irgendwem die Anmeldung für alle für 15 Minuten.

Abgelaufene Sitzungen, verschickte Nachrichten älter als 30 Tage, verbrauchte Einmal-Links und abgelaufene Discord-Codes räumt die App alle 5 Minuten auf.

Erfolgreiche Anmeldungen, Fehlversuche und Sperren durch das Rate-Limit stehen im Verwaltungsprotokoll (*Konto*, nur für Admins sichtbar), mit Benutzername und gekürzter IP-Adresse (IPv4 /24, IPv6 /48), nie mit Passwort. Fehlversuche und Sperren trägt die App je IP höchstens einmal pro Minute ein. Nach 90 Tagen werden die Einträge gelöscht.

## Sitzungen und Passwörter

- Eine Sitzung gilt 30 Tage ab der letzten Nutzung, höchstens aber 90 Tage ab der Anmeldung; danach ist eine neue Anmeldung nötig. Eine Anmeldung beendet die vorherige Sitzung desselben Browsers, Abmelden und Passwortwechsel beenden die Sitzungen serverseitig.
- Sitzungs-IDs stehen nur als SHA-256-Hash in der Datenbank, Datenbank-Sicherungen enthalten also keine gültigen Anmelde-Cookies.
- Über HTTPS heißt das Sitzungs-Cookie `__Host-vf_session` (an Host, `Secure` und `Path=/` gebunden, Nachbar-Subdomains können es nicht unterschieben). Mit `INSECURE_COOKIES=1` (lokale HTTP-Tests) heißt es weiter `vf_session`.
- **Einmalige Abmeldung beim Update:** Beim ersten Start dieser Version löscht die App alle bestehenden Sitzungen (Umstellung auf gehashte IDs). Alle Konten müssen sich einmal neu anmelden; Daten gehen dabei nicht verloren.
- Neue Passwörter (Ersteinrichtung, Einladung, Passwortwechsel) haben 10 bis 256 Zeichen und dürfen keines der verbreitetsten Passwörter sein (eingebaute Sperrliste). Bestehende Passwörter bleiben gültig.

## Sicherheits-Kopfzeilen

Die App setzt für jede Antwort (auch statische Dateien, Uploads und Prefetch-Anfragen) `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (Kamera, Mikrofon, Standort, Zahlungen u. a. aus), `Cross-Origin-Opener-Policy: same-origin` und `Cross-Origin-Resource-Policy: same-origin`. Seiten mit geheimen Links sowie Verwaltung und Anmeldung bekommen zusätzlich `X-Robots-Tag: noindex, nofollow`. Wegen `same-origin` gehen Spieler- und Leselinks, die geheime Schlüssel enthalten, nie als Referrer an fremde Seiten. `no-referrer` ginge nicht, weil Browser dann bei eigenen Formularen `Origin: null` senden und Next.js die Aktionen ablehnt. Die Content-Security-Policy mit Nonce setzt der Proxy der App, HSTS setzt Caddy. Eigene POST-Endpunkte (`/api/import`, `/api/discord/interactions`) lehnen Anfragen fremder Seiten ab (`Origin`/`Sec-Fetch-Site`).

> **Caddy-Zugriffsprotokoll:** Standardmäßig protokolliert Caddy keine Zugriffe. Wer eine `log`-Direktive ergänzt, schreibt die geheimen Links (`/p/…`, `/v/…`, `/kalender/…`, Einladungen) auf die Platte. Dann die URI filtern (`log { format filter { request>uri … } }`) oder kein Zugriffsprotokoll führen.

## Datenschutz und Impressum

Unter *Konto → Administration → Datenschutz und Impressum* hinterlegst du als Admin beide Texte (Markdown). Sie erscheinen unter `/datenschutz` und `/impressum` und sind im Fuß der Anmeldung, der Leseansicht, der Spielerseite und der Verwaltung verlinkt.

- Datenschutz: Ohne eigenen Text zeigt die App eine neutrale Vorlage in der Sprache des Lesers (welche Daten gespeichert werden, Empfänger wie SMTP-Anbieter, Discord und Push-Dienste, Speicherdauer, Rechte), mit dem deutlichen Hinweis, dass der Verantwortliche noch fehlt. Die Vorlage ersetzt keine Prüfung. Name bzw. Verein, Anschrift und Kontakt musst du selbst eintragen; dazu kannst du die Vorlage kopieren und ergänzen.
- Impressum: Ohne Eintrag steht dort nur ein Hinweis, dass keines hinterlegt ist. Für Vereine und „geschäftsmäßige“ Angebote ist in Deutschland ein Impressum nach § 5 DDG üblich.

## Kalender-Abo

Jede Spielerseite zeigt einen Kalender-Link der Form `/kalender/<kampagne>/<spieler>/<schlüssel>.ics` mit den bestätigten Schlachtterminen des Spielers. Der Link ist nur lesend. Er erlaubt keine Aktionen und verrät den persönlichen Spielerlink nicht, darf also an Kalenderdienste (Google, Apple, Outlook) weitergegeben werden. Der Schlüssel hängt von einem zufälligen Geheimnis in der Datenbank und vom gültigen Spielerlink ab: Wird der Spielerlink gesperrt oder neu erzeugt, ist auch der Kalender-Link ungültig (die Spielerseite zeigt danach den neuen).

## Web-App und Service Worker

Die App ist als PWA installierbar. Der Service Worker (`/sw.js`) wird mit der Build-Kennung registriert (`/sw.js?v=<BUILD_ID>`), sodass jeder neue Build den alten Service Worker und seine Caches ersetzt. Ohne Angabe erzeugt jeder Build eine neue Kennung. Optional lässt sie sich festlegen, z. B. auf den Git-Commit:

```bash
docker compose build --build-arg BUILD_ID=$(git rev-parse --short HEAD) && docker compose up -d
# ohne Docker
BUILD_ID=$(git rev-parse --short HEAD) npm run build
```

Offline lesbar bleiben die Leseansicht und, für höchstens 24 Stunden, die Spielerseiten. Ein gesperrter oder erneuerter Spielerlink entfernt beim nächsten Aufruf mit Verbindung alle zwischengespeicherten Seiten dieses Links. Auf gemeinsam genutzten Geräten die Website-Daten des Browsers löschen, wenn ein Spieler das Gerät abgibt.

## Update

```bash
git pull
docker compose build --pull && docker compose up -d
```

`--pull` holt dabei die aktuellen Basis-Images. Die Images sind auf feste Versionen gepinnt (`Dockerfile`: `NODE_IMAGE=node:24.21.0-slim`, `docker-compose.yml`: `caddy:2.11.4`). Für Sicherheitsupdates von Node.js oder Caddy den Tag anheben und neu bauen. Am besten einmal im Monat neu bauen.

## Container-Härtung

`docker-compose.yml` startet die App mit eingeschränkten Rechten:

| Einstellung | Wirkung |
|---|---|
| `read_only: true` | Dateisystem des Containers schreibgeschützt; beschreibbar sind nur die Volumes `/app/data`, `/app/uploads`, `/app/backups` |
| `tmpfs: /tmp, /app/.next/cache` | flüchtige Verzeichnisse im Arbeitsspeicher (Temporärdateien, Next.js-Cache) |
| `cap_drop: [ALL]` | keine Linux-Capabilities |
| `security_opt: no-new-privileges:true` | keine Rechteausweitung (setuid) |
| `mem_limit: 1g` | Speichergrenze (HEIC-Umwandlung braucht bis zu ~512 MB) |
| `pids_limit: 256` | Höchstzahl an Prozessen/Threads |
| `USER app` (Dockerfile) | Die App läuft als Nicht-Root-Nutzer |

Caddy läuft mit `cap_drop: [ALL]`, `cap_add: [NET_BIND_SERVICE]` und `no-new-privileges`. **Nach dem Update einmal testen:** anmelden, ein Bild (auch HEIC) hochladen, ein Backup anlegen und importieren. Meldet das Log `EROFS` (read-only file system) oder bricht die App mit Speicherfehlern ab, den betreffenden Pfad als `tmpfs` ergänzen bzw. `mem_limit` erhöhen; notfalls `read_only` auskommentieren.

## Lokaler Test ohne HTTPS

```bash
# .env
DOMAIN=localhost
INSECURE_COOKIES=1
```

Mit `INSECURE_COOKIES=1` setzt die App das Session-Cookie ohne `Secure`-Flag, und die CSP enthält kein `upgrade-insecure-requests`. So funktioniert der Login auch über `http://`. **Im Internet immer `INSECURE_COOKIES=0` lassen.**

Ohne Docker geht es so (Node.js 24.21 oder neuer 24.x):

```bash
npm ci
npm run build
INSECURE_COOKIES=1 npm start
```

## Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `DOMAIN` | – | Domain für Caddy |
| `APP_URL` | `https://$DOMAIN` | Basis-URL für öffentliche Links und Links in Nachrichten (setzen! Sonst gilt die unter *Konto → Dienste* gespeicherte Adresse, ohne diese `http://localhost:3000`) |
| `TRUST_PROXY` | `1` (Docker), sonst `0` | `1`: IP-Adresse für das Login-Rate-Limit aus `X-Forwarded-For`/`X-Real-IP` lesen; nur hinter dem eigenen Reverse Proxy setzen |
| `DATA_DIR` | `/app/data` | Ort der SQLite-Datenbank |
| `UPLOAD_DIR` | `/app/uploads` | Ort der Bilder |
| `UPLOAD_QUOTA_MB` | `200` | Speicherplatz für Bilder je Kampagne in MB; ist er voll, lehnt die App weitere Uploads dieser Kampagne ab |
| `INSECURE_COOKIES` | `0` | `1` nur für lokale HTTP-Tests |
| `TZ` | `Europe/Berlin` | Zeitzone (auch für die Backup-Uhrzeit) |
| `BACKUP_DIR` | `/app/backups` (Docker), sonst `$DATA_DIR/backups` | Ort der automatischen und manuellen Backups |
| `BUILD_ID` | neu je Build | Nur beim Build: Version des Service Workers (optional) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | – | E-Mail-Versand (Einstellungen im Konto haben Vorrang); `SMTP_SECURE=1` für Port 465, sonst ist STARTTLS Pflicht |
| `SMTP_ALLOW_INSECURE` | `0` | `1` erlaubt SMTP ohne erzwungenes TLS (nur lokales Relay) |
| `SETUP_TOKEN` | – | Fester Einmal-Token für die Ersteinrichtung (mindestens 16 Zeichen); ohne Angabe steht ein zufälliger Token im Log |
| `DISABLE_SCHEDULER` | `0` | `1` schaltet Versand, automatische Backups, Datenbereinigung und Wartung ab (E2E-Tests) |
| `GIT_COMMIT`, `SOURCE_COMMIT` | – | Optional: Commit-Kennung für die Health-Seite (`GIT_COMMIT` hat Vorrang) |
| `NEXT_PUBLIC_FLAVOR` | `neutral` | Nur beim Build: Motive, die im Code gezeichnet sind (Wachssiegel, Wahlsprüche auf den Kartenrahmen): `neutral` oder `imperial`. `next build` bettet den Wert ein (Docker: Build-Argument, siehe `docker-compose.yml`); eine Änderung braucht einen neuen Build |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` | Nur beim Build: Standardsprache der Installation (`de`, `en`, `fr`, `es`, `pl`). Sie ist der letzte Rückfall der Sprachwahl und belegt die Ersteinrichtung vor, wenn die Browsersprache nicht unterstützt wird. Deutsche Installationen setzen `NEXT_PUBLIC_DEFAULT_LOCALE=de` als Build-Argument (`.env` für `docker compose build` oder `docker build --build-arg NEXT_PUBLIC_DEFAULT_LOCALE=de`). Die bei der Ersteinrichtung gespeicherte Standardsprache (*Administration → Standardsprache*) geht immer vor; bestehende Installationen behalten ihre Sprache auch mit einem neuen Build |

Alle Laufzeitvariablen mit Kommentaren stehen auch in [`.env.example`](.env.example). `docker-compose.yml` reicht sie (außer `GIT_COMMIT`/`SOURCE_COMMIT`) an den Container weiter.

Healthcheck: `GET /api/health`.

## Passwort vergessen

Solange ein Admin existiert, gibt es keinen Reset über die Oberfläche. Notfalls die Tabellen `admin` und `session` in `data/app.db` leeren und die App neu starten. Danach erscheint wieder die Ersteinrichtung, geschützt durch einen neuen Setup-Token, der wie bei der Installation im Log steht (bzw. `SETUP_TOKEN` aus `.env`):

```bash
docker compose exec app node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/app/data/app.db');d.exec('DELETE FROM session; DELETE FROM admin;')"
docker compose restart app
docker compose logs app | grep Ersteinrichtung
```

Zwischen dem Leeren und dem Neuanlegen kann niemand ohne Token das Konto übernehmen.
