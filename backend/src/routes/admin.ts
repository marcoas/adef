/**
 * Issue #41: panel privado de administración (/api/admin/*).
 * Todas las rutas exigen requireAuth + requireAdmin (user.isAdmin).
 */
import { Router } from 'express';
import { prisma } from '../db';
import { PLATE_RECOGNIZER_MONTHLY_QUOTA } from '../config';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getApiUsageSummary } from '../middleware/apiUsage';
import { asyncHandler } from '../lib/asyncHandler';
import { authUser } from '../types';
import { deleteAccountCascade } from '../services/accountService';

const router = Router();

// Dashboard de uso: totales, series de 14 días, consumo de la API
// (contador en memoria de 7 días) y últimos movimientos del sistema.
router.get('/admin/dashboard', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const [totalUsers, totalAlbums, totalStickers, restrictedUsers, adminUsers] = await Promise.all([
    prisma.user.count(),
    prisma.album.count(),
    prisma.sticker.count(),
    prisma.user.count({ where: { status: 'RESTRICTED' } }),
    prisma.user.count({ where: { isAdmin: true } }),
  ]);

  // Series diarias de los últimos 14 días (usuarios nuevos y figuritas pegadas)
  const now = new Date();
  const since = new Date(now.getTime() - 13 * 86400000);
  since.setHours(0, 0, 0, 0);
  const [usersRecent, stickersRecent] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.sticker.findMany({ where: { capturedAt: { gte: since } }, select: { capturedAt: true } }),
  ]);
  const dayKey = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const last14Days: { day: string; users: number; stickers: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    last14Days.push({ day: dayKey(new Date(now.getTime() - i * 86400000)), users: 0, stickers: 0 });
  }
  const dayMap: Record<string, { day: string; users: number; stickers: number }> = {};
  for (const d of last14Days) dayMap[d.day] = d;
  for (const u of usersRecent) {
    const slot = dayMap[dayKey(u.createdAt)];
    if (slot) slot.users += 1;
  }
  for (const s of stickersRecent) {
    const slot = dayMap[dayKey(s.capturedAt)];
    if (slot) slot.stickers += 1;
  }

  // Últimos movimientos del sistema (cualquier álbum)
  const recentActivity = await prisma.stickerActivity.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
    include: { album: { select: { title: true } } },
  });

  // Issue #48: consumo de la API externa (Plate Recognizer) en el mes actual:
  // total de llamadas, exitosas, fallidas, cuota mensual, restante y %.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [extTotal, extOk] = await Promise.all([
    prisma.externalApiCall.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.externalApiCall.count({ where: { createdAt: { gte: monthStart }, ok: true } }),
  ]);
  const externalApiUsage = {
    provider: 'Plate Recognizer',
    monthLabel: now.toLocaleString('es-AR', { month: 'long', year: 'numeric' }),
    total: extTotal,
    ok: extOk,
    failed: extTotal - extOk,
    quota: PLATE_RECOGNIZER_MONTHLY_QUOTA,
    remaining: Math.max(0, PLATE_RECOGNIZER_MONTHLY_QUOTA - extTotal),
    percentUsed: PLATE_RECOGNIZER_MONTHLY_QUOTA > 0 ? Math.round((extTotal / PLATE_RECOGNIZER_MONTHLY_QUOTA) * 100) : 0,
  };

  return res.json({
    totals: { users: totalUsers, albums: totalAlbums, stickers: totalStickers, restrictedUsers, adminUsers },
    last14Days,
    // Consumo de la API agrupado por endpoint (últimos 7 días, en memoria)
    apiUsage: getApiUsageSummary(),
    externalApiUsage,
    recentActivity,
    generatedAt: new Date().toISOString(),
  });
}, { log: 'Error en el dashboard de administración:', error: 'Error al obtener el dashboard de administración' }));

