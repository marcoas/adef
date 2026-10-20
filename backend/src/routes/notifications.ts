/**
 * Issue #34: notificaciones de actividad del álbum (/api/notifications*).
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { authUserId } from '../types';

const router = Router();

router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const userId = authUserId(req);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
  const unreadOnly = String(req.query.unreadOnly ?? '') === 'true';

  const where = unreadOnly ? { userId, readAt: null } : { userId };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { album: { select: { id: true, title: true } } },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return res.json({
    unreadCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      albumId: n.albumId,
      albumTitle: n.album.title,
      actorName: n.actorName,
      slotNumber: n.slotNumber,
      rawPlate: n.rawPlate,
      message: n.message,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}, { log: 'Error al obtener las notificaciones:', error: 'Error al obtener las notificaciones' }));

// Marcar notificaciones como leídas (todas o una lista de ids)
router.post('/notifications/read', requireAuth, asyncHandler(async (req, res) => {
  const userId = authUserId(req);
  const ids: string[] = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((id: unknown) => typeof id === 'string')
    : [];

  const where = ids.length > 0 ? { userId, id: { in: ids } } : { userId, readAt: null };

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });

  return res.json({ updated: result.count });
}, { log: 'Error al marcar las notificaciones como leídas:', error: 'Error al actualizar las notificaciones' }));

export default router;
