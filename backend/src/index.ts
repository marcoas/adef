import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createWorker } from 'tesseract.js';
import { extractPlate } from './utils/plateExtractor';
import { recognizePlateALPR } from './services/alprService';
import { storeImage, deleteStoredImages, UPLOADS_DIR } from './services/images';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_patentes_2026_change_me';
// Issue #10: límites de carga de imágenes (solo JPG/PNG y tamaño máximo)
const MAX_IMAGE_SIZE_MB = parseInt(process.env.MAX_IMAGE_SIZE_MB || '5', 10);
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png'];

// Request autenticado: el userId se extrae del JWT en `requireAuth`
interface AuthedRequest extends Request {
  authUserId?: string;
  authEmail?: string;
}

// Middleware: exige un JWT válido (Authorization: Bearer <token>) para
// interactuar con el álbum (cargar / eliminar fotos) - Issue #6
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Debes iniciar sesión para interactuar con el álbum.' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { id?: string; email?: string };
    (req as AuthedRequest).authUserId = payload.id;
    (req as AuthedRequest).authEmail = payload.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión nuevamente.' });
  }
}

// Security & Middleware
app.use(helmet({
  // Issue #11: las imágenes del álbum se sirven desde el backend
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));

// Issue #11: servir archivos estáticos con caché de larga duración.
// Las imágenes son inmutables (nombre con hash aleatorio), por lo que se
// cachean agresivamente para no volver a descargarlas en cada visita.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '365d',
  immutable: true,
  fallthrough: true,
}));

// Helper: obtener (o crear) el ÚNICO álbum propio del usuario autenticado.
// Issue #8: las figuritas deben pertenecer al usuario que las subió, nunca
// al primer usuario de la base de datos (compartían todas las fotos).
async function getOrCreateUserAlbum(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  let album = await prisma.album.findFirst({ where: { ownerId: user.id } });
  if (!album) {
    album = await prisma.album.create({
      data: {
        title: `Álbum de ${user.name}`,
        ownerId: user.id,
      },
    });
  }

  return { user, album };
}

// Issue #8: resolver el álbum a operar. Sin `albumId` se usa el álbum propio.
// Con `albumId` solo se permite si el usuario es dueño o miembro invitado.
async function resolveAccessibleAlbum(req: Request, res: Response): Promise<{ user: any; album: any } | null> {
  const userId = (req as AuthedRequest).authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Sesión inválida: el token no identifica a un usuario.' });
    return null;
  }

  const albumIdParam = (req.query.albumId || req.body?.albumId) as string | undefined;

  if (albumIdParam) {
    const album = await prisma.album.findUnique({ where: { id: albumIdParam } });
    if (!album) {
      res.status(404).json({ error: 'Álbum no encontrado.' });
      return null;
    }

    if (album.ownerId !== userId) {
      const membership = await prisma.albumMember.findUnique({
        where: { albumId_userId: { albumId: album.id, userId } },
      });
      if (!membership) {
        res.status(403).json({ error: 'No tenés acceso a este álbum.' });
        return null;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(401).json({ error: 'Sesión inválida: el usuario ya no existe.' });
      return null;
    }
    return { user, album };
  }

  return getOrCreateUserAlbum(userId);
}

// Issue #34: avisar al DUEÑO del álbum cuando un asociado pega una figurita
// o se suma al álbum. Respeta la preferencia `notifyOnAlbumActivity` que se
// configura desde el panel de usuario. Nunca genera avisos para uno mismo.
async function notifyAlbumOwner(params: {
  albumId: string;
  actorId: string;
  actorName: string;
  type: 'STICKER_PASTED' | 'ASSOCIATE_JOINED';
  slotNumber?: number;
  rawPlate?: string;
  message: string;
}) {
  try {
    const album = await prisma.album.findUnique({
      where: { id: params.albumId },
      select: { ownerId: true },
    });
    if (!album || album.ownerId === params.actorId) return null;

    const owner = await prisma.user.findUnique({
      where: { id: album.ownerId },
      select: { notifyOnAlbumActivity: true },
    });
    if (!owner || !owner.notifyOnAlbumActivity) return null;

    return await prisma.notification.create({
      data: {
        userId: album.ownerId,
        albumId: params.albumId,
        actorUserId: params.actorId,
        actorName: params.actorName,
        type: params.type,
        slotNumber: params.slotNumber ?? null,
        rawPlate: params.rawPlate ?? null,
        message: params.message,
      },
    });
  } catch (error) {
    console.error('Error al crear la notificación de actividad del álbum:', error);
    return null;
  }
}

