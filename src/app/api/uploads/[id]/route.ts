import { readUpload } from '@/server/uploads';
import { publicAction } from '@/server/authz';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Bilder sind über ihre zufällige ID öffentlich abrufbar (Leseansicht, Spielerseiten)
  publicAction('upload.read');
  const { id } = await ctx.params;
  const thumb = new URL(req.url).searchParams.get('thumb') === '1';
  const buf = readUpload(id, thumb);
  if (!buf) return new Response('Nicht gefunden', { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}
