import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import type { Metadata } from 'next';
import { currentState } from '@/server/campaigns';
import { publicOrigin } from '@/server/origin';
import { playerTokenFor } from '@/server/players';
import { audit } from '@/server/audit';
import { contextLocale } from '@/server/locale';
import { currentAllianceOf } from '@/engine/players';
import { PrintShell, PrintTool } from '@/components/admin/PrintShell';
import { GameIcon } from '@/components/icons/GameIcon';
import { allianceEmblem } from '@/components/icons/registry';
import { adminLocale, tFor } from '@/i18n/server';
import { makeT, type T } from '@/i18n/core';
import { authorizePage } from '@/server/authz';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('QR-Karten der Spieler') };
}

/**
 * QR-Visitenkarten der Spieler (NTH2 1.4): je Spieler eine Karte (85 × 55 mm, zehn je A4-Bogen) mit Name,
 * Allianz-Wappen, QR-Code des persönlichen Links und kurzer Anleitung – in der Profilsprache des Spielers
 * (NTH2 7.4) oder mit ?lang=both zweisprachig. Links werden wie beim Sammelblatt nur für Spieler erzeugt,
 * die noch nie einen hatten; gesperrte bleiben gesperrt.
 */
export default async function PlayerCards(props: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { id } = await props.params;
  const admin = await authorizePage('campaign.read', { campaignId: id });
  const both = (await props.searchParams).lang === 'both';
  let data;
  try {
    data = currentState(id);
  } catch {
    notFound();
  }
  const { state } = data;
  const t = tFor(await adminLocale());
  const origin = publicOrigin(await headers());
  const cards = await Promise.all(
    state.players
      .filter((p) => p.active)
      .map(async (p) => {
        const had = playerTokenFor(id, p.id);
        const token = had ?? playerTokenFor(id, p.id, true);
        if (!had && token) audit(admin.username, 'Spielerlink erzeugt', p.nickname, id);
        const url = token ? `${origin}/p/${token}` : null;
        const svg = url ? await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }) : null;
        const al = state.alliances.find((a) => a.id === currentAllianceOf(p)) ?? null;
        const lt = makeT(contextLocale(p.locale, state.meta.locale));
        return { p, svg, al, lt };
      }),
  );
  const de = makeT('de');
  const en = makeT('en');
  return (
    <PrintShell
      title={t('QR-Karten der Spieler')}
      backHref={`/admin/c/${id}`}
      backLabel={t('Zur Kampagne')}
      paperClass="max-w-[210mm]"
      tools={
        <>
          <PrintTool href={`/admin/c/${id}/player-cards`} active={!both}>
            {t('Profilsprache je Spieler')}
          </PrintTool>
          <PrintTool href={`/admin/c/${id}/player-cards?lang=both`} active={both}>
            {t('Zweisprachig')}
          </PrintTool>
          <PrintTool href={`/admin/c/${id}/player-links`}>{t('Sammelblatt (A4)')}</PrintTool>
        </>
      }
    >
      <main className="bg-white p-[8mm] text-black print:p-0">
        <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { header, footer { display: none !important; } } .qr-code svg { width: 100%; height: auto; display: block; }`}</style>
        <h1 className="sr-only">{t('QR-Karten der Spieler')}</h1>
        <ul className="grid grid-cols-2 gap-[4mm]">
          {cards.map(({ p, svg, al, lt }) => {
            const tx: T = both ? (s, v) => (de(s, v) === en(s, v) ? de(s, v) : `${de(s, v)} / ${en(s, v)}`) : lt;
            return (
              <li key={p.id} className="qr-card flex h-[55mm] break-inside-avoid gap-[3mm] overflow-hidden border border-black p-[3mm] text-[9pt] leading-tight">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-[2mm]">
                    {al && <GameIcon name={allianceEmblem(al)} size={30} color="#000" />}
                    <div className="min-w-0">
                      <p className="truncate text-[13pt] font-bold">{p.nickname}</p>
                      <p className="truncate">{al ? al.name : tx('ohne Allianz')}</p>
                    </div>
                  </div>
                  <p className="mt-[1.5mm] truncate text-[8pt]">{state.meta.name}</p>
                  <ol className="mt-auto list-decimal space-y-[0.5mm] pl-[4mm] text-[7.5pt]">
                    <li>{tx('Code mit dem Handy scannen.')}</li>
                    <li>{tx('Seite als Lesezeichen oder auf dem Startbildschirm speichern.')}</li>
                    <li>{tx('Befehle geben, Termine finden, Ergebnisse melden.')}</li>
                  </ol>
                  <p className="mt-[1mm] text-[7pt] italic">{tx('Persönlicher Link – nicht weitergeben.')}</p>
                </div>
                {svg ? (
                  <div className="qr-code w-[34mm] shrink-0 self-center" dangerouslySetInnerHTML={{ __html: svg }} />
                ) : (
                  <div className="flex w-[34mm] shrink-0 items-center justify-center self-center border border-dashed border-black text-center text-[8pt]">{tx('Link gesperrt')}</div>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </PrintShell>
  );
}
