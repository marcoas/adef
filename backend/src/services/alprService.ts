import { createWorker } from 'tesseract.js';
import { extractArgentinePlate, PlateResult } from '../utils/plateExtractor';

/**
 * Servicio de Reconocimiento de Patentes ALPR (Automatic License Plate Recognition)
 * 
 * 1. Intenta consulta a Plate Recognizer API (IA especializada en patentes de Argentina).
 * 2. Si no hay Token o falla la conexión, realiza fallback automático a Tesseract OCR Local.
 */
export async function recognizePlateALPR(imageBase64: string): Promise<{ ocrText: string; plateResult: PlateResult; provider: string }> {
  const PLATE_RECOGNIZER_TOKEN = process.env.PLATE_RECOGNIZER_TOKEN;

  // Estrategia 1: Plate Recognizer Cloud Service (100% Gratuito y especializado en patentes argentinas)
  if (PLATE_RECOGNIZER_TOKEN && PLATE_RECOGNIZER_TOKEN.trim() !== '' && PLATE_RECOGNIZER_TOKEN !== '123456') {
    try {
      console.log('🌐 Ejecutando ALPR vía Plate Recognizer Cloud API...');
      
      // Asegurar formato base64 adecuado
      const formattedBase64 = imageBase64.startsWith('data:') 
        ? imageBase64 
        : `data:image/jpeg;base64,${imageBase64}`;

      const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${PLATE_RECOGNIZER_TOKEN.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          upload: formattedBase64,
          regions: ['ar'], // Región Argentina
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🌐 Respuesta exitosa de Plate Recognizer API:', JSON.stringify(data.results));

        if (data.results && data.results.length > 0) {
          const detectedPlate = data.results[0].plate.toUpperCase();
          console.log(`🎯 Plate Recognizer detectó patente: "${detectedPlate}" con confianza ${data.results[0].score}`);

          const plateResult = extractArgentinePlate(detectedPlate);
          return {
            ocrText: detectedPlate,
            plateResult,
            provider: 'Plate Recognizer Cloud API (IA Especializada)',
          };
        } else {
          console.warn('⚠️ Plate Recognizer no encontró placas en la foto enviada.');
        }
      } else {
        const errText = await response.text();
        console.error(`❌ Error en respuesta de Plate Recognizer (${response.status}):`, errText);
      }
    } catch (error) {
      console.error('⚠️ Excepción al conectar con Plate Recognizer:', error);
    }
  } else {
    console.log('ℹ️ PLATE_RECOGNIZER_TOKEN no configurado o por defecto. Usando Tesseract OCR local.');
  }

  // Estrategia 2: Motor Local Tesseract OCR en Docker
  console.log('⚙️ Ejecutando Tesseract OCR local...');
  const worker = await createWorker('spa');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
    tessedit_pageseg_mode: '11' as any,
  });

  const { data: { text } } = await worker.recognize(imageBase64);
  await worker.terminate();

  const plateResult = extractArgentinePlate(text);
  return {
    ocrText: text.trim(),
    plateResult,
    provider: 'Tesseract OCR Local',
  };
}
