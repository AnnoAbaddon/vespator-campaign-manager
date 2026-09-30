/**
 * Spanisch (NTH2 7.1): Sprachpaket aus Oberflächentexten und Engine-Mustern. Schlüssel = deutscher Originaltext;
 * fehlende Einträge fallen auf Englisch, dann Deutsch zurück (src/i18n/core.ts).
 */
import type { LocalePack } from '../core';
import { COMMON } from './common';
import { ADMIN_CORE } from './admin-core';
import { ADMIN_PHASE } from './admin-phase';
import { ADMIN_SETUP } from './admin-setup';
import { ADMIN_MISC } from './admin-misc';
import { PUBLIC } from './public';
import { PLAYER } from './player';
import { P3 } from './p3';
import { UI_REVIEW } from './ui-review';
import { SECURITY } from './security';
import { AUTHZ } from './authz';
import { PATTERNS } from './engine';

export const PACK: LocalePack = { ui: { ...AUTHZ, ...SECURITY, ...UI_REVIEW, ...P3, ...COMMON, ...ADMIN_CORE, ...ADMIN_PHASE, ...ADMIN_SETUP, ...ADMIN_MISC, ...PUBLIC, ...PLAYER }, patterns: PATTERNS };
