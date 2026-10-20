/**
 * Servicio de Reconocimiento de Patentes ALPR (Automatic License Plate Recognition).
 *
 * El reconocimiento se delega por completo a Plate Recognizer API (IA
 * especializada en patentes): el backend no procesa OCR localmente. Sin
 * token configurado lanza `OcrNotConfiguredError`; si la API falla, lanza
 * `OcrProviderError`; si se agotó la cuota mensual, `OcrQuotaExceededError`.
 *
 * Las llamadas a Plate Recognizer pasan por un limitador en memoria que las
 * espacia a 1 por segundo como máximo (límite del plan gratuito): las
 * solicitudes concurrentes esperan su turno en orden de llegada.
 *
 * El texto devuelto se procesa con utils/plateExtractor para obtener el
 * casillero (000-999) que corresponde a la patente leída.
 */
import { extractPlate, PlateResult } from '../utils/plateExtractor';

// Issue #48: dependencias opcionales que se inyectan desde routes/plates.ts
// (services/externalApiUsage.ts) para no acoplar este servicio a la BD:
// - `recordExternalCall`: registra cada llamada real a la API externa.
// - `getMonthlyUsage` + `monthlyQuota`: consumo del mes y cuota; si el
//   consumo ya alcanzó la cuota no se llama a la API (corte por cuota).
export interface ALPRDeps {
  recordExternalCall?: (ok: boolean) => void | Promise<void>;
  getMonthlyUsage?: () => number | Promise<number>;
  monthlyQuota?: number;
}

export class OcrNotConfiguredError extends Error {}
export class OcrProviderError extends Error {}
/** Se alcanzó la cuota mensual de llamadas a Plate Recognizer (Issue #48). */
export class OcrQuotaExceededError extends Error {
  constructor(public readonly used: number, public readonly quota: number) {
    super(`Cuota mensual de Plate Recognizer agotada (${used}/${quota})`);
  }
}

const PROVIDER = 'Plate Recognizer Cloud API (IA Especializada)';

// Plan gratuito de Plate Recognizer: 1 llamada por segundo como máximo.
export const PLATE_RECOGNIZER_MIN_INTERVAL_MS = 1000;

/**
 * Limitador en memoria que espacia las ejecuciones al menos `intervalMs`.
 * Cada llamada reserva sincrónicamente el próximo turno libre, así que los
 * turnos se asignan en orden de llegada (FIFO) sin necesidad de una cola
 * explícita. Es por proceso: con varias instancias del backend el tope real
 * sería 1/s por instancia.
 */
export function createIntervalLimiter(intervalMs: number) {
  let nextSlotAt = 0;
  return function waitForTurn(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, nextSlotAt);
    nextSlotAt = slot + intervalMs;
    const wait = slot - now;
    return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
  };
}

const waitForPlateRecognizerTurn = createIntervalLimiter(PLATE_RECOGNIZER_MIN_INTERVAL_MS);

/**
 * Issue #48: corta antes de llamar si el consumo del mes ya alcanzó la cuota.
 * Una cuota <= 0 (o no numérica) desactiva el corte. Si no se puede leer el
 * consumo (BD caída) se deja pasar la llamada: el corte es una protección de
 * costos y no debe dejar sin OCR por un fallo transitorio del conteo.
 */
async function assertQuotaAvailable(deps: ALPRDeps): Promise<void> {
  const quota = deps.monthlyQuota;
  if (!deps.getMonthlyUsage || quota === undefined || !Number.isFinite(quota) || quota <= 0) return;

  let used: number;
  try {
    used = await deps.getMonthlyUsage();
  } catch (err) {
    console.error('No se pudo leer el consumo mensual de Plate Recognizer; se omite el corte por cuota:', err);
    return;
  }
  if (used >= quota) throw new OcrQuotaExceededError(used, quota);
}

export async function recognizePlateALPR(
  imageBase64: string,
  deps: ALPRDeps = {},
): Promise<{ ocrText: string; plateResult: PlateResult; provider: string }> {
  const PLATE_RECOGNIZER_TOKEN = process.env.PLATE_RECOGNIZER_TOKEN?.trim();
  if (!PLATE_RECOGNIZER_TOKEN || PLATE_RECOGNIZER_TOKEN === '123456') {
    throw new OcrNotConfiguredError('PLATE_RECOGNIZER_TOKEN no configurado');
  }

  // Issue #48: con la cuota agotada no se espera turno ni se llama a la API.
  await assertQuotaAvailable(deps);

  // Asegurar formato base64 adecuado
  const formattedBase64 = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  // Respetar el máximo de 1 llamada por segundo (las concurrentes esperan).
  await waitForPlateRecognizerTurn();

  let response: Response;
  try {
    response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${PLATE_RECOGNIZER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upload: formattedBase64,
      }),
    });
  } catch (error) {
    // Issue #48: excepción durante la llamada (red/timeout) => consumo fallido.
    deps.recordExternalCall?.(false);
    throw new OcrProviderError(`No se pudo conectar con Plate Recognizer: ${error}`);
  }

  if (!response.ok) {
    // Issue #48: el servicio respondió con error => consumo fallido.
    deps.recordExternalCall?.(false);
    const errText = await response.text();
    throw new OcrProviderError(`Error en respuesta de Plate Recognizer (${response.status}): ${errText}`);
  }

  // Issue #48: el servicio respondió correctamente => consumió 1 llamada.
  deps.recordExternalCall?.(true);
  const data: any = await response.json();

  if (!data.results || data.results.length === 0) {
    console.warn('⚠️ Plate Recognizer no encontró placas en la foto enviada.');
    return { ocrText: '', plateResult: extractPlate(''), provider: PROVIDER };
  }

  const detectedPlate = data.results[0].plate.toUpperCase();
  console.log(`🎯 Plate Recognizer detectó patente: "${detectedPlate}" con confianza ${data.results[0].score}`);

  return {
    ocrText: detectedPlate,
    plateResult: extractPlate(detectedPlate),
    provider: PROVIDER,
  };
}
