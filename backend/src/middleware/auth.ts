/**
 * Middlewares de autenticación (JWT) y autorización (administradores).
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { prisma } from '../db';
import { AuthedRequest } from '../types';

// Middleware: exige un JWT válido (Authorization: Bearer <token>) para
// interactuar con el álbum (cargar / eliminar fotos) - Issue #6
// Issue #41: además valida que la cuenta exista y no esté RESTRICTED.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Debes iniciar sesión para interactuar con el álbum.' });
  }
  let payload: { id?: string; email?: string };
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET) as { id?: string; email?: string };
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión nuevamente.' });
  }
  (req as AuthedRequest).authUserId = payload.id;
  (req as AuthedRequest).authEmail = payload.email;
  if (!payload.id) {
    return res.status(401).json({ error: 'Sesión inválida: el token no identifica a un usuario.' });
  }

  prisma.user
    .findUnique({ where: { id: payload.id } })
    .then((user) => {
      if (!user) {
        return res.status(401).json({ error: 'Sesión inválida: el usuario ya no existe.' });
      }
      // Issue #41: cuenta restringida por un admin → sin acceso al sistema
      if (user.status === 'RESTRICTED') {
        return res.status(403).json({
          error: 'Tu cuenta está restringida por un administrador. Contactá al administrador del sistema.',
          accountRestricted: true,
        });
      }
      (req as AuthedRequest).authUser = user;
      next();
    })
    .catch(() => res.status(500).json({ error: 'Error interno al validar la sesión.' }));
}

// Middleware Issue #41: exige permisos de administrador (usar DESPUÉS de requireAuth)
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthedRequest).authUser;
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Requiere permisos de administrador.' });
  }
  next();
}
