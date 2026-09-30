/**
 * Zerlegt die Hilfe (docs/GUIDE.md bzw. GUIDE.de.md) für die Anzeige in der App: Titel, Einleitung, Abschnitte (##)
 * mit Unterabschnitten (###). Rein und ohne Abhängigkeiten (Server, Client, Test). Text vor dem ersten
 * Unterabschnitt bleibt als Vorspann des Abschnitts erhalten; tiefere Überschriften bleiben Teil des Markdowns.
 */

export interface GuideTopic {
  title: string;
  anchor: string;
  /** Inhalt als Markdown */
  body: string;
}

export interface GuideSection {
  title: string;
  anchor: string;
  /** Markdown vor dem ersten Unterabschnitt */
  lead: string;
  topics: GuideTopic[];
}

export interface GuideDoc {
  title: string;
  intro: string;
  sections: GuideSection[];
}

/** Abschnitte der Hilfe, die auch die Spielerseite zeigt (Überschriften der deutschen und englischen Fassung) */
export const PLAYER_SECTIONS = [/^(Spieler|Players)\b/i, /^(Probleme|Troubleshooting)\b/i];

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function parseGuide(md: string): GuideDoc {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  const pre: string[] = [];
  const sections: GuideSection[] = [];
  const used = new Set<string>();
  // Sprungmarken eindeutig halten (gleichnamige Unterabschnitte in verschiedenen Abschnitten)
  const anchor = (base: string) => {
    let a = `h-${slug(base) || 'x'}`;
    for (let i = 2; used.has(a); i++) a = `h-${slug(base) || 'x'}-${i}`;
    used.add(a);
    return a;
  };
  let sec: (GuideSection & { buf: string[] }) | null = null;
  let topic: (GuideTopic & { buf: string[] }) | null = null;
  let inFence = false;

  const closeTopic = () => {
    if (topic && sec) sec.topics.push({ title: topic.title, anchor: topic.anchor, body: topic.buf.join('\n').trim() });
    topic = null;
  };
  const closeSection = () => {
    closeTopic();
    if (sec) sections.push({ title: sec.title, anchor: sec.anchor, lead: sec.buf.join('\n').trim(), topics: sec.topics });
    sec = null;
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = inFence ? null : /^(#{1,3}) (.*?)\s*#*\s*$/.exec(line);
    if (h && h[1] === '#' && !title && !sec) {
      title = h[2];
      continue;
    }
    if (h && h[1] === '##') {
      closeSection();
      sec = { title: h[2], anchor: anchor(h[2]), lead: '', topics: [], buf: [] };
      continue;
    }
    if (h && h[1] === '###' && sec) {
      closeTopic();
      topic = { title: h[2], anchor: anchor(`${sec.title} ${h[2]}`), body: '', buf: [] };
      continue;
    }
    // Querverweis auf die andere Sprachfassung gilt nur im Repository
    if (!sec && /^(English|German) version: /.test(line)) continue;
    if (topic) topic.buf.push(line);
    else if (sec) sec.buf.push(line);
    else pre.push(line);
  }
  closeSection();
  return { title, intro: pre.join('\n').trim(), sections };
}

/** Nur die Abschnitte für Spieler (Spielerseite) */
export function playerGuide(doc: GuideDoc): GuideDoc {
  return { ...doc, intro: '', sections: doc.sections.filter((s) => PLAYER_SECTIONS.some((re) => re.test(s.title))) };
}