// -------------------------------------------------------------
// ENDPOINTS DE AUTENTICACIÓN
// -------------------------------------------------------------
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
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
          avatarUrl: userAvatar || user.avatarUrl 
        },
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user });
  } catch (error) {
    console.error('Error en auth login:', error);
    return res.status(500).json({ error: 'Error al autenticar' });
  }
});

// -------------------------------------------------------------
// RECONOCIMIENTO DE PATENTES CON ALPR / TESSERACT OCR
// -------------------------------------------------------------
app.post('/api/plates/ocr', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Se requiere la imagen en base64 para el OCR' });
    }

    const alprResult = await recognizePlateALPR(imageBase64);
    return res.json(alprResult);
  } catch (error) {
    console.error('Error en procesamiento OCR / ALPR:', error);
    return res.status(500).json({ error: 'Error al procesar la imagen con OCR/ALPR' });
  }
});

// Endpoint de prueba de Regex
app.post('/api/plates/parse', (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Se requiere el parámetro "text"' });
    }

    const result = extractPlate(text);
    return res.json(result);
  } catch (error) {
    console.error('Error al procesar la patente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// -------------------------------------------------------------
// OPERACIONES DE ÁLBUM & FIGURITAS EN POSTGRESQL
// -------------------------------------------------------------
app.get('/api/album', requireAuth, async (req: Request, res: Response) => {
  try {
    // Issue #8: cada usuario ve únicamente su propio álbum (o uno compartido
    // donde fue invitado). Ya no se devuelve el álbum del primer usuario.
    const context = await resolveAccessibleAlbum(req, res);
    if (!context) return;
    const { album } = context;

    const dbStickers = await prisma.sticker.findMany({
      where: { albumId: album.id },
      include: { uploadedBy: true },
    });

    const stickersMap: Record<number, any> = {};
    dbStickers.forEach((s) => {
      stickersMap[s.slotNumber] = {
        slotNumber: s.slotNumber,
        rawPlate: s.rawPlate,
        imageUrl: s.imageUrl,
        // Issue #11: la grilla usa la miniatura para no cargar fotos pesadas
        thumbnailUrl: s.thumbnailUrl,
        capturedAt: s.capturedAt.toISOString(),
        capturedBy: s.uploadedBy.name,
      };
    });

    const totalSlots = 1000;
    const collectedCount = dbStickers.length;

    return res.json({
      id: album.id,
      title: album.title,
      totalSlots,
      collectedCount,
      progressPercentage: ((collectedCount / totalSlots) * 100).toFixed(1),
      stickers: stickersMap,
    });
  } catch (error) {
    console.error('Error al obtener álbum desde DB:', error);
    return res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

app.post('/api/album/stickers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { plateText, imageUrl } = req.body;
    if (!plateText) {
      return res.status(400).json({ error: 'Se requiere el texto de la patente' });
    }

    // Issue #10: validar que la imagen sea JPG/PNG y no supere el tamaño máximo
    if (imageUrl) {
      if (/^data:/i.test(imageUrl)) {
        const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/i);
        const mime = mimeMatch ? mimeMatch[1].toLowerCase() : '';
        if (!ALLOWED_IMAGE_MIME.includes(mime)) {
          return res.status(415).json({
            error: 'Formato de imagen no permitido. Solo se aceptan JPG o PNG.',
          });
        }

        const base64Length = imageUrl.length - imageUrl.indexOf(',') - 1;
        const sizeMb = (base64Length * 3) / 4 / (1024 * 1024);
        if (sizeMb > MAX_IMAGE_SIZE_MB) {
          return res.status(413).json({
            error: `La imagen supera el tamaño máximo permitido (${MAX_IMAGE_SIZE_MB} MB).`,
          });
        }
      } else if (!/^https?:\/\//i.test(imageUrl)) {
        return res.status(400).json({ error: 'imageUrl inválida.' });
      }
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
      sticker: {
        slotNumber: newSticker.slotNumber,
        rawPlate: newSticker.rawPlate,
        imageUrl: newSticker.imageUrl,
        thumbnailUrl: newSticker.thumbnailUrl,
        capturedAt: newSticker.capturedAt.toISOString(),
        capturedBy: newSticker.uploadedBy.name,
      },
      plateResult,
    });
  } catch (error) {
    console.error('Error al guardar figurita en DB:', error);
    return res.status(500).json({ error: 'Error al escribir en PostgreSQL' });
  }
});

app.delete('/api/album/stickers/:slotNumber', requireAuth, async (req: Request, res: Response) => {
  try {
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
    if (album.ownerId !== (req as AuthedRequest).authUserId) {
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
  } catch (error) {
    console.error('Error al eliminar figurita:', error);
    return res.status(500).json({ error: 'Error al eliminar figurita de PostgreSQL' });
  }
});

// -------------------------------------------------------------
// Issue #33: LOG HISTÓRICO DE MOVIMIENTOS DEL ÁLBUM
// (quién y cuándo pegó o despegó cada figurita)
// -------------------------------------------------------------
app.get('/api/album/activity', requireAuth, async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error al consultar el log de movimientos:', error);
    return res.status(500).json({ error: 'Error al consultar el log de movimientos' });
  }
});

