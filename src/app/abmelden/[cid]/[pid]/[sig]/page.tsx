import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { playerForUnsubscribe, unsubscribeLocale } from '@/server/notify';
import { can, unsubscribeAccess } from '@/server/authz';
import { LocaleProvider } from '@/i18n/client';
import { tFor } from '@/i18n/server';
import { contextLocale } from '@/server/locale';
import { UnsubscribeForm } from './UnsubscribeForm';

export async function generateMetadata({ params }: { params: Promise<{ cid: string; pid: string; sig: string }> }): Promise<Metadata> {
  const { cid, pid, sig } = await params;
  const p = can(unsubscribeAccess(cid, pid, sig), 'unsubscribe', { campaignId: cid }) ? null : playerForUnsubscribe(cid, pid);
  return { title: tFor(p ? unsubscribeLocale(cid, p) : contextLocale())('Benachrichtigungen abbestellen'), robots: { index: false, follow: false } };
}

const LABEL: Record<string, string> = {
  PHASE: 'Neue Phase und aufgedeckte Operationen',
  RESULTS: 'Ergebnisse, Events, Kampagnenende',
  DEADLINES: 'Erinnerungen an Deadlines',
  PERSONAL: 'Persönliche Nachrichten',
};

/** Abmeldeseite aus E-Mails (N1.4): Bestätigung per Knopf, damit Link-Scanner nichts auslösen */
export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ cid: string; pid: string; sig: string }>; searchParams: Promise<{ kategorie?: string }> }) {
  const { cid, pid, sig } = await params;
  const { kategorie } = await searchParams;
  if (can(unsubscribeAccess(cid, pid, sig), 'unsubscribe', { campaignId: cid })) notFound();
  const p = playerForUnsubscribe(cid, pid);
  if (!p) notFound();
  // Sprache des Lesers: die des Spielers
  const locale = unsubscribeLocale(cid, p);
  const t = tFor(locale);
  const cat = kategorie && LABEL[kategorie] ? kategorie : null;
  return (
    <LocaleProvider locale={locale}>
      <main className="mx-auto max-w-lg px-4 py-16">
        <section className="hud space-y-3 p-6">
          <h1 className="text-xl font-semibold">{t('Benachrichtigungen abbestellen')}</h1>
          <p className="text-sm">
            {cat
              ? t('Hallo {name}, möchtest du „{what}“ nicht mehr erhalten?', { name: p.nickname, what: t(LABEL[cat]) })
              : t('Hallo {name}, möchtest du alle E-Mails dieser Kampagne nicht mehr erhalten?', { name: p.nickname })}
          </p>
          <UnsubscribeForm cid={cid} pid={pid} sig={sig} category={(cat ?? 'ALL') as 'ALL'} />
        </section>
      </main>
    </LocaleProvider>
  );
}
