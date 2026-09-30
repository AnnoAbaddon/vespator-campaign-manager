/** Eingravierter Wahlspruch auf der oberen Rahmenkante eines Gehäuses (rein dekorativ; Text aus `MOTTO` in src/flavor.ts) */
export function Motto({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span className="motto" aria-hidden>
      {text}
    </span>
  );
}
