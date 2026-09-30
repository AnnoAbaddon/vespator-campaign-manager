import { loadPublic } from '@/server/public';
import { GalleryView } from '@/components/public/GalleryView';
import { publicLocale, tFor } from '@/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state } = loadPublic(token);
  return { title: tFor(await publicLocale(state))('Galerie') };
}

/** Galerie der Leseansicht (NTH2 4.3): alle öffentlichen Schlacht- und Hobbyfotos mit Filtern, Bild der Phase markiert */
export default async function PublicGallery({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { current } = loadPublic(token);
  return <GalleryView state={current} battleBase={`/v/${token}/battles`} />;
}
