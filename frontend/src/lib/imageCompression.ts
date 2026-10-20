/**
 * Compresión de fotos en el navegador antes de subirlas.
 *
 * Las fotos de celular pesan 3–5 MB y se envían dos veces (OCR y guardado de
 * la figurita), así que se reducen en el cliente con canvas (sin dependencias):
 * lado mayor de hasta 1280 px (las fotos chicas no se agrandan), orientación
 * EXIF aplicada y exportación JPEG calidad 0,8 como data URL base64. Una foto
 * típica queda en ~150–400 KB, con resolución de sobra para leer la patente.
 *
 * Si algo falla (navegador sin soporte, imagen corrupta...), se devuelve la
 * imagen original para no romper el flujo de carga.
 */

/** Lado mayor máximo (px) de la imagen comprimida. */
export const MAX_IMAGE_DIMENSION = 1280;

/** Calidad JPEG (0-1) usada al exportar. */
export const JPEG_QUALITY = 0.8;

/** Lee un archivo como data URL base64 (la imagen original, sin cambios). */
export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/** Fuente dibujable en canvas con sus dimensiones ya orientadas. */
interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decodifica la imagen aplicando la orientación EXIF. Usa createImageBitmap
 * con `imageOrientation: 'from-image'`; si no está disponible, cae a un <img>
 * (los navegadores actuales también aplican el EXIF al dibujar un <img>).
 */
async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Algunos navegadores no aceptan las opciones o el formato: se prueba con <img>
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
      img.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Comprime la foto y la devuelve como data URL JPEG base64. Ante cualquier
 * error, o si el resultado no es más liviano que el original, devuelve la
 * imagen original leída con FileReader.
 */
export async function compressImage(
  file: Blob,
  maxDimension: number = MAX_IMAGE_DIMENSION,
  quality: number = JPEG_QUALITY,
): Promise<string> {
  try {
    const decoded = await decodeImage(file);
    try {
      const { width, height } = decoded;
      if (!width || !height) throw new Error('Imagen sin dimensiones');

      // Solo se achica: una foto más chica que el límite conserva su tamaño
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D no disponible');

      // Fondo blanco: JPEG no tiene transparencia y un PNG transparente
      // quedaría con fondo negro.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (!dataUrl.startsWith('data:image/jpeg;base64,')) {
        throw new Error('El navegador no exportó JPEG');
      }

      // Si la "compresión" no ahorra nada (p. ej. un PNG chico), se envía el original
      const base64Bytes = ((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4;
      if (base64Bytes >= file.size) return await readFileAsDataURL(file);

      return dataUrl;
    } finally {
      decoded.release();
    }
  } catch (err) {
    console.warn('No se pudo comprimir la imagen, se envía la original:', err);
    return readFileAsDataURL(file);
  }
}
