/**
 * Englische Übersetzungen (N5.4), nach Bereichen aufgeteilt. Schlüssel = deutscher Originaltext.
 */
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

export const EN: Record<string, string> = { ...AUTHZ, ...SECURITY, ...UI_REVIEW, ...P3, ...COMMON, ...ADMIN_CORE, ...ADMIN_PHASE, ...ADMIN_SETUP, ...ADMIN_MISC, ...PUBLIC, ...PLAYER };
