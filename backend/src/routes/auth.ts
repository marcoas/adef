/**
 * Rutas de autenticación: login con Google y sesión actual (/api/auth/*).
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { ADMIN_EMAILS, GOOGLE_CLIENT_ID, JWT_SECRET } from '../config';
import { requireAuth } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyGoogleAccessToken } from '../services/googleAuth';
import { authUser } from '../types';

const router = Router();

router.post('/auth/login', strictLimiter, asyncHandler(async (req, res) => {
  // La identidad SIEMPRE sale del access token verificado con Google; nunca
  // se confía en email/nombre enviados por el cliente (permitiría suplantar
  // a cualquier usuario).
  const { accessToken } = req.body ?? {};
  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ error: 'Se requiere el token de acceso de Google para iniciar sesión' });
  }
  if (!GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID no está configurado en el backend.');
    return res.status(500).json({ error: 'El login con Google no está configurado en el servidor' });
  }

  const profile = await verifyGoogleAccessToken(accessToken, GOOGLE_CLIENT_ID);
  if (!profile) {
    return res.status(401).json({ error: 'No se pudo verificar tu cuenta de Google. Iniciá sesión nuevamente.' });
  }
  const userEmail = profile.email;
  const userName = profile.name;
  const userAvatar = profile.picture;

  let user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userEmail,
        name: userName || userEmail.split('@')[0],
        authProvider: 'google',
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
