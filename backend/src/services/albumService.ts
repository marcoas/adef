/**
 * Reglas de acceso al álbum y helpers de figuritas compartidos por las rutas.
 */
import { Request, Response } from 'express';
import { Album, Sticker, User } from '@prisma/client';
import { prisma } from '../db';
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_SIZE_MB } from '../config';
import { AuthedRequest } from '../types';

export interface AlbumContext {
  user: User;
  album: Album;
}

// Helper: obtener (o crear) el ÚNICO álbum propio del usuario autenticado.
// Issue #8: las figuritas deben pertenecer al usuario que las subió, nunca
// al primer usuario de la base de datos (compartían todas las fotos).
export async function getOrCreateUserAlbum(userId: string): Promise<AlbumContext | null> {
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

// Igual que getOrCreateUserAlbum pero responde 401 si el usuario ya no existe.
// Devuelve null cuando ya se respondió al cliente.
export async function requireOwnAlbum(req: Request, res: Response): Promise<AlbumContext | null> {
  const context = await getOrCreateUserAlbum((req as AuthedRequest).authUserId!);
  if (!context) {
    res.status(401).json({ error: 'Usuario no encontrado.' });
    return null;
  }
  return context;
}

// Issue #8: resolver el álbum a operar. Sin `albumId` se usa el álbum propio.
// Con `albumId` solo se permite si el usuario es dueño o miembro invitado.
export async function resolveAccessibleAlbum(req: Request, res: Response): Promise<AlbumContext | null> {
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
        // Issue #37 (feedback): acceso revocado mientras el invitado tenía el
        // álbum abierto → 403 con flag para que el frontend lo expulse al instante.
        res.status(403).json({ error: 'Tu acceso a este álbum fue revocado por el dueño.', accessRevoked: true });
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

/** Forma pública de una figurita (grilla del álbum y respuesta de alta). */
export function serializeSticker(s: Sticker & { uploadedBy: { name: string } }) {
  return {
    slotNumber: s.slotNumber,
    rawPlate: s.rawPlate,
    imageUrl: s.imageUrl,
    // Issue #11: la grilla usa la miniatura para no cargar fotos pesadas
    thumbnailUrl: s.thumbnailUrl,
    capturedAt: s.capturedAt.toISOString(),
    capturedBy: s.uploadedBy.name,
  };
}

/**
 * Issue #10: valida que la imagen sea un data URL JPG/PNG dentro del tamaño
 * máximo, o una URL http(s). Devuelve `null` si es válida o el status y
 * mensaje de error a responder.
 */
export function validateImageInput(imageUrl: string): { status: number; error: string } | null {
  if (/^data:/i.test(imageUrl)) {
    const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/i);
    const mime = mimeMatch ? mimeMatch[1].toLowerCase() : '';
    if (!ALLOWED_IMAGE_MIME.includes(mime)) {
      return { status: 415, error: 'Formato de imagen no permitido. Solo se aceptan JPG o PNG.' };
    }

    const base64Length = imageUrl.length - imageUrl.indexOf(',') - 1;
    const sizeMb = (base64Length * 3) / 4 / (1024 * 1024);
    if (sizeMb > MAX_IMAGE_SIZE_MB) {
      return { status: 413, error: `La imagen supera el tamaño máximo permitido (${MAX_IMAGE_SIZE_MB} MB).` };
    }
  } else if (!/^https?:\/\//i.test(imageUrl)) {
    return { status: 400, error: 'imageUrl inválida.' };
  }
  return null;
}
