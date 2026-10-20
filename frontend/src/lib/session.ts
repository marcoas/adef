/**
 * Persistencia de la sesión en localStorage (JWT propio + datos del usuario).
 * Único lugar que conoce las claves de almacenamiento de la sesión.
 */
import type { UserSession } from '../types/domain';

const TOKEN_KEY = 'jwt_token';
const SESSION_KEY = 'user_session';

/** JWT del backend, o null si no hay sesión (o se ejecuta en el servidor). */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Usuario guardado, o null si no hay sesión o el JSON es inválido. */
export function loadStoredUser(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as UserSession;
  } catch (e) {
    console.error('Error parseando user_session de localStorage:', e);
    return null;
  }
}

/** Guarda el resultado de un login exitoso. */
export function saveSession(token: string | undefined, user: UserSession | undefined) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) storeUser(user);
}

/** Actualiza solo los datos del usuario guardados. */
export function storeUser(user: UserSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/** Logout local: borra token y usuario. */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
