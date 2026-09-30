import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local, untracked working folders (screenshots, E2E data, playtests, drafts)
    ".shots/**",
    ".e2e/**",
    ".playtest/**",
    ".next-*/**",
    "example/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
