import { notFound } from 'next/navigation';
import { currentState } from '@/server/campaigns';
import { MapSvg } from '@/components/map/MapSvg';
import { PrintShell, PrintTool } from '@/components/admin/PrintShell';
import { INFRA, THEATRES } from '@/engine/data/vespator';
import { mapOf } from '@/engine/map';
import { adminLocale, tFor } from '@/i18n/server';
import type { Metadata } from 'next';
import { authorizePage } from '@/server/authz';

export async function generateMetadata(): Promise<Metadata> {
  return { title: tFor(await adminLocale())('Druckansicht Karte') };
}

export default async function PrintMap({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ size?: string }> }) {
  const { id } = await params;
  // Zugriff hier prüfen – Layouts schützen Seiten nicht zuverlässig (RSC-Anfragen können sie überspringen)
  await authorizePage('campaign.read', { campaignId: id });
  const { size } = await searchParams;
  const locale = await adminLocale();
  const t = tFor(locale);
  let state;
  try {
    state = currentState(id).state;
  } catch {
    notFound();
  }
  const page = size === 'a4' ? 'A4 landscape' : 'A3 landscape';
  const last = state.pointsHistory[state.pointsHistory.length - 1];
  const al = (aid: string) => state.alliances.find((a) => a.id === aid);
  return (
    <PrintShell
      title={t('Druckansicht Karte')}
      backHref={`/admin/c/${id}`}
      backLabel={t('Zur Kampagne')}
      paperClass="max-w-[1400px]"
      tools={
        <>
          <PrintTool href="?size=a3" active={size !== 'a4'}>
            {t('A3 quer')}
          </PrintTool>
          <PrintTool href="?size=a4" active={size === 'a4'}>
            {t('A4 quer')}
          </PrintTool>
        </>
      }
    >
      <main className="bg-white p-4 text-black">
        <style>{`@page { size: ${page}; margin: 8mm; } @media print { header, footer { display: none !important; } .page-break { break-before: page; } }`}</style>
        <h1 className="mb-2 text-xl font-bold text-black [text-shadow:none]">
          {state.meta.name} – {t('Kartenstand')} {last ? (last.phaseNumber ? t('nach Phase {n}', { n: last.phaseNumber }) : t('Start')) : ''}
        </h1>
        <MapSvg state={state} print points={last?.points ?? null} className="h-auto w-full" locale={locale} />
        <div className="page-break" />
        <h2 className="mb-2 mt-4 text-lg font-bold">{t('Werte je Planet')}</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-gray-400 p-1 text-left">{t('Planet')}</th>
              {state.alliances.map((a) => (
                <th key={a.id} className="border border-gray-400 p-1">
                  PL {a.name}
                </th>
              ))}
              <th className="border border-gray-400 p-1 text-left">{t('Infrastruktur (Location: Typ/Allianz)')}</th>
              <th className="border border-gray-400 p-1 text-left">{t('Flotten')}</th>
              <th className="border border-gray-400 p-1 text-left">Theatres</th>
            </tr>
          </thead>
          <tbody>
            {mapOf(state).planets.map((d) => {
              const p = state.planets.find((x) => x.id === d.id)!;
              return (
                <tr key={d.id}>
                  <td className="border border-gray-400 p-1 font-semibold">
                    {d.name}
                    {p.destroyed ? ` (${t('zerstört')})` : ''}
                  </td>
                  {state.alliances.map((a) => (
                    <td key={a.id} className="border border-gray-400 p-1 text-center font-mono">
                      {p.power[a.id] ?? '–'}
                    </td>
                  ))}
                  <td className="border border-gray-400 p-1">
                    {p.slots.map((s, i) => `${i + 1}: ${s.destroyed ? t('zerstört') : s.infra ? `${INFRA[s.infra.type].short}/${al(s.infra.allianceId)?.name}` : t('frei')}`).join(' · ')}
                  </td>
                  <td className="border border-gray-400 p-1">
                    {state.fleets
                      .filter((f) => f.planetId === d.id)
                      .map((f) => f.name)
                      .join(', ') || '–'}
                  </td>
                  <td className="border border-gray-400 p-1">{d.theatres.map((th) => THEATRES[th].name).join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {last && (
          <p className="mt-2 text-sm">
            {t('Punkte:')} {state.alliances.map((a) => `${a.name} ${last.points[a.id]}`).join(' · ')}
          </p>
        )}
      </main>
    </PrintShell>
  );
}
