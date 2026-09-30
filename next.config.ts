import type { NextConfig } from 'next';
import { securityHeaderRules } from './src/securityHeaders';
import { assetPackRewrites } from './src/devAssetPack';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Optional eigenes Build-Verzeichnis, damit mehrere Dev-Server parallel laufen können (Standard: .next)
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  // Sicherheits-Kopfzeilen für jede Antwort (auch Prefetch, statische Dateien, Uploads); CSP mit Nonce im Proxy
  async headers() {
    return securityHeaderRules();
  },
  async rewrites() {
    return { beforeFiles: assetPackRewrites(), afterFiles: [], fallback: [] };
  },
  // Build-Kennung für die Cache-Version des Service Workers
  env: { NEXT_PUBLIC_BUILD_ID: process.env.BUILD_ID ?? Date.now().toString(36) },
  // Das Dev-Symbol überdeckt sonst die mobile Navigationsleiste
  devIndicators: false,
  serverExternalPackages: ['sharp', '@resvg/resvg-js', 'heic-convert'],
  // FAQ und Hilfe (docs/FAQ*.md, docs/GUIDE*.md) liest der Server zur Laufzeit – ausdrücklich ins Bundle aufnehmen.
  // Dynamische Dateipfade (Uploads, Datenbank) würden sonst das ganze Projekt ins Standalone-Bundle ziehen
  // heic-convert wird im Worker-Thread per require geladen und daher nicht automatisch erkannt
  outputFileTracingIncludes: {
    '*': ['docs/FAQ.md', 'docs/FAQ.en.md', 'docs/GUIDE.md', 'docs/GUIDE.de.md', 'CREDITS.md', 'CREDITS.en.md', 'node_modules/heic-convert/**', 'node_modules/heic-decode/**', 'node_modules/libheif-js/**', 'node_modules/jpeg-js/**', 'node_modules/pngjs/**'],
  },
  outputFileTracingExcludes: {
    '*': ['data/**', 'uploads/**', 'rules/**', 'public-pack/**', '*.pdf', 'tests/**', 'SPEC.md', '.git/**', 'test-results/**', 'playwright-report/**'],
  },
  experimental: {
    // Einzelbilder bis 10 MB; große Backups laufen über /api/import
    serverActions: { bodySizeLimit: '12mb' },
    // Der Proxy puffert Request-Bodies (Standard 10 MB) – muss zum Upload-Limit passen
    proxyClientMaxBodySize: '12mb',
  },
};

export default nextConfig;