// -------------------------------------------------------------
// Issue #12: ÁLBUMES DEL USUARIO (propio + compartidos)
// -------------------------------------------------------------
app.get('/api/albums', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const context = await getOrCreateUserAlbum(userId);
    if (!context) return res.status(401).json({ error: 'Usuario no encontrado.' });
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
  } catch (error) {
    console.error('Error al obtener los álbumes del usuario:', error);
    return res.status(500).json({ error: 'Error al consultar los álbumes' });
  }
});


// -------------------------------------------------------------
// Issue #34: NOTIFICACIONES DE ACTIVIDAD DEL ÁLBUM
// -------------------------------------------------------------
app.get('/api/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
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
  } catch (error) {
    console.error('Error al obtener las notificaciones:', error);
    return res.status(500).json({ error: 'Error al obtener las notificaciones' });
  }
});

// Marcar notificaciones como leídas (todas o una lista de ids)
app.post('/api/notifications/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const ids: string[] = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id: unknown) => typeof id === 'string')
      : [];

    const where = ids.length > 0 ? { userId, id: { in: ids } } : { userId, readAt: null };

    const result = await prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });

    return res.json({ updated: result.count });
  } catch (error) {
    console.error('Error al marcar las notificaciones como leídas:', error);
    return res.status(500).json({ error: 'Error al actualizar las notificaciones' });
  }
});

// -------------------------------------------------------------
// Issue #34: PREFERENCIAS DEL USUARIO (recibir o no avisos)
// -------------------------------------------------------------
app.get('/api/users/me/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notifyOnAlbumActivity: true },
    });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });

    return res.json({ notifyOnAlbumActivity: user.notifyOnAlbumActivity });
  } catch (error) {
    console.error('Error al obtener las preferencias del usuario:', error);
    return res.status(500).json({ error: 'Error al obtener las preferencias' });
  }
});

