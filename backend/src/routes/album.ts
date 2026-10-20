/**
 * Rutas del álbum y sus figuritas: grilla, alta/baja de figuritas #31,
 * log de movimientos #33, álbumes del usuario #12, abandono #37 y
 * ranking #40.
 */
import { Router } from 'express';
import { prisma } from '../db';
import { TOTAL_SLOTS } from '../config';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { authUserId } from '../types';
import { extractPlate } from '../utils/plateExtractor';
import { storeImage, deleteStoredImages } from '../services/images';
import {
  requireOwnAlbum,
  resolveAccessibleAlbum,
  serializeSticker,
  validateImageInput,
} from '../services/albumService';
import { notifyAlbumOwner } from '../services/notificationService';

const router = Router();

// -------------------------------------------------------------
// OPERACIONES DE ÁLBUM & FIGURITAS EN POSTGRESQL
// -------------------------------------------------------------
router.get('/album', requireAuth, asyncHandler(async (req, res) => {
  // Issue #8: cada usuario ve únicamente su propio álbum (o uno compartido
  // donde fue invitado). Ya no se devuelve el álbum del primer usuario.
  const context = await resolveAccessibleAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const dbStickers = await prisma.sticker.findMany({
    where: { albumId: album.id },
    include: { uploadedBy: true },
  });

  const stickersMap: Record<number, ReturnType<typeof serializeSticker>> = {};
  dbStickers.forEach((s) => {
    stickersMap[s.slotNumber] = serializeSticker(s);
  });

  const collectedCount = dbStickers.length;

  return res.json({
    id: album.id,
    title: album.title,
    totalSlots: TOTAL_SLOTS,
    collectedCount,
    progressPercentage: ((collectedCount / TOTAL_SLOTS) * 100).toFixed(1),
    stickers: stickersMap,
  });
}, { log: 'Error al obtener álbum desde DB:', error: 'Error al consultar la base de datos' }));

router.post('/album/stickers', requireAuth, asyncHandler(async (req, res) => {
  const { plateText, imageUrl } = req.body;
  if (!plateText) {
    return res.status(400).json({ error: 'Se requiere el texto de la patente' });
  }

  // Issue #10: validar que la imagen sea JPG/PNG y no supere el tamaño máximo
  if (imageUrl) {
    const invalid = validateImageInput(imageUrl);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });
  }

  const plateResult = extractPlate(plateText);
  if (!plateResult.isValid || plateResult.slotNumber === null) {
    return res.status(422).json({
      error: 'No se pudo extraer una patente válida de 3 dígitos (ej: AAA 000 o AA 000 AA).',
      plateResult,
    });
  }

  // Issue #8: la figurita se guarda en el álbum del usuario autenticado
  // (o en el compartido indicado), nunca en el de otro usuario.
  const context = await resolveAccessibleAlbum(req, res);
  if (!context) return;
  const { user, album } = context;
  const slot = plateResult.slotNumber;

  // Verificar unicidad en PostgreSQL DB
  const existingSticker = await prisma.sticker.findUnique({
    where: {
      albumId_slotNumber: {
        albumId: album.id,
        slotNumber: slot,
      },
    },
  });

  if (existingSticker) {
    return res.status(409).json({
      error: `El casillero #${plateResult.formattedSlot} ya tiene una figurita pegada en la base de datos PostgreSQL.`,
      existingSticker,
    });
  }

  // Issue #10 + #35: validar la imagen y guardarla con el proveedor activo
  // (Cloudinary o disco local según `IMAGE_PROVIDER`)
  let storedImage: { imageUrl: string; thumbnailUrl: string } | null = null;
  if (imageUrl && /^data:/i.test(imageUrl)) {
    try {
      storedImage = await storeImage(imageUrl, `${req.protocol}://${req.get('host')}`);
    } catch (err) {
      console.error('Error al almacenar la imagen:', err);
      return res.status(502).json({
        error: 'No se pudo guardar la imagen en el almacenamiento. Inténtalo de nuevo.',
      });
    }
    if (!storedImage) {
      return res.status(415).json({
        error: 'Formato de imagen no permitido. Solo se aceptan JPG o PNG.',
      });
    }
  }

  // Insertar figurita en PostgreSQL (Issue #33: junto con el log del movimiento)
  const [newSticker] = await prisma.$transaction([
    prisma.sticker.create({
      data: {
        albumId: album.id,
        slotNumber: slot,
        rawPlate: plateResult.formattedPlate,
        imageUrl: storedImage?.imageUrl || imageUrl || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60',
        thumbnailUrl: storedImage?.thumbnailUrl || null,
        uploadedByUserId: user.id,
      },
      include: { uploadedBy: true },
    }),
    prisma.stickerActivity.create({
      data: {
        albumId: album.id,
        userId: user.id,
        userName: user.name,
        slotNumber: slot,
        rawPlate: plateResult.formattedPlate,
        action: 'PASTE',
      },
    }),
  ]);

  // Issue #34: si quien pegó la figurita no es el dueño del álbum, avisarle.
  await notifyAlbumOwner({
    albumId: album.id,
    actorId: user.id,
    actorName: user.name,
    type: 'STICKER_PASTED',
    slotNumber: slot,
    rawPlate: newSticker.rawPlate,
    message: `${user.name} pegó la figurita #${plateResult.formattedSlot} (${newSticker.rawPlate}) en el álbum "${album.title}".`,
  });

  return res.status(201).json({
    message: `¡Figurita #${plateResult.formattedSlot} guardada en PostgreSQL con éxito!`,
    sticker: serializeSticker(newSticker),
    plateResult,
  });
}, { log: 'Error al guardar figurita en DB:', error: 'Error al escribir en PostgreSQL' }));

