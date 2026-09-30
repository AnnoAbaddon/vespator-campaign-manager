# Vespator Front Campaign Manager
# Multi-Stage-Build: Abhängigkeiten → Build → schlankes Laufzeit-Image (Next.js standalone)
# Basis-Image fest gepinnt (Node 24 LTS mit den Sicherheitskorrekturen vom Juli 2026: node:sqlite, HTTP-Header).
# Aktualisieren: Tag anheben und `docker compose build --pull`; dabei `engines` in package.json und NODE_VERSION in .github/workflows/ci.yml mitziehen.
ARG NODE_IMAGE=node:24.21.0-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Flavor der im Code gezeichneten Motive (src/flavor.ts): neutral (Standard, öffentliche Fassung) oder imperial.
# NEXT_PUBLIC_-Variablen werden beim Build eingebettet, daher Build-Argument statt Laufzeitvariable.
ARG NEXT_PUBLIC_FLAVOR=neutral
ENV NEXT_PUBLIC_FLAVOR=${NEXT_PUBLIC_FLAVOR}
# Standardsprache des Builds (src/i18n/defaultLocale.ts): de | en | fr | es | pl, Standard en (öffentliche Fassung).
# Letzter Rückfall der Sprachwahl; eine bei der Ersteinrichtung gespeicherte Standardsprache geht immer vor.
ARG NEXT_PUBLIC_DEFAULT_LOCALE=en
ENV NEXT_PUBLIC_DEFAULT_LOCALE=${NEXT_PUBLIC_DEFAULT_LOCALE}
# Version des Service Workers (optional per --build-arg BUILD_ID=…, sonst je Build neu)
ARG BUILD_ID
RUN BUILD_ID="${BUILD_ID:-$(date +%s)}" npm run build

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    UPLOAD_DIR=/app/uploads \
    BACKUP_DIR=/app/backups \
    TZ=Europe/Berlin
RUN groupadd -r app && useradd -r -g app -d /app app \
    && mkdir -p /app/data /app/uploads /app/backups && chown -R app:app /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/assets ./assets
# native Pakete, die nicht gebündelt werden
COPY --from=build --chown=app:app /app/node_modules/sharp ./node_modules/sharp
COPY --from=build --chown=app:app /app/node_modules/@img ./node_modules/@img
COPY --from=build --chown=app:app /app/node_modules/@resvg ./node_modules/@resvg
USER app
VOLUME ["/app/data", "/app/uploads", "/app/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
