/**
 * Avisos de actividad del álbum (Issue #34).
 */
import { prisma } from '../db';

// Issue #34: avisar al DUEÑO del álbum cuando un asociado pega una figurita
// o se suma al álbum. Respeta la preferencia `notifyOnAlbumActivity` que se
// configura desde el panel de usuario. Nunca genera avisos para uno mismo.
export async function notifyAlbumOwner(params: {
  albumId: string;
  actorId: string;
  actorName: string;
  type: 'STICKER_PASTED' | 'ASSOCIATE_JOINED' | 'ASSOCIATE_LEFT' | 'ACCESS_REVOKED';
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
