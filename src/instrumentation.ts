/** Startet die Hintergrundaufgaben (N1.4 Benachrichtigungen, N5.1 Backups) einmal je Serverprozess */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Ersteinrichtung: solange kein Konto existiert, bei jedem Start einen neuen Einmal-Token ins Log schreiben
  try {
    const { ensureSetupToken } = await import('./server/setupToken');
    ensureSetupToken(true);
  } catch (e) {
    console.error('[Ersteinrichtung] Setup-Token konnte nicht erzeugt werden', e);
  }
  const { startScheduler } = await import('./server/scheduler');
  startScheduler();
}

/**
 * Serverfehler für die Health-Seite (NTH2 6.2) im Ringpuffer festhalten. Pfade werden gekürzt gespeichert
 * (geheime Links), Steuer-Fehler von Next (notFound, redirect) ignoriert.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordError } = await import('./server/health');
  recordError(`${request.method} ${request.path}${context?.routeType ? ` (${context.routeType})` : ''}`, err);
}
