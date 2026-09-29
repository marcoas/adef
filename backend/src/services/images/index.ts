// -------------------------------------------------------------
// Fachada + factoría de proveedores de imágenes (Issue #35)
// -------------------------------------------------------------
// La lógica de negocio (endpoints) SIEMPRE usa `storeImage` /
// `deleteStoredImages` de aquí y nunca un proveedor concreto.
//
// - `IMAGE_PROVIDER=cloudinary` (con credenciales) → Cloudinary.
// - Cualquier otro valor o falta de credenciales → disco local
//   (con aviso en logs si se pidió Cloudinary sin configurarlo).
// - El borrado se propaga a TODOS los proveedores: cada uno ignora las
//   URLs ajenas, así la DB puede mezclar fotos legacy locales con nuevas
//   en la nube durante/ap después de la migración.
//
// Para sumar un proveedor futuro (S3, R2, Supabase Storage...):
// 1. Crear `miProveedor.ts` que implemente `ImageProvider`.
// 2. Registrarlo en `allProviders` y en `getImageProvider()`.
// 3. Nada más: ningún endpoint cambia.

import { ImageProvider, StoreContext, StoredImage } from './types';
import { localProvider, UPLOADS_DIR } from './localProvider';
import { cloudinaryProvider, isCloudinaryConfigured } from './cloudinaryProvider';

export { UPLOADS_DIR };
export type { StoredImage, ImageProvider, StoreContext } from './types';

const allProviders: ImageProvider[] = [cloudinaryProvider, localProvider];

/** Resuelve el proveedor activo según `IMAGE_PROVIDER` y credenciales. */
export function getImageProvider(): ImageProvider {
  const wanted = (process.env.IMAGE_PROVIDER || '').trim().toLowerCase();
  if (wanted === 'cloudinary') {
    if (isCloudinaryConfigured()) return cloudinaryProvider;
    console.warn(
      '[images] IMAGE_PROVIDER=cloudinary pero faltan CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET; usando almacenamiento local.',
    );
  } else if (wanted && wanted !== 'local') {
    console.warn(`[images] IMAGE_PROVIDER="${wanted}" desconocido; usando almacenamiento local.`);
  }
  return localProvider;
}

/**
 * Guarda la imagen (data URL JPG/PNG) con el proveedor activo.
 * Devuelve URLs públicas o `null` si no es un data URL válido.
 * Lanza si el proveedor activo falla (el endpoint responde 5xx y la
 * figurita NO se crea, evitando registros con imagen rota).
 */
export function storeImage(dataUrl: string, baseUrl: string): Promise<StoredImage | null> {
  const ctx: StoreContext = { baseUrl };
  return getImageProvider().store(dataUrl, ctx);
}

/**
 * Borra las imágenes en TODOS los proveedores (cada uno ignora las URLs
 * ajenas). Nunca lanza: los errores ya se loguean en cada proveedor.
 */
export async function deleteStoredImages(
  ...urls: (string | null | undefined)[]
): Promise<void> {
  await Promise.all(
    allProviders.map((provider) =>
      provider.remove(...urls).catch((err) => {
        console.error(`[images] Error borrando en proveedor ${provider.name}:`, err);
      }),
    ),
  );
}
