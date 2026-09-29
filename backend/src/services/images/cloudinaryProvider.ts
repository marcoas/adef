// -------------------------------------------------------------
// Proveedor Cloudinary (Issue #35)
// -------------------------------------------------------------
// Sube la foto original a Cloudinary (`CLOUDINARY_FOLDER`) y deriva la
// miniatura de la grilla como URL con transformaciones (w=320, formato
// automático) SIN subir un segundo archivo: una sola subida por figurita.
//
// `remove()` destruye por `public_id` extraído de la URL; las URLs que no
// son de Cloudinary se ignoran (fotos legacy en disco, Unsplash, etc).
// Nunca lanza: fallar borrando un archivo no debe romper el borrado de
// la figurita en la base de datos.

import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { ImageProvider, StoredImage } from './types';

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

/** `true` si hay credenciales suficientes para operar contra Cloudinary. */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

function configuredClient() {
  if (!isCloudinaryConfigured()) return null;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return cloudinary;
}

/** Extrae el `public_id` (con carpeta) de una URL de Cloudinary o `null`. */
function publicIdFromUrl(url: string): string | null {
  const match = url.match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(.+)$/i);
  if (!match) return null;
  // Miniaturas derivadas: quitar el segmento de transformacion
  // (ej: `w_320,c_scale/f_auto,q_auto/...`) que no es parte del public_id.
  let rest = match[1].replace(/^v\d+\//, '');
  const isTransformSegment = (seg: string) =>
    /^[a-zA-Z]+_[^/,]+(,[a-zA-Z]+_[^/,]+)*$/.test(seg);
  const parts = rest.split('/');
  while (parts.length > 1 && isTransformSegment(parts[0])) parts.shift();
  const withoutExt = parts.join('/').replace(/\.[a-z0-9]+$/i, '');
  if (!withoutExt || withoutExt.includes('..')) return null;
  return withoutExt;
}

export const cloudinaryProvider: ImageProvider = {
  name: 'cloudinary',

  async store(dataUrl: string): Promise<StoredImage | null> {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed || !MIME_EXTENSION[parsed.mime]) return null;

    const client = configuredClient();
    if (!client) {
      throw new Error(
        'Cloudinary no está configurado (faltan CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET).',
      );
    }

    const folder = process.env.CLOUDINARY_FOLDER || 'album-patentes';
    const publicId = crypto.randomBytes(12).toString('hex');

    const uploaded = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const stream = client.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            resource_type: 'image',
            overwrite: false,
          },
          (err, result) => {
            if (err || !result) reject(err || new Error('Subida a Cloudinary sin resultado.'));
            else resolve(result as { secure_url: string; public_id: string });
          },
        );
        stream.end(parsed.buffer);
      },
    );

    // Miniatura derivada por transformación (sin segunda subida ni costo extra
    // de almacenamiento): 320px de ancho como la miniatura WebP local.
    const thumbnailUrl = client.url(uploaded.public_id, {
      secure: true,
      transformation: [{ width: 320, crop: 'scale', fetch_format: 'auto', quality: 'auto' }],
    });

    return { imageUrl: uploaded.secure_url, thumbnailUrl };
  },

  async remove(...urls: (string | null | undefined)[]): Promise<void> {
    const client = configuredClient();
    if (!client) return; // Sin credenciales no hay nada propio que borrar
    for (const url of urls) {
      if (!url) continue;
      const publicId = publicIdFromUrl(url);
      if (!publicId) continue;
      try {
        await client.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (err) {
        console.error('No se pudo eliminar la imagen de Cloudinary', publicId, err);
      }
    }
  },
};