router.delete('/album/stickers/:slotNumber', requireAuth, asyncHandler(async (req, res) => {
  const slotNumber = parseInt(req.params.slotNumber, 10);
  if (isNaN(slotNumber)) {
    return res.status(400).json({ error: 'Número de casillero inválido' });
  }

  // Issue #8: solo se puede borrar del álbum propio o de uno compartido donde
  // el usuario es miembro invitado.
  const context = await resolveAccessibleAlbum(req, res);
  if (!context) return;
  const { user, album } = context;

  const existingSticker = await prisma.sticker.findUnique({
    where: {
      albumId_slotNumber: {
        albumId: album.id,
        slotNumber,
      },
    },
  });

  if (!existingSticker) {
    return res.status(404).json({ error: `No se encontró la figurita en el casillero #${slotNumber}` });
  }

  // Issue #12: los invitados pueden ver y cargar fotos, pero no eliminar.
  if (album.ownerId !== authUserId(req)) {
    return res.status(403).json({ error: 'Solo el dueño del álbum puede eliminar figuritas.' });
  }

  // Issue #33: registrar el despegue en el log y borrar la figurita
  await prisma.$transaction([
    prisma.sticker.delete({
      where: {
        albumId_slotNumber: {
          albumId: album.id,
          slotNumber,
        },
      },
    }),
    prisma.stickerActivity.create({
      data: {
        albumId: album.id,
        userId: user.id,
        userName: user.name,
        slotNumber,
        rawPlate: existingSticker.rawPlate,
        action: 'UNPASTE',
      },
    }),
  ]);

  // Issue #35: limpiar también las imágenes en el proveedor activo
  // (cada proveedor ignora las URLs que no le pertenecen)
  await deleteStoredImages(existingSticker.imageUrl, existingSticker.thumbnailUrl);

  return res.json({ message: `Figurita #${slotNumber} eliminada con éxito.` });
}, { log: 'Error al eliminar figurita:', error: 'Error al eliminar figurita de PostgreSQL' }));

