import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // server-only wirft außerhalb von React-Server-Komponenten – in Tests die leere Variante nutzen
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
