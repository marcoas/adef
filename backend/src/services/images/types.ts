// -------------------------------------------------------------
// Capa de abstracción de almacenamiento de imágenes (Issue #35)
// -------------------------------------------------------------
// Objetivo: poder cambiar de proveedor (disco local → Cloudinary →
// cualquier otro) tocando únicamente una implementación nueva +
// una variable de entorno, sin modificar la lógica de negocio
// (endpoints, reglas de validación, miniaturas para la grilla, etc).

/**
 * Imagen ya persistida por un proveedor. `imageUrl` es la foto original y
 * `thumbnailUrl` una versión liviana para la grilla (puede quedar vacía si
 * el proveedor no pudo generarla; el frontend hace fallback a `imageUrl`).
 */
export interface StoredImage {
  imageUrl: string;
  thumbnailUrl: string;
}

/** Contexto opcional que los proveedores pueden necesitar (ej: baseUrl local). */
export interface StoreContext {
  /** Origen del API (ej: http://localhost:4000), usado por el proveedor local. */
  baseUrl: string;
}

export interface ImageProvider {
  /** Identificador corto para logs (ej: 'local', 'cloudinary'). */
  readonly name: string;
  /**
   * Sube una imagen recibida como data URL (JPG/PNG validados por el caller)
   * y devuelve las URLs públicas. `null` si la data URL no es válida.
   * Debe lanzar/propagar errores para que la fachada pueda aplicar fallbacks.
   */
  store(dataUrl: string, ctx: StoreContext): Promise<StoredImage | null>;
  /**
   * Elimina la imagen asociada a una URL si le pertenece a este proveedor.
   * Las URLs que no reconoce deben ignorarse silenciosamente (p. ej. fotos
   * de Unsplash usadas como fallback o imágenes de otro proveedor).
   */
  remove(...urls: (string | null | undefined)[]): Promise<void>;
}