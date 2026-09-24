/**
 * Sistema de Internacionalización (i18n) para el Álbum de Patentes.
 * Idioma predeterminado: Español ('es').
 */

export type Locale = 'es' | 'en';

export const translations = {
  es: {
    appTitle: 'Álbum de Patentes',
    appSubtitle: 'Colección de patentes (000 - 999)',
    searchPlaceholder: 'Buscar casillero (ej: 042)...',
    filterAll: 'Todas (1000)',
    filterCollected: 'Pegadas',
    filterMissing: 'Faltantes',
    progressTitle: 'Progreso del Álbum',
    collected: 'Pegadas',
    total: 'Total',
    uploadButton: 'Capturar Patente',
    pasteSticker: 'Pegar Figurita',
    scanOCR: 'Escanear con OCR',
    plateInputLabel: 'Número de Patente',
    plateInputHelp: 'Formatos aceptados: AAA 000 o AA 000 AA',
    uploadSuccess: '¡Figurita pegada con éxito en el casillero #',
    slotLabel: 'Casillero',
    emptySlot: 'Casillero Vacío',
    capturedBy: 'Capturada por',
    capturedAt: 'Fecha de captura',
    close: 'Cerrar',
    cancel: 'Cancelar',
    save: 'Guardar',
    processingOCR: 'Reconociendo patente con IA/OCR...',
    invitePartner: 'Invitar Asociado',
    associateTag: 'Álbum Compartido',
  },
  en: {
    appTitle: 'License Plate Album',
    appSubtitle: 'License plate sticker collection (000 - 999)',
    searchPlaceholder: 'Search slot (e.g. 042)...',
    filterAll: 'All (1000)',
    filterCollected: 'Stuck',
    filterMissing: 'Missing',
    progressTitle: 'Album Progress',
    collected: 'Collected',
    total: 'Total',
    uploadButton: 'Capture License Plate',
    pasteSticker: 'Paste Sticker',
    scanOCR: 'Scan with OCR',
    plateInputLabel: 'Plate Number',
    plateInputHelp: 'Accepted formats: AAA 000 or AA 000 AA',
    uploadSuccess: 'Sticker successfully pasted into slot #',
    slotLabel: 'Slot',
    emptySlot: 'Empty Slot',
    capturedBy: 'Captured by',
    capturedAt: 'Capture date',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    processingOCR: 'Recognizing plate with AI/OCR...',
    invitePartner: 'Invite Partner',
    associateTag: 'Shared Album',
  },
};

export function getTranslation(locale: Locale = 'es') {
  return translations[locale] || translations.es;
}
