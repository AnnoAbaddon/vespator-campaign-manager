'use server';

import { revalidatePath } from 'next/cache';
import { authorize } from '@/server/authz';
import { audit } from '@/server/audit';
import { MAX_LEGAL_CHARS, setLegalText, type LegalKind } from '@/server/legal';

/** Datenschutzhinweis bzw. Impressum speichern (nur Admins); leer = Vorlage bzw. Hinweis anzeigen */
export async function saveLegalTextAction(_prev: string | null, form: FormData): Promise<string | null> {
  const a = await authorize('instance.manage');
  const kind = String(form.get('kind') ?? '') as LegalKind;
  if (kind !== 'privacy' && kind !== 'imprint') return 'Ungültige Angabe';
  const text = String(form.get('text') ?? '');
  if (text.length > MAX_LEGAL_CHARS) return 'Text zu lang (höchstens 30.000 Zeichen)';
  setLegalText(kind, text);
  audit(a.username, kind === 'privacy' ? 'Datenschutzhinweis geändert' : 'Impressum geändert', text.trim() ? null : '–');
  revalidatePath(kind === 'privacy' ? '/datenschutz' : '/impressum');
  revalidatePath('/admin/settings');
  return 'Gespeichert';
}
