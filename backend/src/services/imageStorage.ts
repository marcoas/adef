import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// -------------------------------------------------------------
// Issue #11: almacenamiento de imágenes en disco + miniaturas
// -------------------------------------------------------------
// Las fotos ya no se guardan como data URL dentro de PostgreSQL (lo que
// inflaba la respuesta del álbum). Se almacenan como archivos y la grilla
// consume miniaturas ligeras (WebP 320px), mientras el detalle usa la
// imagen original. Nombres con hash aleatorio -> URL inmutable y cacheable.
export const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');
const THUMB_WIDTH = 320;

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/is);
  if (!match) return null;
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

/**
 * Guarda la imagen recibida (data URL JPG/PNG) y genera su miniatura.
 * Devuelve las URLs públicas o `null` si la imagen no es un data URL válido.
 */
export async function storeImage(
  dataUrl: string,
  baseUrl: string,
): Promise<{ imageUrl: string; thumbnailUrl: string } | null> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !MIME_EXTENSION[parsed.mime]) return null;

  const id = crypto.randomBytes(12).toString('hex');
  const ext = MIME_EXTENSION[parsed.mime];
  const fileName = `${id}.${ext}`;
  const thumbName = `${id}.webp`;

  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), parsed.buffer);

  // Miniatura liviana para la grilla (fallback: la original si sharp falla)
  try {
    const sharp = (await import('sharp')).default;
    await sharp(parsed.buffer)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(path.join(THUMBS_DIR, thumbName));
  } catch (err) {
    console.error('No se pudo generar la miniatura, se usará la imagen original:', err);
    return { imageUrl: `${baseUrl}/uploads/${fileName}`, thumbnailUrl: '' };
  }

  return {
    imageUrl: `${baseUrl}/uploads/${fileName}`,
    thumbnailUrl: `${baseUrl}/uploads/thumbs/${thumbName}`,
  };
}

/** Borra la imagen y su miniatura del disco si eran locales. */
export function deleteStoredImages(...urls: (string | null | undefined)[]) {
  for (const url of urls) {
    if (!url) continue;
    const marker = '/uploads/';
    const idx = url.indexOf(marker);
    if (idx === -1) continue;

    const relative = url.slice(idx + marker.length);
    if (relative.includes('..')) continue;

    const target = path.join(UPLOADS_DIR, relative);
    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch (err) {
        console.error('No se pudo eliminar el archivo', target, err);
      }
    }
  }
}