/**
 * Configuración del backend leída desde variables de entorno.
 *
 * Centraliza los valores que antes estaban dispersos en index.ts para que
 * rutas, middlewares y servicios los importen desde un único lugar.
 */
import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 4000;
export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_patentes_2026_change_me';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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
