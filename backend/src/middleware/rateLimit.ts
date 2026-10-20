/**
 * Límites de tasa por IP (defensa contra fuerza bruta y abuso de recursos).
 *
 * - `generalLimiter`: tope amplio para toda la API (frena DoS básico).
 * - `strictLimiter`: tope bajo para rutas sensibles o costosas (login y OCR,
 *   que consume cuota de la API externa).
 *
 * Nota: el límite es por `req.ip`. Detrás de un proxy inverso (Render, Caddy,
 * nginx...) esa IP sale de `X-Forwarded-For` gracias a `app.set('trust proxy')`
 * en app.ts, configurable con la variable `TRUST_PROXY` (ver config.ts; por
 * defecto 1 salto en producción). Si quedara desactivado detrás de un proxy,
 * todas las solicitudes compartirían el cupo de la IP del proxy.
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
