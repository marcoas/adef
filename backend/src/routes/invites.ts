/**
 * Invitaciones de asociados (Issue #12): links únicos de un solo uso,
 * miembros del álbum #37 y log de invitaciones #39.
 *
 * Importante: `/invites/log` debe registrarse ANTES que `/invites/:token`,
 * de lo contrario el parámetro capturaría "log".
 */
import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../db';
import { FRONTEND_URL, INVITE_TTL_DAYS } from '../config';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { authUserId } from '../types';
import { requireOwnAlbum } from '../services/albumService';
import { notifyAlbumOwner } from '../services/notificationService';

const router = Router();

function buildInviteUrl(token: string) {
  return `${FRONTEND_URL.replace(/\/$/, '')}/invite/${token}`;
}

router.post(['/album/invites', '/invites'], requireAuth, asyncHandler(async (req, res) => {
  const context = await requireOwnAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.albumInvite.create({
    data: { token, albumId: album.id, createdById: authUserId(req), expiresAt },
  });

  return res.status(201).json({
    invite: {
      id: invite.id,
      token: invite.token,
      url: buildInviteUrl(invite.token),
      albumId: album.id,
      albumTitle: album.title,
      expiresAt: invite.expiresAt.toISOString(),
      usedAt: invite.usedAt,
    },
  });
}, { log: 'Error al crear la invitación:', error: 'Error al crear el link de invitación' }));

