/**
 * Utilidad Avanzada de Reconocimiento y Formateo de Patentes.
 * 
 * Formatos Oficiales Soportados:
 * 1. Modelo Estándar Mercosur (AA 000 AA): 2 letras + 3 números + 2 letras (ej: AI 440 SA)
 * 2. Modelo Tradicional (AAA 000): 3 letras + 3 números (ej: ABC 123)
 */

export interface PlateResult {
  isValid: boolean;
  rawPlate: string;
  formattedPlate: string;
  model: 'ANTIGUO' | 'MERCOSUR' | 'DESCONOCIDO';
  slotNumber: number | null; // Rango 0 a 999
  formattedSlot: string | null; // e.g. "440"
}

/**
 * Normaliza el texto de la patente eliminando caracteres especiales y saltos de línea.
 */
function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae y da formato completo a una patente de automóvil (Mercosur o Antiguo)
 */
export function extractPlate(text: string): PlateResult {
  const normalized = normalizeText(text);

  // 1. Patrón Mercosur: 2 Letras + 3 Números + 2 Letras (ej: AI440SA -> AI 440 SA)
  // Se crea una nueva instancia de RegExp en cada llamada para evitar problemas con lastIndex en estado global
  const mercosurRegex = /([A-Z0-9]{2})\s*(\d{3})\s*([A-Z0-9]{2})/i;
  const mercosurMatch = normalized.match(mercosurRegex);

  if (mercosurMatch) {
    // Reemplazar confusiones OCR habituales (1 -> I, 0 -> O en posiciones de letras)
    const letters1 = mercosurMatch[1].replace(/1/g, 'I').replace(/0/g, 'O');
    const digits = mercosurMatch[2];
    const letters2 = mercosurMatch[3].replace(/1/g, 'I').replace(/0/g, 'O');
    const slot = parseInt(digits, 10);

    if (slot >= 0 && slot <= 999) {
      return {
        isValid: true,
        rawPlate: text,
        formattedPlate: `${letters1} ${digits} ${letters2}`,
        model: 'MERCOSUR',
        slotNumber: slot,
        formattedSlot: digits,
      };
    }
  }

  // 2. Patrón Antiguo: 3 Letras + 3 Números (ej: ABC123 -> ABC 123)
  const oldRegex = /([A-Z0-9]{3})\s*(\d{3})/i;
  const oldMatch = normalized.match(oldRegex);

  if (oldMatch) {
    const letters = oldMatch[1].replace(/1/g, 'I').replace(/0/g, 'O');
    const digits = oldMatch[2];
    const slot = parseInt(digits, 10);

    if (slot >= 0 && slot <= 999) {
      return {
        isValid: true,
        rawPlate: text,
        formattedPlate: `${letters} ${digits}`,
        model: 'ANTIGUO',
        slotNumber: slot,
        formattedSlot: digits,
      };
    }
  }

  // 3. Fallback: Si solo se encuentran 3 dígitos numéricos
  const digitMatches = normalized.match(/\b\d{3}\b/) || normalized.match(/\d{3}/);
  if (digitMatches) {
    const digits = digitMatches[0];
    const slot = parseInt(digits, 10);

    return {
      isValid: true,
      rawPlate: text,
      formattedPlate: `PATENTE ${digits}`,
      model: 'DESCONOCIDO',
      slotNumber: slot,
      formattedSlot: digits,
    };
  }

  return {
    isValid: false,
    rawPlate: text,
    formattedPlate: normalized,
    model: 'DESCONOCIDO',
    slotNumber: null,
    formattedSlot: null,
  };
}


