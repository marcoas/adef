'use client';

/**
 * Modal de captura y pegado de figuritas (#10, #53).
 * Acepta foto de cámara o archivo, valida tipo/tamaño, la comprime en el
 * navegador (lib/imageCompression: 1280 px, JPEG 0,8), reconoce la patente
 * con ALPR/OCR (POST /api/plates/ocr) sugiriendo el casillero, permite
 * corregirlo manualmente y confirma el pegado (POST /api/album/stickers)
 * en el álbum activo. Durante el OCR informa el casillero detectado al
 * padre (onPlateDetected) para que el álbum haga scroll hasta él (#53).
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useLocale } from '../lib/LocaleContext';
import { apiFetch, readJson, withAlbum } from '../lib/api';
import { extractSlot, extractSlotDigits, padSlot } from '../lib/format';
import { getToken } from '../lib/session';
import { compressImage } from '../lib/imageCompression';
import { Modal } from './Modal';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStickerAdded: (slotNumber: number, rawPlate: string, imageUrl: string) => void;
  targetSlot?: number | null;
  // Issue #12: álbum destino (compartido) al que se sube la figurita
  albumId?: string | null;
  // Issue #53: avisa el casillero que el OCR está detectando (o null si todavía
  // no hay patente legible) para que el álbum pueda desplazarse hasta él
  // mientras el popup sigue abierto, antes de que el usuario confirme.
  onPlateDetected?: (slotNumber: number | null) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onStickerAdded,
  targetSlot = null,
  albumId = null,
  onPlateDetected,
}) => {
  const { t } = useLocale();
  const [plateInput, setPlateInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);
  // Identifica la foto en curso: si el usuario cierra o cambia la foto mientras
  // se comprime, el resultado de la compresión anterior se descarta.
  const uploadIdRef = useRef(0);

  // Issue #53: en cuanto el OCR entrega una patente con 3 dígitos se informa el
  // casillero correspondiente para que el álbum se desplace hasta él mientras el
  // popup sigue abierto. Si la patente cambia o se limpia, se informa null.
  useEffect(() => {
    if (!onPlateDetected) return;
    onPlateDetected(extractSlot(plateInput));
  }, [plateInput, onPlateDetected]);

  // Issue #10: solo se aceptan imágenes JPG o PNG y de hasta 5 MB
  const MAX_FILE_SIZE_MB = 5;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

  if (!isOpen) return null;

  const handleClose = () => {
    uploadIdRef.current += 1;
    setImagePreview(null);
    setPlateInput('');
    setErrorMsg(null);
    setIsProcessingOCR(false);
    onClose();
  };

  const handleResetPhoto = () => {
    uploadIdRef.current += 1;
    setImagePreview(null);
    setPlateInput('');
    setErrorMsg(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Issue #10: validar tipo (JPG/PNG) y tamaño antes de procesar
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Formato no permitido. Solo se aceptan imágenes JPG o PNG.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMsg(`La imagen supera el tamaño máximo permitido (${MAX_FILE_SIZE_MB} MB).`);
      e.target.value = '';
      return;
    }

    setErrorMsg(null);
    setIsProcessingOCR(true);

    // Se comprime una sola vez en el navegador (lado mayor 1280 px, JPEG 0,8)
    // y esa misma imagen se usa para el preview, el OCR y el guardado de la
    // figurita: evita subir dos veces la foto original de 3–5 MB.
    const uploadId = ++uploadIdRef.current;
    const compressedImage = await compressImage(file);
    if (uploadId !== uploadIdRef.current) return;
    setImagePreview(compressedImage);
    runRealOCR(compressedImage);
  };

  const runRealOCR = async (imageBase64: string) => {
    setIsProcessingOCR(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/plates/ocr', { method: 'POST', json: { imageBase64 } });

      if (!res.ok) {
        // OCR no disponible (503: sin token, API caída o cuota mensual agotada):
        // se muestra el mensaje del backend, que sugiere cargar la patente a mano.
        const errData = await readJson(res);
        setErrorMsg(errData.error || 'No se pudo procesar la foto con OCR. Volvé a capturar la foto o probá otra imagen.');
        return;
      }

      const data = await res.json();
      if (data.plateResult && data.plateResult.formattedPlate) {
        setPlateInput(data.plateResult.formattedPlate);
      } else if (data.ocrText) {
        setPlateInput(data.ocrText.toUpperCase());
      }
    } catch (err) {
      console.warn('Fallback OCR error:', err);
      setErrorMsg('No se pudo procesar la foto con OCR. Volvé a capturar la foto o probá otra imagen.');
    } finally {
      setIsProcessingOCR(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!plateInput) {
      setErrorMsg('No se detectó ninguna patente en la foto. Volvé a capturar la imagen.');
      return;
    }

    const slotDigits = extractSlotDigits(plateInput);
    if (!slotDigits) {
      setErrorMsg('No se detectaron 3 dígitos numéricos (ej: AI 440 SA o ABC 123).');
      return;
    }

    const slotNumber = parseInt(slotDigits, 10);

    // Validación según el Issue #4: si viene de un casillero específico, la patente leída debe coincidir
    if (targetSlot !== null && targetSlot !== undefined && slotNumber !== targetSlot) {
      const formattedTarget = padSlot(targetSlot);
      setErrorMsg(`La patente ingresada/leída (#${slotDigits}) no corresponde al casillero #${formattedTarget} seleccionado. Carga anulada.`);
      return;
    }
    const mockImage = imagePreview || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60';

    // Issue #6: exige sesión previa para cargar fotos (también validado en backend)
    if (!getToken()) {
      setErrorMsg('Debes iniciar sesión antes de cargar fotos al álbum.');
      return;
    }

    try {
      // Issue #12: si se está viendo un álbum compartido, la figurita va a ese álbum
      const response = await apiFetch(withAlbum('/album/stickers', albumId), {
        method: 'POST',
        json: { plateText: plateInput, imageUrl: mockImage },
      });

      if (response.status === 401) {
        setErrorMsg('Tu sesión expiró o no es válida. Inicia sesión nuevamente para cargar fotos.');
        return;
      }

      if (response.status === 409) {
        const errData = await readJson(response);
        setErrorMsg(errData.error || `El casillero #${slotNumber} ya posee una figurita pegada.`);
        return;
      }

      // Cualquier otro rechazo (formato/tamaño de imagen, acceso revocado,
      // patente inválida...) se informa en vez de pegar la figurita solo en la UI
      if (!response.ok) {
        const errData = await readJson(response);
        setErrorMsg(errData.error || 'No se pudo guardar la figurita. Reintenta en unos segundos.');
        return;
      }
    } catch (err) {
      console.error('Error al guardar en PostgreSQL:', err);
      setErrorMsg('No se pudo guardar la figurita. Reintenta en unos segundos.');
      return;
    }

    onStickerAdded(slotNumber, plateInput.toUpperCase(), mockImage);
    handleClose();
  };

  return (
    <Modal onClose={handleClose} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{t.uploadButton}</h2>
          <button className="close-btn" onClick={handleClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <span>Foto de la patente</span>
              </label>

              {imagePreview && (
                <button 
                  type="button" 
                  onClick={handleResetPhoto}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={14} />
                  <span>Cambiar foto</span>
                </button>
              )}
            </div>
            
            <div 
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                position: 'relative',
              }}
            >
              {imagePreview ? (
                <div>
                  {/* Visor simple de la foto capturada (Issue #49: sin recuadro ni rotación) */}
                  <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', maxHeight: '240px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <img 
                      ref={imageRef}
                      src={imagePreview} 
                      alt="Patente capturada" 
                      style={{ 
                        maxHeight: '240px', 
                        maxWidth: '100%',
                        objectFit: 'contain' 
                      }} 
                    />
                  </div>

                  {isProcessingOCR && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,0.75)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      color: 'var(--accent-cyan)',
                      fontWeight: 'bold',
                      borderRadius: '8px',
                    }}>
                      <Loader2 className="animate-spin" size={24} />
                      <span>{t.processingOCR}</span>
                    </div>
                  )}
                </div>
              ) : (
                <label style={{ cursor: 'pointer', display: 'block', padding: '1rem 0' }}>
                  <Upload size={32} style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Haz clic para seleccionar o tomar foto de la patente
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Formatos: JPG o PNG · Máximo {MAX_FILE_SIZE_MB} MB
                  </p>
                  <input 
                    type="file" 
                    accept="image/jpeg,image/png" 
                    onChange={handleImageUpload} 
                    style={{ display: 'none' }} 
                  />
                </label>
              )}
            </div>
          </div>

          {/* Input de Patente - Issue #9: readonly, el valor proviene del OCR.
              Issue #52: label e input unificados en un solo renglón. */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label 
                htmlFor="plate-input"
                style={{ 
                  fontWeight: 600, 
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {t.plateInputLabel}
              </label>
              <input 
                id="plate-input"
                type="text" 
                className="search-input" 
                placeholder="Procesando foto con OCR..."
                value={plateInput}
                readOnly
                aria-readonly="true"
                tabIndex={-1}
                style={{ 
                  flex: 1,
                  minWidth: 0,
                  paddingLeft: '1rem', 
                  textTransform: 'uppercase', 
                  fontFamily: 'Space Mono', 
                  fontSize: '1.1rem', 
                  letterSpacing: '1px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px dashed var(--border-color)',
                  color: plateInput ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'default',
                }}
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              {plateInput
                ? <>Patente detectada automáticamente. Casillero asignado: <strong>#{extractSlotDigits(plateInput) || '___'}</strong></>
                : 'La patente se completa automáticamente al procesar la foto con OCR.'}
            </p>
          </div>

          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#EF4444', marginBottom: '1rem', fontSize: '0.875rem' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={handleClose} 
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {t.cancel}
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <CheckCircle size={18} />
              <span>{t.pasteSticker}</span>
            </button>
          </div>
        </form>
    </Modal>
  );
};
