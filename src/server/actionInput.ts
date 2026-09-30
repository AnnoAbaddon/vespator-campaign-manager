import 'server-only';
import { z } from 'zod';

/**
 * Laufzeit-Typprüfung für Server Actions: Argumente kommen als JSON vom Client, TypeScript-Typen gelten dort nicht.
 * Wirft „Ungültige Eingabe“ (Übersetzungsschlüssel), sonst liefert es den geprüften Wert.
 */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error('Ungültige Eingabe');
  return r.data;
}

/** Eine E-Mail-Adresse (keine Liste): höchstens 254 Zeichen, keine Trenn- oder Klammerzeichen */
export const singleEmail = z
  .email()
  .max(254)
  .refine((v) => !/[,;<>\s"()]/.test(v));

/** Genau eine gültige Adresse */
export const isSingleEmail = (v: unknown): boolean => typeof v === 'string' && singleEmail.safeParse(v).success;
