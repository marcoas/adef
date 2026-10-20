/**
 * Reconocimiento de patentes con ALPR / Tesseract OCR (/api/plates/*).
 */
import { Router } from 'express';
import { extractPlate } from '../utils/plateExtractor';
import { recognizePlateALPR } from '../services/alprService';
import { recordExternalApiCall } from '../services/externalApiUsage';
import { asyncHandler } from '../lib/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimit';

const router = Router();

// Requiere sesión: el OCR consume cuota de la API externa (Plate Recognizer)
// y CPU de Tesseract. Sin auth, un anónimo podía agotar la cuota o generar
// carga. El frontend solo lo usa estando logueado. Además se limita por IP.
router.post('/plates/ocr', strictLimiter, requireAuth, asyncHandler(async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'Se requiere la imagen en base64 para el OCR' });
  }

  // Issue #48: se registra cada llamada real a Plate Recognizer (éxito o
  // fallo) en la BD para el consumo del mes en el panel de administración.
  const alprResult = await recognizePlateALPR(imageBase64, {
    recordExternalCall: (ok) => recordExternalApiCall(ok),
  });
  return res.json(alprResult);
}, { log: 'Error en procesamiento OCR / ALPR:', error: 'Error al procesar la imagen con OCR/ALPR' }));

// Endpoint de prueba de Regex
router.post('/plates/parse', strictLimiter, requireAuth, asyncHandler((req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Se requiere el parámetro "text"' });
  }

  const result = extractPlate(text);
  return res.json(result);
}, { log: 'Error al procesar la patente:', error: 'Error interno del servidor' }));

export default router;
