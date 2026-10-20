/**
 * Helpers de formato compartidos (casilleros, patentes y fechas).
 */
import type { Locale } from './i18n';

/** Casillero con 3 dígitos: 7 → "007". */
export const padSlot = (n: number) => String(n).padStart(3, '0');

/** Primeros 3 dígitos consecutivos de una patente ("AB 123 CD" → "123"), o null. */
export function extractSlotDigits(plate: string): string | null {
  return plate.match(/\d{3}/)?.[0] ?? null;
}

/** Casillero (0-999) que corresponde a una patente, o null si no tiene 3 dígitos. */
export function extractSlot(plate: string): number | null {
  const digits = extractSlotDigits(plate);
  return digits ? parseInt(digits, 10) : null;
}

/** Código de locale para Intl/toLocale* según el idioma de la app. */
export const dateLocale = (locale: Locale) => (locale === 'en' ? 'en-US' : 'es-AR');
