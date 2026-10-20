/**
 * Tipos compartidos de la capa HTTP.
 */
import { Request } from 'express';
import { User } from '@prisma/client';

// Request autenticado: el userId se extrae del JWT en `requireAuth`
export interface AuthedRequest extends Request {
  authUserId?: string;
  authEmail?: string;
  // Issue #41: usuario completo tomado de la BD (rol admin / estado de cuenta)
  authUser?: User;
}

/** Id del usuario autenticado. Usar solo en rutas protegidas con `requireAuth`. */
export function authUserId(req: Request): string {
  return (req as AuthedRequest).authUserId!;
}

/** Usuario autenticado (de la BD). Usar solo en rutas protegidas con `requireAuth`. */
export function authUser(req: Request): User {
  return (req as AuthedRequest).authUser!;
}
