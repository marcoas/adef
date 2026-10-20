/**
 * Servicio de Reconocimiento de Patentes ALPR (Automatic License Plate Recognition).
 *
 * El reconocimiento se delega por completo a Plate Recognizer API (IA
 * especializada en patentes): el backend no procesa OCR localmente. Sin
 * token configurado lanza `OcrNotConfiguredError`; si la API falla, lanza
 * `OcrProviderError`.
 *
 * El texto devuelto se procesa con utils/plateExtractor para obtener el
 * casillero (000-999) que corresponde a la patente leída.
 */
import { extractPlate, PlateResult } from '../utils/plateExtractor';

// Issue #48: callback opcional para registrar cada llamada real a una API
// externa (Plate Recognizer). Se inyecta desde routes/plates.ts
// (services/externalApiUsage.ts) para no acoplar este servicio a la BD.
export interface ALPRDeps {
  recordExternalCall?: (ok: boolean) => void | Promise<void>;
}

export class OcrNotConfiguredError extends Error {}
export class OcrProviderError extends Error {}

const PROVIDER = 'Plate Recognizer Cloud API (IA Especializada)';

export async function recognizePlateALPR(
  imageBase64: string,
  deps: ALPRDeps = {},
): Promise<{ ocrText: string; plateResult: PlateResult; provider: string }> {
  const PLATE_RECOGNIZER_TOKEN = process.env.PLATE_RECOGNIZER_TOKEN?.trim();
  if (!PLATE_RECOGNIZER_TOKEN || PLATE_RECOGNIZER_TOKEN === '123456') {
    throw new OcrNotConfiguredError('PLATE_RECOGNIZER_TOKEN no configurado');
  }

  // Asegurar formato base64 adecuado
  const formattedBase64 = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

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
