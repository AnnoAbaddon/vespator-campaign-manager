# Deploying the Vespator Front Campaign Manager

The app runs as a Docker container behind [Caddy](https://caddyserver.com/). Caddy obtains the HTTPS certificate (Let's Encrypt) on its own.

## Requirements

- A server (VPS) with Docker and Docker Compose
- A domain or subdomain whose DNS A/AAAA record points to the server
- Open ports 80 and 443
- Network access during the build: `npm ci` downloads the packages, and `next/font/google` downloads the fonts (EB Garamond and others) from Google Fonts. A fully offline, reproducible build is not available at the moment.

## Installation

```bash
git clone <your-repo> vespator && cd vespator
cp .env.example .env
# edit .env: DOMAIN=campaign.your-domain.com
docker compose up -d --build
```

Then open `https://campaign.your-domain.com`. On the first visit you create the game master account (username and password).

**Setup token:** The first-time setup asks for a one-time token so that nobody else can take over a freshly started instance. As long as no account exists, the app writes a new random token to the log on every start. The log line is in German:

```bash
docker compose logs app | grep Ersteinrichtung
# [Ersteinrichtung] Einmal-Token: … – https://campaign.your-domain.com/setup-admin?token=…
```

Open the link (the token is then filled in) or copy the token into the *Setup token* field. You can also set your own token in `.env` (`SETUP_TOKEN=…`, at least 16 characters, e.g. `openssl rand -hex 24`); then only that token is accepted. Once the account exists, the token is useless and you can remove `SETUP_TOKEN` from `.env` again.

## Data

The data lives in named Docker volumes, not in host folders. The container runs as the non-root user `app`, and named volumes take over its permissions automatically.

| Volume | Path in the container | Contents |
|---|---|---|
| `app_data` | `/app/data/app.db` | SQLite database (all campaigns, revisions, account) |
| `app_uploads` | `/app/uploads/` | Uploaded images (avatars, logos, battle photos) |
| `app_backups` | `/app/backups/` | Automatic and manual backups per campaign (`BACKUP_DIR`) |

The backups have a volume of their own. If the data volume breaks or is deleted by accident, the backups survive.

> If you want to mount host folders anyway (`./data:/app/data`), they must belong to the container user, e.g. `sudo chown -R $(docker compose run --rm --entrypoint id app -u):$(docker compose run --rm --entrypoint id app -g) data uploads`. Otherwise the app fails to start with `SQLITE_CANTOPEN`.

## Backup

Every day from 03:00 (server time, `TZ`) the app backs up each campaign as a full ZIP (current state, all revisions, images, admin audit log) to `BACKUP_DIR`. In the Docker setup this is the separate volume `app_backups` at `/app/backups`; without `BACKUP_DIR` the app uses `$DATA_DIR/backups`. The day is counted in the same time zone as the time of day (`TZ`).

*Settings → Automatic backups → Back up now* creates an extra ZIP right away (file name with `-manuell`).

For each campaign the app keeps the last 14 daily and, separately, the last 5 manual backups. The two are rotated independently, so manual backups never push out daily ones. Archived campaigns are only backed up while there is no backup since they were archived. If the backup of one campaign fails, the others continue; the error shows on the health page, and the next run (every 5 minutes) tries again.

The app also backs up the whole database every day from 03:00 (`VACUUM INTO`, consistent while the app is running) to `BACKUP_DIR/db/app-YYYY-MM-DD.db` and keeps the last 7. To restore, stop the app and put the file in place as `DATA_DIR/app.db` (remove `app.db-wal` and `app.db-shm` first).

**Backups contain secrets.** The database backups hold the SMTP password, the Discord bot token, the VAPID keys, the keys for one-time and unsubscribe links, and the player links. Protect the backup volume and downloaded backups like credentials. Session IDs are stored only as hashes.

What needs which protection:

| Data | Contains | Protection |
|---|---|---|
| Whole database (`app.db`, volume backups, `BACKUP_DIR/db/*.db`) | all campaigns, contacts, password hashes, SMTP password, Discord token, VAPID private key, HMAC keys, player links | like credentials; never share publicly, never attach to issues |
| Server log | before the first-time setup, the setup token (and with it the takeover of the instance) | restrict log access; after setup the token is useless |
| Uploads (`/app/uploads`) | avatars, logos, battle photos (possibly personal data) | like the database |
| Campaign export (JSON/ZIP from *Settings → Export*) | one campaign with history and images, without player links and instance secrets | share only with people you trust (contains player names, possibly contact details) |

A campaign export is therefore not a complete instance backup, and an instance backup is far more sensitive than an export.

**Backups and privacy:** Deletions (a player's contact details, the automatic cleanup after a campaign ends, deleting a campaign) take effect immediately in the database, in all revisions and in the campaign's sandboxes. Older backups still contain the data until they rotate out: daily campaign backups after 14 days, manual ones after 5 further manual backups, database backups after 7 days. Deleting a campaign also removes its backup folder. External copies (volume backups, downloaded ZIPs) you have to clean up yourself. If you restore an older backup, data deleted since then is back, so repeat those deletions afterwards.

**Restoring:** *Settings → Automatic backups* shows the latest backup and lets you restore any backup as a new campaign. The app takes over the complete history (log, undo, phase snapshots), so the Codex and the timelapse keep all their images, and records the restore with the account name in the admin audit log. Because restoring creates a new campaign, only admins may do it (as with creating and importing). The copy starts with the public view switched off and does not appear in the Hall of Fame or the league. You publish it yourself under *Settings*.

> **Upgrading from older versions:** Backups used to be stored under `/app/data/backups`. They stay there but no longer show up in the app. If you need them, copy them once: `docker compose exec app sh -c 'cp -a /app/data/backups/. /app/backups/'`.

The server itself can fail too, so we also recommend:

1. After each completed phase, download the campaign under *Settings → Export → Full backup (ZIP incl. images)*.
2. Back up the whole volume regularly:

```bash
docker compose stop app
docker run --rm --volumes-from $(docker compose ps -aq app) -v "$PWD":/backup busybox   tar czf /backup/vespator-backup-$(date +%F).tar.gz /app/data /app/uploads /app/backups
docker compose start app
```

You can load a ZIP or JSON backup again under *Campaigns → Import backup* (admins only). This always creates a new campaign; a ZIP brings images and history along, a JSON only the current state.

**Import size limit:** Caddy accepts at most 200 MB for `/api/import` (`request_body … max_size 200MB` in the `Caddyfile`), and the app checks the same limit. All other requests are limited to 12 MB. Shrink larger backups first (e.g. remove photos) or raise the limit in both places (`Caddyfile` and `MAX_BYTES` in `src/app/api/import/route.ts`). Personal player links are deliberately left out of backups and have to be generated again after a restore.

## Notifications

- **Email only over encrypted connections:** On port 465 (`SMTP_SECURE=1` or *Direct TLS*) the connection uses TLS from the start; on all other ports STARTTLS is required (at least TLS 1.2). If the server does not offer STARTTLS, sending fails instead of sending the password and mails in plain text. For a local relay without TLS (e.g. Postfix on the same host) there is one exception: *Allow unencrypted (local relay only)* in the SMTP settings, or `SMTP_ALLOW_INSECURE=1` for all configurations. **Check after the update:** If you used a server without STARTTLS on port 25/587, you have to set this exception explicitly, otherwise mails stay in the delivery log as failed.

- Discord: add a webhook per campaign under *Settings → Notifications* (in Discord: channel → Integrations → Webhooks).
- Email: configure SMTP globally under *Account → Email delivery (SMTP)* or with environment variables (see below). Players need an email address in their player profile.
- A background timer in the server process sends the queue (the outbox in the database) every minute and checks the deadlines every 5 minutes (48 h / 12 h before). Each message is queued only once (unique key per event and recipient), also across restarts.
- Delivery is "at least once": if the process stops exactly between sending and acknowledging, the message goes out again after the restart. In rare cases it arrives twice, but it is never lost.
- If sending fails, the next attempt follows after a growing delay (1, 2, 4, 8 … minutes). After 8 failed attempts the message counts as failed. Discord rate limits (HTTP 429) do not count as failed attempts; the app sends again after the wait time Discord gives.
- Under *Settings → Notifications → Delivery log*, the button *Resend failed messages* resets all failed messages of the campaign and starts sending right away.
- **Set `APP_URL`:** Links in email, push and Discord messages (player page, public view, unsubscribe link, one-time link) are built from `APP_URL`. Without it the app uses the address an admin explicitly saved under *Account → Services → Public address*, and otherwise `http://localhost:3000`. The app never takes an address from requests (Host header). Older versions remembered the last admin address they saw; that value is no longer used. The Docker setup already sets `APP_URL=https://$DOMAIN`.
- **Emails contain the personal player link:** Every notification to a player includes their secret link to the player page (and possibly a one-time link to confirm). Anyone who reads or forwards the mail can act on the player's behalf. Use only trustworthy SMTP providers, ask players not to forward notifications, and revoke a leaked link under *Player links* or generate a new one. That also invalidates the calendar subscription, push subscriptions, Discord link and all one-time links of that player. Each player may have exactly one email address (no lists).
- Only an admin may send test emails, to exactly one address and at most 5 per hour. Co-warmasters can only trigger the Discord test.
- When a player is deleted or (because they have already played) only deactivated, the app revokes their player link together with push subscriptions, Discord link, calendar subscription and one-time links. After reactivation the game master has to generate the link again under *Player links*.
- Web push goes only to the browsers' known push services (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`); the app rejects other endpoints. Each player link or account can have at most 5 devices; a new one replaces the oldest. Outgoing requests (Discord, push, SMTP) time out after 10 seconds.

## Login and rate limit

After 5 failed attempts within 15 minutes, login is blocked per IP address; from 20 failed attempts for the same username, every login is slowed down by 3 seconds. The app reads the IP address from `X-Forwarded-For` or `X-Real-IP` only with `TRUST_PROXY=1`, so only set it when the app is reachable exclusively through your own reverse proxy (set in the Docker setup, where Caddy sets the headers). Without `TRUST_PROXY` any client could forge the headers, so all logins then share one common limit (Next.js gives Server Actions no socket address). If the app runs directly on the internet without a proxy, 5 failed attempts from anyone block login for everyone for 15 minutes.

Every 5 minutes the app cleans up expired sessions, sent messages older than 30 days, used one-time links and expired Discord codes.

Successful logins, failed attempts and rate-limit blocks appear in the admin audit log (*Account*, visible to admins only), with the username and a shortened IP address (IPv4 /24, IPv6 /48), never with the password. The app records failed attempts and blocks at most once per minute per IP. The entries are deleted after 90 days.

## Sessions and passwords

- A session lasts 30 days from its last use, but at most 90 days from login; after that you have to log in again. Logging in ends the previous session of the same browser; logging out and changing the password end sessions on the server.
- Session IDs are stored in the database only as SHA-256 hashes, so database backups contain no valid login cookies.
- Over HTTPS the session cookie is called `__Host-vf_session` (bound to the host, `Secure` and `Path=/`, so neighboring subdomains cannot plant one). With `INSECURE_COOKIES=1` (local HTTP tests) it keeps the name `vf_session`.
- **One-time logout on update:** On the first start of this version the app deletes all existing sessions (switch to hashed IDs). All accounts have to log in once more; no data is lost.
- New passwords (first-time setup, invitation, password change) have 10 to 256 characters and must not be one of the most common passwords (built-in block list). Existing passwords stay valid.

## Security headers

For every response (including static files, uploads and prefetch requests) the app sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone, location, payment and others off), `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`. Pages with secret links, the admin area and the login also get `X-Robots-Tag: noindex, nofollow`. Because of `same-origin`, player and public-view links that contain secret keys are never sent as a referrer to other sites. `no-referrer` would not work, because browsers then send `Origin: null` with the app's own forms and Next.js rejects the actions. The app's proxy sets the Content Security Policy with a nonce, and Caddy sets HSTS. The app's own POST endpoints (`/api/import`, `/api/discord/interactions`) reject requests from other sites (`Origin`/`Sec-Fetch-Site`).

> **Caddy access log:** By default Caddy does not log requests. If you add a `log` directive, the secret links (`/p/…`, `/v/…`, `/kalender/…`, invitations) end up on disk. In that case filter the URI (`log { format filter { request>uri … } }`) or keep no access log.

## Privacy notice and imprint

As an admin you enter both texts (Markdown) under *Account → Administration → Privacy notice and imprint*. They appear at `/datenschutz` and `/impressum` and are linked in the footer of the login page, the public view, the player page and the admin area.

- Privacy notice: without your own text the app shows a neutral template in the reader's language (which data is stored, recipients such as the SMTP provider, Discord and push services, retention period, rights), with a clear note that the controller is still missing. The template does not replace a legal review. You have to add your name or club, address and contact yourself; you can copy the template and fill it in.
- Imprint: without an entry, the page only says that none has been provided. In Germany, clubs and "business-like" services usually need an imprint under § 5 DDG.

## Calendar subscription

Every player page shows a calendar link of the form `/kalender/<campaign>/<player>/<key>.ics` with the player's confirmed battle dates. The link is read-only. It allows no actions and does not reveal the personal player link, so it can be given to calendar services (Google, Apple, Outlook). The key depends on a random secret in the database and on the valid player link: if the player link is revoked or regenerated, the calendar link becomes invalid as well (the player page then shows the new one).

## Web app and service worker

The app can be installed as a PWA. The service worker (`/sw.js`) is registered with the build ID (`/sw.js?v=<BUILD_ID>`), so every new build replaces the old service worker and its caches. By default each build generates a new ID. You can set it yourself, e.g. to the Git commit:

```bash
docker compose build --build-arg BUILD_ID=$(git rev-parse --short HEAD) && docker compose up -d
# without Docker
BUILD_ID=$(git rev-parse --short HEAD) npm run build
```

The public view stays readable offline, and so do the player pages for at most 24 hours. A revoked or renewed player link removes all cached pages of that link on the next visit with a connection. On shared devices, clear the browser's site data when a player hands the device over.

## Update

```bash
git pull
docker compose build --pull && docker compose up -d
```

`--pull` fetches the current base images. The images are pinned to fixed versions (`Dockerfile`: `NODE_IMAGE=node:24.21.0-slim`, `docker-compose.yml`: `caddy:2.11.4`). For security updates of Node.js or Caddy, raise the tag and rebuild. Rebuilding once a month is a good habit.

## Container hardening

`docker-compose.yml` starts the app with restricted privileges:

| Setting | Effect |
|---|---|
| `read_only: true` | Container file system is read-only; only the volumes `/app/data`, `/app/uploads`, `/app/backups` are writable |
| `tmpfs: /tmp, /app/.next/cache` | volatile directories in memory (temporary files, Next.js cache) |
| `cap_drop: [ALL]` | no Linux capabilities |
| `security_opt: no-new-privileges:true` | no privilege escalation (setuid) |
| `mem_limit: 1g` | memory limit (HEIC conversion needs up to ~512 MB) |
| `pids_limit: 256` | maximum number of processes/threads |
| `USER app` (Dockerfile) | the app runs as a non-root user |

Caddy runs with `cap_drop: [ALL]`, `cap_add: [NET_BIND_SERVICE]` and `no-new-privileges`. **Test once after the update:** log in, upload an image (including HEIC), create a backup and import it. If the log reports `EROFS` (read-only file system) or the app crashes with memory errors, add the affected path as `tmpfs` or raise `mem_limit`; as a last resort, comment out `read_only`.

## Local test without HTTPS

```bash
# .env
DOMAIN=localhost
INSECURE_COOKIES=1
```

With `INSECURE_COOKIES=1` the app sets the session cookie without the `Secure` flag, and the CSP contains no `upgrade-insecure-requests`. That way login also works over `http://`. **On the internet, always keep `INSECURE_COOKIES=0`.**

Without Docker (Node.js 24.21 or a later 24.x):

```bash
npm ci
npm run build
INSECURE_COOKIES=1 npm start
```

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DOMAIN` | – | Domain for Caddy |
| `APP_URL` | `https://$DOMAIN` | Base URL for public links and links in messages (set it! Otherwise the address saved under *Account → Services* applies, and without that `http://localhost:3000`) |
| `TRUST_PROXY` | `1` (Docker), otherwise `0` | `1`: read the IP address for the login rate limit from `X-Forwarded-For`/`X-Real-IP`; only set it behind your own reverse proxy |
| `DATA_DIR` | `/app/data` | Location of the SQLite database |
| `UPLOAD_DIR` | `/app/uploads` | Location of the images |
| `UPLOAD_QUOTA_MB` | `200` | Image storage per campaign in MB; when it is full, the app rejects further uploads for that campaign |
| `INSECURE_COOKIES` | `0` | `1` only for local HTTP tests |
| `TZ` | `Europe/Berlin` | Time zone (also for the backup time) |
| `BACKUP_DIR` | `/app/backups` (Docker), otherwise `$DATA_DIR/backups` | Location of automatic and manual backups |
| `BUILD_ID` | new per build | Build time only: service worker version (optional) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | – | Email delivery (the settings in the account take precedence); `SMTP_SECURE=1` for port 465, otherwise STARTTLS is required |
| `SMTP_ALLOW_INSECURE` | `0` | `1` allows SMTP without enforced TLS (local relay only) |
| `SETUP_TOKEN` | – | Fixed one-time token for the first-time setup (at least 16 characters); if not set, a random token is written to the log |
| `DISABLE_SCHEDULER` | `0` | `1` turns off sending, automatic backups, data cleanup and maintenance (E2E tests) |
| `GIT_COMMIT`, `SOURCE_COMMIT` | – | Optional: commit ID for the health page (`GIT_COMMIT` takes precedence) |
| `NEXT_PUBLIC_FLAVOR` | `imperial` | Build time only: motifs drawn in code (wax seals, mottos on the map frames): `imperial` (skull seal, imperial mottos) or `neutral` (compass star, neutral mottos). `next build` embeds the value (Docker: build argument, see `docker-compose.yml`); a change needs a new build |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` | Build time only: default language of the installation (`de`, `en`, `fr`, `es`, `pl`). It is the last fallback of the language selection and pre-fills the first-time setup when the browser language is not supported. German installations set `NEXT_PUBLIC_DEFAULT_LOCALE=de` as a build argument (`.env` for `docker compose build` or `docker build --build-arg NEXT_PUBLIC_DEFAULT_LOCALE=de`). The default language saved during the first-time setup (*Administration → Default language*) always wins; existing installations keep their language even with a new build |

All runtime variables are also listed with comments in [`.env.example`](.env.example). `docker-compose.yml` passes them (except `GIT_COMMIT`/`SOURCE_COMMIT`) to the container.

Health check: `GET /api/health`.

## Forgotten password

As long as an admin exists, there is no reset through the interface. If you have to, empty the `admin` and `session` tables in `data/app.db` and restart the app. The first-time setup then appears again, protected by a new setup token that is written to the log as during installation (or `SETUP_TOKEN` from `.env`):

```bash
docker compose exec app node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/app/data/app.db');d.exec('DELETE FROM session; DELETE FROM admin;')"
docker compose restart app
docker compose logs app | grep Ersteinrichtung
```

Between emptying the tables and creating the new account, nobody without the token can take over the account.
