import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { currentState } from '@/server/campaigns';
import { publicOrigin } from '@/server/origin';
import { playerTokenFor } from '@/server/players';
import { audit } from '@/server/audit';
import { currentAllianceOf } from '@/engine/players';
import { PrintShell, PrintTool } from '@/components/admin/PrintShell';
import { CopyField } from '@/components/admin/settings/CopyField';
import { adminLocale, tFor } from '@/i18n/server';
import type { Metadata } from 'next';
import { authorizePage } from '@/server/authz';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Spielerlinks') };
}

/**
 * Druckbares Sammelblatt: persönliche Links und QR-Codes je Allianz (N1.1). Links werden nur für Spieler
 * erzeugt, die noch nie einen hatten – gesperrte bleiben gesperrt, bis der Spielleiter sie neu erzeugt.
 */
export default async function PlayerLinksSheet(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // Zugriff hier prüfen – Layouts schützen Seiten nicht zuverlässig (RSC-Anfragen können sie überspringen)
  const admin = await authorizePage('campaign.read', { campaignId: id });
  let data;
  try {
    data = currentState(id);
  } catch {
    notFound();
  }
  const { state } = data;
  const t = tFor(await adminLocale());
  const origin = publicOrigin(await headers());
  const groups = [...state.alliances.map((a) => ({ name: a.name, color: a.color, id: a.id as string | null })), { name: t('Ohne Allianz'), color: '#777', id: null }];
  const rows = await Promise.all(
    state.players
      .filter((p) => p.active)
      .map(async (p) => {
        // nur für Spieler ohne jeden bisherigen Link neu erzeugen – gesperrte bleiben gesperrt
        const had = playerTokenFor(id, p.id);
        const token = had ?? playerTokenFor(id, p.id, true);
        if (!had && token) audit(admin.username, 'Spielerlink erzeugt', p.nickname, id);
        const url = token ? `${origin}/p/${token}` : null;
        return { p, url, svg: url ? await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null, al: currentAllianceOf(p) };
      }),
  );
  return (
    <PrintShell title={t('Spielerlinks')} backHref={`/admin/c/${id}`} backLabel={t('Zur Kampagne')} paperClass="max-w-5xl" tools={<PrintTool href={`/admin/c/${id}/player-cards`}>{t('QR-Karten der Spieler')}</PrintTool>}>
      {/* Bildschirm: dunkle Karten mit lesbaren Namen und Kopieraktion, QR-Codes auf weißem Träger.
          Druck (@media print): reines Papierlayout in Schwarz auf Weiß mit vollständigen Links. */}
      <main className="space-y-5 p-3 text-ink sm:p-5 print:space-y-4 print:bg-white print:p-0 print:text-black">
        <div>
          <h1 className="text-[20px] font-bold print:text-xl print:text-black print:[text-shadow:none]">
            {t('Spielerlinks')} · {state.meta.name}
          </h1>
          <p className="mt-1 text-[15px] text-dim print:text-sm print:text-black">{t('Jeder Link ist persönlich und wie ein Passwort zu behandeln. Neu erzeugte Links machen alte ungültig.')}</p>
        </div>
        {groups.map((g) => {
          const list = rows.filter((r) => r.al === g.id);
          if (!list.length) return null;
          return (
            <section key={g.name} className="break-inside-avoid">
              <h2
                className="mb-2 flex items-center gap-2 border-b-2 pb-1 font-display text-[16px] font-bold uppercase tracking-[0.04em] text-ink print:font-sans print:text-lg print:normal-case print:tracking-normal print:text-black"
                style={{ borderColor: g.color }}
              >
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full print:hidden" style={{ background: g.color }} />
                {g.name}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3 print:grid-cols-3 print:gap-4">
                {list.map(({ p, url, svg }) => (
                  <li
                    key={p.id}
                    className="slab flex break-inside-avoid items-center gap-3 p-2.5 print:block print:rounded-none print:border print:border-gray-400 print:bg-white print:p-2 print:text-center print:shadow-none"
                  >
                    {svg ? (
                      <div className="w-24 shrink-0 bg-white p-1 print:mx-auto print:w-32 print:p-0" dangerouslySetInnerHTML={{ __html: svg }} />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center border border-dashed border-line text-[13px] text-dim print:mx-auto print:h-32 print:w-32 print:border-gray-400 print:text-sm print:text-black">
                        {t('gesperrt')}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-serif text-[18px] font-semibold leading-tight text-ink print:mt-1 print:font-sans print:text-base print:font-bold print:text-black">{p.nickname}</p>
                      {url ? (
                        <>
                          <div className="print:hidden">
                            <CopyField value={url} label={t('Spielerlink von {name}', { name: p.nickname })} buttonOnly />
                          </div>
                          <p className="hidden break-all font-mono text-[9px] print:block">{url}</p>
                        </>
                      ) : (
                        <p className="text-[14px] text-dim print:text-[9px] print:text-black">{t('Link gesperrt – in der Spielerverwaltung neu erzeugen')}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
    </PrintShell>
  );
}
