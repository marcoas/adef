/**
 * Cliente HTTP del backend.
 *
 * Centraliza la URL base, el header `Authorization: Bearer <jwt>` y la
 * lectura de errores `{ error }` que devuelve la API, para que los
 * componentes no repitan esa lógica.
 */
import { getToken } from './session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/** Error HTTP de la API: `message` es el `error` del backend (o un fallback). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, any>) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiInit = Omit<RequestInit, 'body'> & {
  /** Cuerpo a serializar como JSON (agrega Content-Type). */
  json?: unknown;
};

/** Agrega `?albumId=` cuando se opera sobre un álbum compartido (Issue #12). */
export function withAlbum(path: string, albumId?: string | null): string {
  return albumId ? `${path}?albumId=${albumId}` : path;
}

/** fetch a `API_URL + path` con el JWT (si hay sesión). Devuelve la Response cruda. */
export function apiFetch(path: string, { json, headers, ...init }: ApiInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
}

/** Lee el cuerpo JSON; `{}` si no hay cuerpo o no es JSON. */
export async function readJson<T = Record<string, any>>(res: Response): Promise<T> {
  return res.json().catch(() => ({})) as Promise<T>;
}

/**
 * Pedido que espera JSON: devuelve el cuerpo si la respuesta es 2xx y, si no,
 * lanza ApiError con el mensaje del backend o `fallbackError`.
 */
export async function apiJson<T = Record<string, any>>(
  path: string,
  init?: ApiInit,
  fallbackError = 'Error',
): Promise<T> {
  const res = await apiFetch(path, init);
  const data = await readJson<Record<string, any>>(res);
  if (!res.ok) throw new ApiError(data.error || fallbackError, res.status, data);
  return data as T;
}

/** Mensaje legible de un error capturado en un catch. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
