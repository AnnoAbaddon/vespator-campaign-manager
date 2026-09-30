'use server';

import { redirect } from 'next/navigation';
import { audit, auditLogin } from '@/server/audit';
import { setDefaultLocale } from '@/server/db';
import { adminExists, beginLoginAttempt, clientIp, createAdmin, finishLoginAttempt, login, logout, USERNAME_RE, validateNewPassword } from '@/server/auth';
import { checkSetupToken, clearSetupToken } from '@/server/setupToken';
import { publicError } from '@/server/errors';
import { toLocale } from '@/i18n/core';
import { publicAction } from '@/server/authz';

export async function loginAction(_prev: string | null, form: FormData): Promise<string | null> {
  publicAction('session.login');
  const ip = await clientIp();
  const user = String(form.get('username') ?? '');
  // Hart gesperrt wird nur je IP (5 Versuche / 15 min). Je Benutzername wird nur gezählt: ab 20 Fehlversuchen
  // aus beliebigen Quellen wird jede Anmeldung um 3 s gebremst – Fremde können das Konto so nicht aussperren,
  // verteiltes Durchprobieren wird aber teuer. Prüfen und Zählen geschehen in einem Schritt vor jedem await.
  const userKey = `user:${user.toLowerCase().slice(0, 200)}`;
  const gate = beginLoginAttempt(ip, userKey);
  if (gate.blocked) {
    auditLogin('blocked', user, ip);
    return 'Zu viele Fehlversuche – bitte 15 Minuten warten.';
  }
  if (gate.slow) await new Promise((r) => setTimeout(r, 3000));
  const ok = await login(user, String(form.get('password') ?? ''));
  if (!ok) {
    auditLogin('failed', user, ip);
    return 'Benutzername oder Passwort falsch.';
  }
  finishLoginAttempt(gate.attempt, userKey);
  auditLogin('ok', user, ip);
  redirect('/admin');
}

export async function setupAdminAction(_prev: string | null, form: FormData): Promise<string | null> {
  publicAction('session.setup');
  if (adminExists()) redirect('/login');
  // Einmal-Token aus dem Server-Log bzw. SETUP_TOKEN – sonst könnte jeder die frische Instanz übernehmen
  if (!checkSetupToken(form.get('setupToken'))) return 'Setup-Token fehlt oder ist falsch – siehe Server-Log.';
  const username = String(form.get('username') ?? '').trim();
  const pw = String(form.get('password') ?? '');
  const pw2 = String(form.get('password2') ?? '');
  if (!USERNAME_RE.test(username)) return 'Benutzername: 3–32 Zeichen (Buchstaben, Ziffern, _ . -)';
  const policy = validateNewPassword(pw);
  if (policy) return policy;
  if (pw !== pw2) return 'Passwörter stimmen nicht überein.';
  // Die bei der Ersteinrichtung gewählte Sprache gilt für das Konto und als globale Standardsprache
  const locale = toLocale(form.get('locale'));
  try {
    await createAdmin(username, pw, locale);
  } catch (e) {
    return publicError(e, 'setup');
  }
  clearSetupToken();
  setDefaultLocale(locale);
  audit(username, 'Admin-Konto eingerichtet', locale);
  await login(username, pw);
  redirect('/admin');
}

export async function logoutAction() {
  publicAction('session.logout');
  await logout();
  redirect('/login');
}