// Listado de usuarios (buscable) + con quién comparten su álbum y en qué
// otros álbumes participan como asociados.
router.get('/admin/users', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const search = ((req.query.search as string) || '').trim();
  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      // Álbumes propios → con quién los comparte
      ownedAlbums: {
        select: {
          id: true,
          title: true,
          createdAt: true,
          members: {
            select: {
              role: true,
              joinedAt: true,
              user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            },
          },
        },
      },
      // Álbumes de otros en los que participa como asociado
      memberships: {
        select: {
          role: true,
          joinedAt: true,
          album: {
            select: {
              id: true,
              title: true,
              ownerId: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
      },
      _count: { select: { stickers: true } },
    },
  });
  return res.json({ users });
}, { log: 'Error al listar usuarios (admin):', error: 'Error al listar los usuarios' }));

// Ver el álbum de OTRO usuario (solo admin): miembros, rol y figuritas
router.get('/admin/users/:userId/album', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({
    where: { id: req.params.userId },
    include: { ownedAlbums: true },
  });
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const album = target.ownedAlbums[0] || null;
  if (!album) {
    return res.json({
      user: { id: target.id, name: target.name, email: target.email, avatarUrl: target.avatarUrl },
      album: null,
      members: [],
      stickers: [],
    });
  }

  const [members, stickers] = await Promise.all([
    prisma.albumMember.findMany({
      where: { albumId: album.id },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    }),
    prisma.sticker.findMany({
      where: { albumId: album.id },
      orderBy: { slotNumber: 'asc' },
      include: { uploadedBy: { select: { name: true } } },
    }),
  ]);

  return res.json({
    user: { id: target.id, name: target.name, email: target.email, avatarUrl: target.avatarUrl },
    album: { id: album.id, title: album.title },
    memberCount: members.length + 1, // +1 por el dueño
    members,
    stickers,
  });
}, { log: 'Error al ver el álbum de otro usuario (admin):', error: 'Error al obtener el álbum del usuario' }));

// Actualizar un usuario: rol de admin y/o estado (restringir / reactivar)
router.patch('/admin/users/:userId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const admin = authUser(req);
  const targetId = req.params.userId;
  const { isAdmin, status } = (req.body || {}) as { isAdmin?: boolean; status?: string };

  if (targetId === admin.id) {
    return res.status(400).json({ error: 'No podés modificar tu propia cuenta desde el panel de administración.' });
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const data: { isAdmin?: boolean; status?: 'ACTIVE' | 'RESTRICTED' } = {};
  if (typeof isAdmin === 'boolean') {
    if (isAdmin === false && target.isAdmin) {
      const activeAdmins = await prisma.user.count({ where: { isAdmin: true } });
      if (activeAdmins <= 1) {
        return res.status(400).json({ error: 'No se puede revocar el rol al único administrador del sistema.' });
      }
    }
    data.isAdmin = isAdmin;
  }
  if (status !== undefined) {
    if (status !== 'ACTIVE' && status !== 'RESTRICTED') {
      return res.status(400).json({ error: 'Estado inválido: use ACTIVE o RESTRICTED.' });
    }
    data.status = status;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar: envíe isAdmin y/o status.' });
  }

  const updated = await prisma.user.update({ where: { id: targetId }, data });
  return res.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      isAdmin: updated.isAdmin,
      status: updated.status,
    },
  });
}, { log: 'Error al actualizar usuario (admin):', error: 'Error al actualizar el usuario' }));

// Eliminar un usuario (cancelación total): su álbum, figuritas e imágenes
// almacenadas se borran (cascade en BD + best effort en disco). La lógica
// es común con la autoeliminación del usuario (Issue #54) y vive en
// deleteAccountCascade().
router.delete('/admin/users/:userId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const admin = authUser(req);
  const targetId = req.params.userId;
  if (targetId === admin.id) {
    return res.status(400).json({ error: 'No podés eliminar tu propia cuenta desde el panel de administración.' });
  }

  const deleted = await deleteAccountCascade(targetId);
  if (!deleted) return res.status(404).json({ error: 'Usuario no encontrado.' });

  return res.json({ message: `Usuario ${deleted.email} eliminado del sistema.` });
}, { log: 'Error al eliminar usuario (admin):', error: 'Error al eliminar el usuario' }));

export default router;
