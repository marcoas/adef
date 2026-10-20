/**
 * Rutas de autenticación: login con Google y sesión actual (/api/auth/*).
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { ADMIN_EMAILS, JWT_SECRET } from '../config';
import { requireAuth } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../lib/asyncHandler';
import { authUser } from '../types';

const router = Router();

router.post('/auth/login', strictLimiter, asyncHandler(async (req, res) => {
  const { email, name, avatarUrl, idToken, authProvider } = req.body;
  let userEmail = email;
  let userName = name;
  let userAvatar = avatarUrl;

  // Si viene idToken de Google OAuth, extraer información de usuario del token
  if (idToken) {
    try {
      const decoded: any = jwt.decode(idToken);
      if (decoded && decoded.email) {
        userEmail = decoded.email;
        userName = decoded.name || decoded.given_name || userEmail.split('@')[0];
        userAvatar = decoded.picture || avatarUrl;
      }
    } catch (err) {
      console.warn('Error al decodificar idToken de Google:', err);
    }
  }

  if (!userEmail) {
    return res.status(400).json({ error: 'Se requiere un email válido para iniciar sesión' });
  }

  let user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userEmail,
        name: userName || userEmail.split('@')[0],
        authProvider: authProvider || 'google',
        avatarUrl: userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      },
    });

    await prisma.album.create({
      data: {
        title: `Álbum de ${user.name}`,
        ownerId: user.id,
      },
    });
  } else if (userName && user.name !== userName) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: userName,
        avatarUrl: userAvatar || user.avatarUrl,
      },
    });
  }

  // Issue #41: las cuentas restringidas por un admin no pueden iniciar sesión
  if (user.status === 'RESTRICTED') {
    return res.status(403).json({
      error: 'Tu cuenta está restringida por un administrador. Contactá al administrador del sistema.',
      accountRestricted: true,
    });
  }

  // Issue #41: "sembrar" administradores desde el entorno ADMIN_EMAILS (idempotente)
  if (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(user.email.toLowerCase()) && !user.isAdmin) {
    user = await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  }

  // Issue #41: registrar último login para el dashboard de uso
  user = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token, user });
}, { log: 'Error en auth login:', error: 'Error al autenticar' }));

// Issue #41: sesión actual desde la BD. Permite al frontend refrescar datos
// de cuenta (rol admin, estado) guardados en sesiones antiguas.
router.get('/auth/me', requireAuth, (req, res) => {
  const user = authUser(req);
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      authProvider: user.authProvider,
      isAdmin: user.isAdmin,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
    },
  });
});

export default router;
