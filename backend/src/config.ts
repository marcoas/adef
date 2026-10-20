/**
 * Configuración del backend leída desde variables de entorno.
 *
 * Centraliza los valores que antes estaban dispersos en index.ts para que
 * rutas, middlewares y servicios los importen desde un único lugar.
 */
import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 4000;
// En producción el secreto es obligatorio: con un valor por defecto conocido
// (está en el repo) cualquiera podría firmar JWT válidos para cualquier usuario.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET es obligatorio en producción.');
}
export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_patentes_2026_change_me';
// Client id de Google OAuth: el login solo acepta tokens emitidos para él
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * `trust proxy` de Express: cuántos saltos de proxy inverso (Render, Caddy,
 * nginx...) se consideran confiables para tomar la IP real del cliente desde
 * `X-Forwarded-For`. Sin esto, detrás de un proxy `req.ip` es la IP del proxy
 * y el rate limit por IP termina siendo global (todos comparten el cupo).
 *
 * Valores aceptados en `TRUST_PROXY`:
 * - número de saltos (`1`, `2`...): lo recomendado; `0` o `false` lo desactiva.
 * - lista de IPs/subredes o nombres de Express (`loopback`, `10.0.0.0/8`...).
 * - `true` NO se acepta tal cual: confiaría en cualquier `X-Forwarded-For`
 *   (falsificable por el cliente para evadir el rate limit, y
 *   express-rate-limit lo marca como inseguro); se degrada a `1` con aviso.
 *
 * Por defecto: `1` en producción (un proxy delante) y desactivado en
 * desarrollo, donde el backend se expone directo.
 */
export function parseTrustProxy(raw: string | undefined, isProduction: boolean): boolean | number | string {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return isProduction ? 1 : false;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) {
    const hops = parseInt(value, 10);
    return hops === 0 ? false : hops;
  }
  if (value === 'true') {
    console.warn('TRUST_PROXY=true es inseguro (X-Forwarded-For falsificable); se usa 1 salto de proxy.');
    return 1;
  }
  return raw!.trim();
}
export const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY, process.env.NODE_ENV === 'production');

// Issue #10: límites de carga de imágenes (solo JPG/PNG y tamaño máximo)
export const MAX_IMAGE_SIZE_MB = parseInt(process.env.MAX_IMAGE_SIZE_MB || '5', 10);
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png'];

// Issue #41: correos (separados por coma) que el sistema marca como admin de
// forma idempotente en cada login. Es la forma de "sembrar" los primeros
// administradores sin tocar la base de datos a mano.
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Issue #48: cuota mensual configurable de llamadas a la API externa
// (Plate Recognizer). Por defecto 1000 llamadas/mes; se lee desde env para
// poder ajustarla sin tocar código.
export const PLATE_RECOGNIZER_MONTHLY_QUOTA = parseInt(process.env.PLATE_RECOGNIZER_MONTHLY_QUOTA || '1000', 10);

// Issue #12: vigencia de los links de invitación
export const INVITE_TTL_DAYS = 7;

// Cantidad fija de casilleros del álbum (000-999)
export const TOTAL_SLOTS = 1000;
