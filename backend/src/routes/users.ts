/**
 * Cuenta del usuario autenticado (/api/users/me*): preferencias de avisos
 * (Issue #34) y autoeliminación irreversible (Issue #54).
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { authUserId } from '../types';
import { deleteAccountCascade } from '../services/accountService';

const router = Router();

// -------------------------------------------------------------
// Issue #34: PREFERENCIAS DEL USUARIO (recibir o no avisos)
// -------------------------------------------------------------
router.get('/users/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: authUserId(req) },
    select: { notifyOnAlbumActivity: true },
  });
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });

  return res.json({ notifyOnAlbumActivity: user.notifyOnAlbumActivity });
}, { log: 'Error al obtener las preferencias del usuario:', error: 'Error al obtener las preferencias' }));

router.put('/users/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const { notifyOnAlbumActivity } = req.body ?? {};

  if (typeof notifyOnAlbumActivity !== 'boolean') {
    return res.status(400).json({ error: 'El campo "notifyOnAlbumActivity" debe ser true o false.' });
  }

  const user = await prisma.user.update({
    where: { id: authUserId(req) },
    data: { notifyOnAlbumActivity },
    select: { notifyOnAlbumActivity: true },
  });

  return res.json({
    message: notifyOnAlbumActivity
      ? 'Volverás a recibir avisos cuando un asociado pegue una figurita.'
      : 'No volverás a recibir avisos de actividad del álbum.',
    notifyOnAlbumActivity: user.notifyOnAlbumActivity,
  });
}, { log: 'Error al guardar las preferencias del usuario:', error: 'Error al guardar las preferencias' }));

// -------------------------------------------------------------
// Issue #54: AUTOELIMINACIÓN DE LA CUENTA (irreversible)
// El usuario puede darse de baja definitiva desde su panel. La baja elimina:
//   - Su cuenta y datos personales.
//   - Su álbum y TODAS sus figuritas (incluidas las pegadas por asociados).
//   - Su acceso como asociado a los álbumes de otros usuarios.
//   - El acceso de sus asociados a su álbum (el álbum deja de existir).
// La vía administrativa está en DELETE /api/admin/users/:userId y rechaza
// eliminarse a sí mismo. Ambas usan deleteAccountCascade().
// -------------------------------------------------------------
router.delete('/users/me', requireAuth, asyncHandler(async (req, res) => {
  const deleted = await deleteAccountCascade(authUserId(req));
  if (!deleted) return res.status(401).json({ error: 'Usuario no encontrado.' });

  return res.json({
    message: 'Tu cuenta, tu álbum y tus figuritas fueron eliminados definitivamente.',
  });
}, { log: 'Error al autoeliminar la cuenta:', error: 'Error al eliminar la cuenta' }));

export default router;
