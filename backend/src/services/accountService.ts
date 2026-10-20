/**
 * Baja de cuentas (Issues #41 y #54).
 */
import { prisma } from '../db';
import { deleteStoredImages } from './images';

/**
 * Baja definitiva de una cuenta. La comparten la autoeliminación del propio
 * usuario (Issue #54) y la baja desde el panel de administración (Issue #41).
 *
 * Flujo:
 *   1. Recopila las URLs de imagen de las figuritas pegadas POR el usuario
 *      (en cualquier álbum) y de todas las figuritas de sus álbumes.
 *   2. Borra esas imágenes del disco/Cloudinary (best effort: un fallo aquí
 *      no interrumpe la baja; solo se loguea).
 *   3. Elimina el usuario en BD: los `onDelete: Cascade` del schema borran
 *      su álbum (y con él sus figuritas, miembros e invitaciones), sus
 *      membresías en álbumes ajenos, sus notificaciones y sus invitaciones.
 *      El log de movimientos conserva `userName` por snapshot (userId → null)
 *      y los invites usados quedan con usedBy en null (SetNull).
 *
 * @param targetId id del usuario a eliminar
 * @returns el email del usuario eliminado, o `null` si la cuenta no existe
 */
export async function deleteAccountCascade(targetId: string): Promise<{ email: string } | null> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { stickers: { select: { imageUrl: true, thumbnailUrl: true } } },
  });
  if (!target) return null;

  // Imágenes de las figuritas pegadas POR este usuario (en cualquier álbum)
  const imageUrls: (string | null | undefined)[] = target.stickers.flatMap((s) => [
    s.imageUrl,
    s.thumbnailUrl,
  ]);
  // Imágenes de todas las figuritas de sus álbumes (pegadas por cualquier miembro)
  const ownedAlbumIds = await prisma.album.findMany({
    where: { ownerId: targetId },
    select: { id: true },
  });
  if (ownedAlbumIds.length > 0) {
    const albumStickers = await prisma.sticker.findMany({
      where: { albumId: { in: ownedAlbumIds.map((a) => a.id) } },
      select: { imageUrl: true, thumbnailUrl: true },
    });
    imageUrls.push(...albumStickers.flatMap((s) => [s.imageUrl, s.thumbnailUrl]));
  }
  await deleteStoredImages(...imageUrls);

  await prisma.user.delete({ where: { id: targetId } });
  return { email: target.email };
}
