import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ImageProvider, StoreContext, StoredImage } from './types';

// -------------------------------------------------------------
// Proveedor local: disco del backend (Issue #11, behavior original)
// -------------------------------------------------------------
// Fotos en `backend/src/uploads/` (+ miniatura WebP 320px con sharp),
// servidas por Express vía `app.use('/uploads', express.static(...))`.
// Nombres con hash aleatorio -> URL inmutable y cacheable.

export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
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

export const localProvider: ImageProvider = {
  name: 'local',

  async store(dataUrl: string, ctx: StoreContext): Promise<StoredImage | null> {
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
      return { imageUrl: `${ctx.baseUrl}/uploads/${fileName}`, thumbnailUrl: '' };
    }

    return {
      imageUrl: `${ctx.baseUrl}/uploads/${fileName}`,
      thumbnailUrl: `${ctx.baseUrl}/uploads/thumbs/${thumbName}`,
    };
  },

  remove(...urls: (string | null | undefined)[]) {
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
    return Promise.resolve();
  },
};