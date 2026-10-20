/**
 * Límites de tasa por IP (defensa contra fuerza bruta y abuso de recursos).
 *
 * - `generalLimiter`: tope amplio para toda la API (frena DoS básico).
 * - `strictLimiter`: tope bajo para rutas sensibles o costosas (login y OCR,
 *   que consume cuota de la API externa).
 *
 * Nota: si el backend se despliega detrás de un proxy (Render, Nginx...),
 * configurar `app.set('trust proxy', 1)` para que `req.ip` sea la IP real.
 */
import rateLimit from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

export const generalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.' },
});

export const strictLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' },
});