// -------------------------------------------------------------
// Issue #33: LOG HISTÓRICO DE MOVIMIENTOS DEL ÁLBUM
// (quién y cuándo pegó o despegó cada figurita)
// -------------------------------------------------------------
router.get('/album/activity', requireAuth, asyncHandler(async (req, res) => {
  const context = await resolveAccessibleAlbum(req, res);
  if (!context) return;
  const { album } = context;

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '40'), 10) || 40, 1), 200);
  const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
  const actionParam = String(req.query.action ?? '').toUpperCase();

  const where: { albumId: string; action?: 'PASTE' | 'UNPASTE' } = { albumId: album.id };
  if (actionParam === 'PASTE' || actionParam === 'UNPASTE') {
    where.action = actionParam;
  }

  const [activities, total] = await Promise.all([
    prisma.stickerActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stickerActivity.count({ where }),
  ]);

  return res.json({
    album: { id: album.id, title: album.title },
    total,
    page,
    limit,
    hasMore: page * limit < total,
    activities: activities.map((a) => ({
      id: a.id,
      action: a.action,
      slotNumber: a.slotNumber,
      rawPlate: a.rawPlate,
      userName: a.userName,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}, { log: 'Error al consultar el log de movimientos:', error: 'Error al consultar el log de movimientos' }));

// -------------------------------------------------------------
// Issue #12: ÁLBUMES DEL USUARIO (propio + compartidos)
// -------------------------------------------------------------
router.get('/albums', requireAuth, asyncHandler(async (req, res) => {
  const userId = authUserId(req);
  const context = await requireOwnAlbum(req, res);
  if (!context) return;
  const { user, album } = context;

  const memberships = await prisma.albumMember.findMany({
    where: { userId },
    include: { album: { include: { _count: { select: { stickers: true } } } } },
  });

  const ownStickerCount = await prisma.sticker.count({ where: { albumId: album.id } });

  const albums = [
    { id: album.id, title: album.title, role: 'OWNER' as const, collectedCount: ownStickerCount },
    ...memberships
      .filter((m) => m.albumId !== album.id)
      .map((m) => ({
        id: m.album.id,
        title: m.album.title,
        role: m.role,
        collectedCount: m.album._count.stickers,
      })),
  ];

  return res.json({ albums, user: { id: user.id, name: user.name, email: user.email } });
}, { log: 'Error al obtener los álbumes del usuario:', error: 'Error al consultar los álbumes' }));

// Issue #37: un asociado puede desvincularse de un álbum compartido.
// El dueño no puede abandonar su propio álbum por esta vía.
router.delete('/albums/:albumId/leave', requireAuth, asyncHandler(async (req, res) => {
  const userId = authUserId(req);
  const { albumId } = req.params;

  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) {
    return res.status(404).json({ error: 'Álbum no encontrado.' });
  }
  if (album.ownerId === userId) {
    return res.status(400).json({ error: 'El dueño no puede abandonar su propio álbum.' });
  }

  const membership = await prisma.albumMember.findUnique({
    where: { albumId_userId: { albumId, userId } },
  });
  if (!membership) {
    return res.status(404).json({ error: 'No pertenecés a este álbum.' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  await prisma.albumMember.delete({ where: { id: membership.id } });

  // Issue #37: avisar al dueño que el asociado se desvinculó
  await notifyAlbumOwner({
    albumId,
    actorId: userId,
    actorName: user ? user.name : 'Un asociado',
    type: 'ASSOCIATE_LEFT',
    message: `${user ? user.name : 'Un asociado'} se desvinculó de tu álbum "${album.title}".`,
  });

  return res.json({ message: `Te desvinculaste del álbum "${album.title}".` });
}, { log: 'Error al desvincularse del álbum:', error: 'Error al desvincularse del álbum' }));

// -------------------------------------------------------------
// Issue #40: RANKING DE PEGATINAS por usuario (solo álbumes con asociados).
// Requiere ser dueño o miembro del álbum.
// -------------------------------------------------------------
router.get('/albums/:albumId/ranking', requireAuth, asyncHandler(async (req, res) => {
  const userId = authUserId(req);
  const { albumId } = req.params;

  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: { owner: { select: { id: true, name: true } }, members: { select: { userId: true } } },
  });
  if (!album) return res.status(404).json({ error: 'Álbum no encontrado.' });
  const isOwner = album.ownerId === userId;
  const isMember = album.members.some((m) => m.userId === userId);
  if (!isOwner && !isMember) {
    return res.status(403).json({ error: 'No tenés acceso a este álbum.' });
  }

  const memberCount = album.members.length + 1; // dueño + asociados
  const groups = await prisma.sticker.groupBy({
    by: ['uploadedByUserId'],
    where: { albumId },
    _count: { uploadedByUserId: true },
  });
  const uploaderIds = groups.map((g) => g.uploadedByUserId);
  const users = uploaderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true, avatarUrl: true },
      })
    : [];
  const nameById: Record<string, { name: string; avatarUrl?: string | null }> = {};
  for (const u of users) nameById[u.id] = { name: u.name, avatarUrl: u.avatarUrl };

  const ranking = groups
    .map((g) => ({
      userId: g.uploadedByUserId,
      name: nameById[g.uploadedByUserId]?.name || 'Usuario',
      avatarUrl: nameById[g.uploadedByUserId]?.avatarUrl || null,
      count: g._count.uploadedByUserId,
      isOwner: g.uploadedByUserId === album.ownerId,
    }))
    .sort((a, b) => b.count - a.count);

  return res.json({ albumId, albumTitle: album.title, memberCount, ranking });
}, { log: 'Error al obtener el ranking del álbum:', error: 'Error al obtener el ranking' }));

export default router;
