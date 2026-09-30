# Contributing

Thanks for your interest in the Vespator Front Campaign Manager. It is an unofficial fan project, so please read the ground rules below before you open a pull request.

## Ground rules

- Do not add text from *500 Worlds: Titus* or other Games Workshop publications (rules, mission text, lore), including short verbatim quotes. Describe mechanics in your own words and refer to the book. Rules clarifications go into [docs/FAQ.md](docs/FAQ.md) / [docs/FAQ.en.md](docs/FAQ.en.md), paraphrased, with links to public sources.
- Do not add AI-generated images of any kind, or artwork, logos or scans from Games Workshop products. New images, icons and fonts need a clear license that allows redistribution; add the source and license to the credits files.
- Keep secrets and personal data out of code, tests, fixtures, screenshots and issues. That means no real player names, e-mail addresses, player links, tokens or database backups. Demo and test data must be obviously synthetic.
- By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) of this project.
- Be kind; see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Requirements: Node.js 24.21 or a newer 24.x (see `engines` in `package.json`; CI and the Docker image use 24.21.0) and npm.

```bash
npm ci
npm run dev          # http://localhost:3000
```

On first start the server prints a one-time setup token to the console (`[Ersteinrichtung] Einmal-Token: …`); open the printed `/setup-admin?token=…` link to create the admin account. `npm run seed:demo` creates a demo campaign with synthetic data.

The build fetches fonts through `next/font/google`, so `npm run build` needs network access.

## Checks

Run these before you open a pull request; CI runs the same steps (`.github/workflows/ci.yml`).

```bash
npm run lint
npm run typecheck
npm test                      # Vitest: tests/engine and tests/server
npm run build
npx playwright install chromium   # once
npx playwright test           # E2E against the production build from `npm run build`
```

`npm run test:e2e` runs the build and then Playwright. The E2E server (`scripts/e2e-server.mjs`) seeds a fresh database in `.e2e/` and starts `next start` on port 3200 with a fixed test setup token and no background jobs. Playwright uses a German browser locale.

Every behaviour change needs a unit test in `tests/engine/*.test.ts` (engine) or `tests/server/*.test.ts` (server).

## Architecture in short

- `src/engine/` is the rules engine. It is pure and deterministic and does no I/O. Every change is a command run through `executeCommand`, which returns the new state, a summary, log lines and warnings. Only the Warmaster can override a warning, and only with a reason.
- Everything specific to one campaign system lives in `src/engine/modules/` behind the `CampaignModule` interface. Read [docs/MODULE.md](docs/MODULE.md) before adding rules or a new system; `tests/engine/demoModule.ts` is a minimal example module.
- `src/server/` stores revisions in SQLite (`node:sqlite`) and handles auth, roles, uploads, notifications and backups.
- `src/app/` and `src/components/` are the Next.js UI. The project uses Next.js 16, whose APIs differ from older versions. The matching documentation ships with the package in `node_modules/next/dist/docs/`.
- [docs/ROADMAP.md](docs/ROADMAP.md) summarises implemented features and open ideas. The user guide is [docs/GUIDE.md](docs/GUIDE.md) / [docs/GUIDE.de.md](docs/GUIDE.de.md). The app shows it on its Help page, so update it along with UI changes.

## Translations

- German is the source language. UI strings are written in German, and the German text is the translation key.
- Dictionaries: `src/i18n/<locale>/*.ts` for `en`, `fr`, `es` and `pl`. Every new German string needs at least an English entry; the other languages fall back to English, then German. The i18n tests (`tests/engine/i18n*.test.ts`) check that dictionary keys exist and placeholders match.
- Engine messages (warnings, errors, log lines) are translated with patterns (`EN_PATTERNS` in `src/i18n/en/engine.ts`, `MODULE_PATTERNS` for module messages). Add a pattern for every new or changed engine message.
- Game terms from the book (Power Level, Stronghold, Fortification Line, ...) stay English in every language.

## Language convention

Translation keys, code comments and most existing documents are in German; identifiers are in English. Please write new developer documentation in English if you can. Pull requests and issues can be in English or German.

## UI conventions

The UI follows the "Cogitator terminal" look. Controls use the existing SVG icons rather than emojis or Unicode symbols, and have no all-caps or letter-spacing. Every screen must work on desktop and mobile without zooming.

## Build- and test-only environment variables

Runtime variables are documented in [.env.example](.env.example). These are only used when building, testing or developing:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `BUILD_ID` | `next.config.ts`, Dockerfile build arg | Service worker cache version; defaults to a new value per build |
| `NEXT_PUBLIC_FLAVOR` | `src/flavor.ts`, Dockerfile build arg, `docker-compose.yml` | Look of the motifs drawn in code: `neutral` (default; neutral wax seal with compass sigil, mottos "Ordo et Vigilia" / "Lex Belli") or `imperial` (skull seal, "Imperium omnia vincit" / "Lex imperialis"). Inlined at build time: rebuild or restart `next dev` after changing it. Game content is not affected |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `src/i18n/defaultLocale.ts`, Dockerfile build arg, `docker-compose.yml`, `public/sw.js` (via `?dl=`) | Build default language: `de`, `en` (default when unset or unknown), `fr`, `es`, `pl`. Last step of the language resolution (`?lang` → cookie → account/player/campaign → stored `defaultLocale` setting → Accept-Language → this), fallback of client components without a locale and of the service-worker offline page. Inlined at build time. Vitest runs with it unset (English); tests that expect German texts set it in `vi.hoisted` before their imports. The E2E browser uses `locale: 'de-DE'`, so the E2E suite is German in both builds |
| `NEXT_DIST_DIR` | `next.config.ts`, `src/server/health.ts` | Alternative build directory (e.g. to run several dev servers in parallel); default `.next` |
| `NEXT_TELEMETRY_DISABLED` | Dockerfile | Disables Next.js telemetry |
| `PORT`, `HOSTNAME` | `next start`, Docker image | Listen port/address (E2E: 3200) |
| `DATA_DIR`, `UPLOAD_DIR`, `BACKUP_DIR` | tests, `scripts/seed-demo.ts`, `scripts/e2e-server.mjs` | Point tests and seeds at temporary directories |
| `STATE`, `MOBILE`, `FULL`, `CLICK` | `scripts/shot.mjs` | Screenshot helper options |

## Pull requests

- Keep each pull request to one topic, and describe what changed and how you tested it (the PR template has a checklist).
- Do not commit generated files, local databases (`data/`, `*.db`), uploads, `.env` files or PDFs.

