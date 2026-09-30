'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  onStickerAdded: (slotNumber: number, rawPlate: string, imageUrl: string) => void;
  targetSlot?: number | null;
  // Issue #12: álbum destino (compartido) al que se sube la figurita
  albumId?: string | null;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  locale,
  onStickerAdded,
  targetSlot = null,
  albumId = null,
}) => {
  const t = getTranslation(locale);
  const [plateInput, setPlateInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);

  // Issue #10: solo se aceptan imágenes JPG o PNG y de hasta 5 MB
  const MAX_FILE_SIZE_MB = 5;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

  if (!isOpen) return null;

  const handleClose = () => {
    setImagePreview(null);
    setPlateInput('');
    setErrorMsg(null);
    setIsProcessingOCR(false);
    onClose();
  };

  const handleResetPhoto = () => {
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

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setImagePreview(base64Data);

      // Enviar la imagen original completa al motor ALPR/Plate Recognizer para detección automática instantánea
      runRealOCR(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const runRealOCR = async (imageBase64: string) => {
    setIsProcessingOCR(true);
    setErrorMsg(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/plates/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });

      if (!res.ok) throw new Error('Error en API de OCR');

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

    const digitMatch = plateInput.match(/\d{3}/);
    if (!digitMatch) {
      setErrorMsg('No se detectaron 3 dígitos numéricos (ej: AI 440 SA o ABC 123).');
      return;
    }

    const slotNumber = parseInt(digitMatch[0], 10);

    // Validación según el Issue #4: si viene de un casillero específico, la patente leída debe coincidir
    if (targetSlot !== null && targetSlot !== undefined && slotNumber !== targetSlot) {
      const formattedTarget = targetSlot.toString().padStart(3, '0');
      setErrorMsg(`La patente ingresada/leída (#${digitMatch[0]}) no corresponde al casillero #${formattedTarget} seleccionado. Carga anulada.`);
      return;
    }
    const mockImage = imagePreview || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60';

    // Issue #6: exige sesión previa para cargar fotos (también validado en backend)
    const jwtToken = localStorage.getItem('jwt_token');
    if (!jwtToken) {
      setErrorMsg('Debes iniciar sesión antes de cargar fotos al álbum.');
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      // Issue #12: si se está viendo un álbum compartido, la figurita va a ese álbum
      const stickerUrl = albumId ? `${apiUrl}/album/stickers?albumId=${albumId}` : `${apiUrl}/album/stickers`;
      const response = await fetch(stickerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          plateText: plateInput,
          imageUrl: mockImage,
        }),
      });

      if (response.status === 401) {
        setErrorMsg('Tu sesión expiró o no es válida. Inicia sesión nuevamente para cargar fotos.');
        return;
      }

      if (response.status === 409) {
        const errData = await response.json();
        setErrorMsg(errData.error || `El casillero #${slotNumber} ya posee una figurita pegada.`);
        return;
      }
    } catch (err) {
      console.error('Error al guardar en PostgreSQL:', err);
    }

    onStickerAdded(slotNumber, plateInput.toUpperCase(), mockImage);
    handleClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{t.uploadButton}</h2>
          <button className="close-btn" onClick={handleClose}>
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

          {/* Input de Patente - Issue #9: readonly, el valor proviene del OCR */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              {t.plateInputLabel}
            </label>
            <input 
              type="text" 
              className="search-input" 
              placeholder="Procesando foto con OCR..."
              value={plateInput}
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              style={{ 
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
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              {plateInput
                ? <>Patente detectada automáticamente. Casillero asignado: <strong>#{plateInput.match(/\d{3}/)?.[0] || '___'}</strong></>
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
      </div>
    </div>
  );
};
