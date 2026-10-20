/**
 * Registro del consumo de APIs externas (Issue #48).
 */
import { prisma } from '../db';

// Issue #48: registra una llamada a una API externa (éxito o fallo) para el
// panel de administración. Es "fuego y olvido": si el registro falla solo se
// loguea y no afecta la respuesta (la patente igual se procesa normalmente).
export async function recordExternalApiCall(ok: boolean, provider = 'plate_recognizer'): Promise<void> {
  try {
    await prisma.externalApiCall.create({ data: { provider, ok } });
  } catch (err) {
    console.error('No se pudo registrar el consumo de la API externa:', err);
  }
}

/** Primer instante del mes calendario de `now` (hora local del servidor). */
export function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// Issue #48: consumo del mes en curso (llamadas totales y exitosas). Lo usan
// el panel de administración y el corte por cuota del OCR (alprService), de
// modo que ambos cuentan exactamente lo mismo contra la cuota mensual.
export async function getMonthlyExternalApiUsage(
  provider = 'plate_recognizer',
  now = new Date(),
): Promise<{ total: number; ok: number }> {
  const since = startOfMonth(now);
  const [total, ok] = await Promise.all([
    prisma.externalApiCall.count({ where: { provider, createdAt: { gte: since } } }),
    prisma.externalApiCall.count({ where: { provider, createdAt: { gte: since }, ok: true } }),
  ]);
  return { total, ok };
}
