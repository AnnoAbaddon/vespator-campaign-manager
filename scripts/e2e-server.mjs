// Startet einen frischen Produktionsserver für die E2E-Tests (vorher `npm run build`).
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
fs.rmSync('.e2e', { recursive: true, force: true });
fs.mkdirSync('.e2e', { recursive: true });
const out = execSync('npx tsx scripts/seed-demo.ts .e2e/data', { encoding: 'utf8' });
const m = out.match(/\/admin\/c\/(\S+)[\s\S]*\/v\/(\S+)/);
fs.writeFileSync('.e2e/demo.json', JSON.stringify({ id: m[1], token: m[2] }));
execSync('npx tsx scripts/seed-scenarios.ts .e2e/data .e2e/scenarios.json', { stdio: 'inherit' });
// Ohne Hintergrundaufgaben (Versand, Backups, Wartung): die Tests brauchen sie nicht, sie würden nur Zeitpunkte verschieben
const env = { ...process.env, DATA_DIR: '.e2e/data', UPLOAD_DIR: '.e2e/uploads', INSECURE_COOKIES: '1', PORT: '3200', DISABLE_SCHEDULER: '1', SETUP_TOKEN: 'e2e-setup-token-0123456789' };
// SETUP_TOKEN: fester Einmal-Token der Ersteinrichtung (tests/e2e/helpers.ts SETUP_TOKEN)
const p = spawn('npx', ['next', 'start', '-p', '3200'], { env, stdio: 'inherit', shell: true });
process.on('SIGTERM', () => p.kill());
process.on('SIGINT', () => p.kill());