router.get(['/album/invites', '/invites'], requireAuth, asyncHandler(async (req, res) => {
  const context = await requireOwnAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const invites = await prisma.albumInvite.findMany({
    where: {
      albumId: album.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return res.json({
    invites: invites.map((i) => ({
      id: i.id,
      token: i.token,
      url: buildInviteUrl(i.token),
      expiresAt: i.expiresAt.toISOString(),
      usedAt: i.usedAt ? i.usedAt.toISOString() : null,
      isValid: !i.usedAt && i.expiresAt > new Date(),
    })),
  });
}, { log: 'Error al listar invitaciones:', error: 'Error al obtener las invitaciones' }));

router.delete('/album/invites/:id', requireAuth, asyncHandler(async (req, res) => {
  const context = await requireOwnAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const invite = await prisma.albumInvite.findUnique({
    where: { id: req.params.id },
  });

  if (!invite || invite.albumId !== album.id) {
    return res.status(404).json({ error: 'Invitación no encontrada.' });
  }

  await prisma.albumInvite.delete({
    where: { id: req.params.id },
  });

  return res.json({ message: 'Invitación revocada con éxito.' });
}, { log: 'Error al revocar invitación:', error: 'Error al revocar la invitación' }));

router.get('/album/members', requireAuth, asyncHandler(async (req, res) => {
  const context = await requireOwnAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const members = await prisma.albumMember.findMany({
    where: { albumId: album.id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'desc' },
  });

  return res.json({ members });
}, { log: 'Error al listar miembros del álbum:', error: 'Error al listar los miembros' }));

router.delete('/album/members/:memberUserId', requireAuth, asyncHandler(async (req, res) => {
  const userId = authUserId(req);
  const context = await requireOwnAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const { memberUserId } = req.params;
  const removed = await prisma.albumMember.deleteMany({
    where: { albumId: album.id, userId: memberUserId },
  });

  // Issue #37 (feedback): avisar al invitado expulsado y revocar su acceso
  // de inmediato para que no pueda seguir viendo/cargando fotos. El frontend
  // detecta este 403 (accessRevoked) y lo expulsa del álbum al instante.
  if (removed.count > 0) {
    const removedUser = await prisma.user.findUnique({ where: { id: memberUserId } });
    if (removedUser) {
      await prisma.notification.create({
        data: {
          userId: memberUserId,
          albumId: album.id,
          actorUserId: userId,
          actorName: context.user.name,
          type: 'ACCESS_REVOKED',
          message: `Tu acceso al álbum "${album.title}" fue revocado por ${context.user.name}.`,
        },
      });
    }
  }

  return res.json({ message: 'Miembro revocado del álbum con éxito.' });
}, { log: 'Error al revocar miembro:', error: 'Error al revocar el miembro del álbum' }));

// -------------------------------------------------------------
// Issue #39: LOG DE INVITACIONES (aceptadas/rechazadas por otros = usadas,
// vencidas, revocadas) con fecha y fotos aportadas por cada invitado.
// -------------------------------------------------------------
router.get('/invites/log', requireAuth, asyncHandler(async (req, res) => {
  const context = await requireOwnAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const invites = await prisma.albumInvite.findMany({
    where: { albumId: album.id },
    include: { usedBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Fotos pegadas por cada invitado que aceptó, para el conteo del log
  const usedByIds = [...new Set(invites.map((i) => i.usedById).filter(Boolean))] as string[];
  const counts = usedByIds.length
    ? await prisma.sticker.groupBy({
        by: ['uploadedByUserId'],
        where: { albumId: album.id, uploadedByUserId: { in: usedByIds } },
        _count: { uploadedByUserId: true },
      })
    : [];
  const countByUser: Record<string, number> = {};
  for (const c of counts) countByUser[c.uploadedByUserId] = c._count.uploadedByUserId;

  const now = new Date();
  return res.json({
    log: invites.map((i) => {
      const status = i.usedAt ? 'accepted' : i.expiresAt <= now ? 'expired' : 'pending';
      return {
        id: i.id,
        token: i.token,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
        usedAt: i.usedAt ? i.usedAt.toISOString() : null,
        status,
        usedBy: i.usedBy,
        stickersAdded: i.usedById ? countByUser[i.usedById] || 0 : 0,
      };
    }),
  });
}, { log: 'Error al obtener el log de invitaciones:', error: 'Error al obtener el log de invitaciones' }));

// Vista previa del link (pública): quién invitó y a qué álbum
router.get('/invites/:token', asyncHandler(async (req, res) => {
  const invite = await prisma.albumInvite.findUnique({
    where: { token: req.params.token },
    include: { album: { include: { owner: true } } },
  });

  if (!invite) {
    return res.status(404).json({ error: 'La invitación no existe o fue revocada.' });
  }

  const expired = invite.expiresAt <= new Date();
  const used = !!invite.usedAt;

  return res.json({
    albumTitle: invite.album.title,
    ownerName: invite.album.owner.name,
    albumId: invite.album.id,
    expired,
    used,
    isValid: !expired && !used,
  });
}, { log: 'Error al consultar la invitación:', error: 'Error al consultar la invitación' }));

// Aceptar la invitación (requiere sesión): crea la membresía y quema el token
router.post('/invites/:token/accept', requireAuth, asyncHandler(async (req, res) => {
  const userId = authUserId(req);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });

  const invite = await prisma.albumInvite.findUnique({
    where: { token: req.params.token },
    include: { album: true },
  });

  if (!invite) {
    return res.status(404).json({ error: 'La invitación no existe o fue revocada.' });
  }
  if (invite.usedAt) {
    return res.status(409).json({ error: 'Esta invitación ya fue utilizada.' });
  }
  if (invite.expiresAt <= new Date()) {
    return res.status(410).json({ error: 'Esta invitación expiró. Pedí un nuevo link al dueño del álbum.' });
  }
  if (invite.album.ownerId === userId) {
    return res.status(400).json({ error: 'Ya sos el dueño de este álbum.' });
  }

  await prisma.$transaction([
    prisma.albumMember.upsert({
      where: { albumId_userId: { albumId: invite.albumId, userId } },
      create: { albumId: invite.albumId, userId, role: 'ASSOCIATE' },
      update: {},
    }),
    prisma.albumInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: userId },
    }),
  ]);

  // Issue #34: avisar al dueño del álbum que se sumó un asociado
  await notifyAlbumOwner({
    albumId: invite.albumId,
    actorId: userId,
    actorName: user.name,
    type: 'ASSOCIATE_JOINED',
    message: `${user.name} se unió como asociado a tu álbum "${invite.album.title}".`,
  });

  return res.json({
    message: `Te uniste como invitado al álbum "${invite.album.title}".`,
    album: { id: invite.album.id, title: invite.album.title, role: 'ASSOCIATE' },
  });
}, { log: 'Error al aceptar la invitación:', error: 'Error al aceptar la invitación' }));

export default router;