app.put('/api/users/me/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const { notifyOnAlbumActivity } = req.body ?? {};

    if (typeof notifyOnAlbumActivity !== 'boolean') {
      return res.status(400).json({ error: 'El campo "notifyOnAlbumActivity" debe ser true o false.' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { notifyOnAlbumActivity },
      select: { notifyOnAlbumActivity: true },
    });

    return res.json({
      message: notifyOnAlbumActivity
        ? 'Volverás a recibir avisos cuando un asociado pegue una figurita.'
        : 'No volverás a recibir avisos de actividad del álbum.',
      notifyOnAlbumActivity: user.notifyOnAlbumActivity,
    });
  } catch (error) {
    console.error('Error al guardar las preferencias del usuario:', error);
    return res.status(500).json({ error: 'Error al guardar las preferencias' });
  }
});

// -------------------------------------------------------------
// Issue #12: INVITACIONES DE ASOCIADOS (links únicos de un solo uso)
// -------------------------------------------------------------
const INVITE_TTL_DAYS = 7;

function buildInviteUrl(token: string) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontendUrl.replace(/\/$/, '')}/invite/${token}`;
}

app.post(['/api/album/invites', '/api/invites'], requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const context = await getOrCreateUserAlbum(userId);
    if (!context) return res.status(401).json({ error: 'Usuario no encontrado.' });
    const { album } = context;

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await prisma.albumInvite.create({
      data: { token, albumId: album.id, createdById: userId, expiresAt },
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
  } catch (error) {
    console.error('Error al crear la invitación:', error);
    return res.status(500).json({ error: 'Error al crear el link de invitación' });
  }
});

app.get(['/api/album/invites', '/api/invites'], requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const context = await getOrCreateUserAlbum(userId);
    if (!context) return res.status(401).json({ error: 'Usuario no encontrado.' });
    const { album } = context;

    const invites = await prisma.albumInvite.findMany({
      where: { 
        albumId: album.id,
        usedAt: null,
        expiresAt: { gt: new Date() }
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
  } catch (error) {
    console.error('Error al listar invitaciones:', error);
    return res.status(500).json({ error: 'Error al obtener las invitaciones' });
  }
});

app.delete('/api/album/invites/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const context = await getOrCreateUserAlbum(userId);
    if (!context) return res.status(401).json({ error: 'Usuario no encontrado.' });
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
  } catch (error) {
    console.error('Error al revocar invitación:', error);
    return res.status(500).json({ error: 'Error al revocar la invitación' });
  }
});

app.get('/api/album/members', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const context = await getOrCreateUserAlbum(userId);
    if (!context) return res.status(401).json({ error: 'Usuario no encontrado.' });
    const { album } = context;

    const members = await prisma.albumMember.findMany({
      where: { albumId: album.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'desc' },
    });

    return res.json({ members });
  } catch (error) {
    console.error('Error al listar miembros del álbum:', error);
    return res.status(500).json({ error: 'Error al listar los miembros' });
  }
});

app.delete('/api/album/members/:memberUserId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
    const context = await getOrCreateUserAlbum(userId);
    if (!context) return res.status(401).json({ error: 'Usuario no encontrado.' });
    const { album } = context;

    const { memberUserId } = req.params;
    await prisma.albumMember.deleteMany({
      where: { albumId: album.id, userId: memberUserId },
    });

    return res.json({ message: 'Miembro revocado del álbum con éxito.' });
  } catch (error) {
    console.error('Error al revocar miembro:', error);
    return res.status(500).json({ error: 'Error al revocar el miembro del álbum' });
  }
});

// Vista previa del link (pública): quién invitó y a qué álbum
app.get('/api/invites/:token', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error al consultar la invitación:', error);
    return res.status(500).json({ error: 'Error al consultar la invitación' });
  }
});

// Aceptar la invitación (requiere sesión): crea la membresía y quema el token
app.post('/api/invites/:token/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).authUserId!;
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
  } catch (error) {
    console.error('Error al aceptar la invitación:', error);
    return res.status(500).json({ error: 'Error al aceptar la invitación' });
  }
});

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      status: 'online',
      database: 'connected (PostgreSQL)',
      usersInDb: userCount,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend conectado a PostgreSQL iniciado en puerto ${PORT}`);
});
