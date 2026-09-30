// Ohne 'use client': auch in Server-Komponenten (Codex, Leseansicht) nutzbar

/** Bild der Phase als Figur (Codex, Leseansicht) – ohne Hooks */
export function PhasePhotoFigure({ uploadId, caption, title, className = '' }: { uploadId: string; caption?: string; title: string; className?: string }) {
  return (
    <figure className={`break-inside-avoid ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/uploads/${uploadId}`} alt={caption || title} className="block max-h-[60mm] w-full border border-[#5a3d1c] object-cover print:max-h-[80mm]" />
      <figcaption className="mt-1 text-[14px] italic">
        {title}
        {caption ? `: ${caption}` : ''}
      </figcaption>
    </figure>
  );
}
