/**
 * Zerlegt das Kampagnen-FAQ (docs/FAQ.md bzw. FAQ.en.md) in eine Struktur für die Leseansicht:
 * Titel, kurze Einleitung, Hinweise/Legende, Abschnitte mit Fragen (Regelbezug, Hintergrund, Entscheidung).
 * Rein und ohne Abhängigkeiten, damit es auf Server und Client sowie im Test läuft. Unbekannte Teile bleiben
 * als Markdown erhalten und werden unverändert angezeigt.
 */

export type FaqBlockKind = 'decision' | 'reference' | 'background' | 'note' | 'other';

export interface FaqBlock {
  kind: FaqBlockKind;
  /** Beschriftung ohne Einstufung, z. B. „Entscheidung“ */
  label: string;
  /** Einstufung der Entscheidung, z. B. „Regeltext“, „Auslegung“, „Hausregel“ */
  grade?: string;
  /** Inhalt als Markdown */
  body: string;
}

export interface FaqQuestion {
  /** Kennung wie „F-1“ */
  id: string;
  /** Sprungmarke, z. B. „f-1“ (wie die Links der Regelseite) */
  anchor: string;
  title: string;
  blocks: FaqBlock[];
}

export interface FaqSection {
  title: string;
  anchor: string;
  questions: FaqQuestion[];
  /** Markdown ohne Fragen (z. B. Quellen) */
  body: string;
}

export interface FaqDoc {
  title: string;
  intro: string;
  /** Hinweise und Legende der Einstufung (Markdown) */
  notes: string;
  sections: FaqSection[];
}

const KIND: [RegExp, FaqBlockKind][] = [
  [/^(Entscheidung|Decision)$/i, 'decision'],
  [/^(Regelbezug|Rules reference)$/i, 'reference'],
  [/^(Hintergrund|Background)$/i, 'background'],
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Inhalt einer Frage in Blöcke zerlegen: „- **Label (Einstufung):** Text“ mit eingerückten Folgezeilen */
function parseBlocks(lines: string[]): FaqBlock[] {
  const out: FaqBlock[] = [];
  let cur: FaqBlock | null = null;
  let loose: string[] = [];
  const flushLoose = () => {
    const text = loose.join('\n').trim();
    if (text) {
      // Hinweis „In dieser Kampagne abweichend“ (Blockzitat) hervorheben, sonst freier Text
      const quote = /^>\s?/.test(text);
      out.push({ kind: quote ? 'note' : 'other', label: '', body: quote ? text.replace(/^>\s?/gm, '') : text });
    }
    loose = [];
  };
  for (const line of lines) {
    const m = /^- \*\*([^*]+?):\*\*\s*(.*)$/.exec(line) ?? /^- \*\*([^*]+?)\*\*:\s*(.*)$/.exec(line);
    if (m) {
      flushLoose();
      const raw = m[1].trim();
      const g = /^(.*?)\s*\(([^)]+)\)$/.exec(raw);
      const label = (g ? g[1] : raw).trim();
      const kind = KIND.find(([re]) => re.test(label))?.[1] ?? 'other';
      cur = { kind, label, grade: g?.[2]?.trim(), body: m[2] };
      out.push(cur);
      continue;
    }
    if (cur && /^\s{2,}\S/.test(line)) {
      cur.body += `\n${line.replace(/^ {2}/, '')}`;
      continue;
    }
    if (line.trim() === '') {
      cur = null;
      loose.push('');
      continue;
    }
    cur = null;
    loose.push(line);
  }
  flushLoose();
  for (const b of out) b.body = b.body.trim();
  return out;
}

export function parseFaq(md: string): FaqDoc {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  const pre: string[] = [];
  const sections: FaqSection[] = [];
  let sec: FaqSection | null = null;
  let q: { head: string; lines: string[] } | null = null;
  let secLines: string[] = [];

  const closeQ = () => {
    if (!q || !sec) return;
    const m = /^(F-\d+[a-z]?)\s+(.*)$/i.exec(q.head);
    const id = m ? m[1] : q.head;
    sec.questions.push({ id, anchor: slug(id), title: m ? m[2] : q.head, blocks: parseBlocks(q.lines) });
    q = null;
  };
  const closeSec = () => {
    closeQ();
    if (sec) {
      sec.body = secLines.join('\n').trim();
      sections.push(sec);
    }
    sec = null;
    secLines = [];
  };

  for (const line of lines) {
    const h1 = /^# (.*)$/.exec(line);
    const h2 = /^## (.*)$/.exec(line);
    const h3 = /^### (.*)$/.exec(line);
    if (h1 && !title && !sec) {
      title = h1[1].trim();
      continue;
    }
    if (h2) {
      closeSec();
      const t = h2[1].trim();
      sec = { title: t, anchor: slug(t), questions: [], body: '' };
      continue;
    }
    if (h3 && sec) {
      closeQ();
      q = { head: h3[1].trim(), lines: [] };
      continue;
    }
    // Trennlinien gliedern nur das Markdown; der Querverweis auf die andere Sprachfassung gilt nur im Repository
    if (/^-{3,}\s*$/.test(line) || (!sec && /^(English|German) version: /.test(line))) continue;
    if (q) q.lines.push(line);
    else if (sec) secLines.push(line);
    else pre.push(line);
  }
  closeSec();

  // Vorspann: erster Absatz = Einleitung, der Rest (Hinweise, Legende) = notes
  const text = pre.join('\n').trim();
  const firstBreak = text.search(/\n\s*\n/);
  const intro = firstBreak < 0 ? text : text.slice(0, firstBreak).trim();
  const notes = firstBreak < 0 ? '' : text.slice(firstBreak).trim();
  return { title, intro, notes, sections };
}
