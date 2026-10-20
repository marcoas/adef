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
