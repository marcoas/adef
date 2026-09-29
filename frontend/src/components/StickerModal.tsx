'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, User, CheckCircle2, Trash2 } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';
import { ConfirmDialog } from './ConfirmDialog';

export interface StickerData {
  slotNumber: number;
  rawPlate: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  capturedAt: string;
  capturedBy?: string;
}

interface StickerModalProps {
  slotNumber: number | null;
  sticker: StickerData | null;
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  onOpenUploadForSlot: (slot: number) => void;
  onStickerDeleted?: (slotNumber: number) => void;
  isOwner?: boolean;
  // Issue #12: álbum activo (compartido) para eliminar figuritas
  albumId?: string | null;
}

export const StickerModal: React.FC<StickerModalProps> = ({
  slotNumber,
  sticker,
  isOpen,
  onClose,
  locale,
  onOpenUploadForSlot,
  onStickerDeleted,
  isOwner = true,
  albumId = null,
}) => {
  const t = getTranslation(locale);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPeeling, setIsPeeling] = useState(false);
  // Issue #31: confirmación de eliminación mediante popup propio (sin window.confirm/alert)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const peelRef = useRef<HTMLDivElement>(null);

  // Issue #28/#30: medir el contenedor para alimentar las variables CSS
  // (--peel-w / --peel-h) que el clip-path del despegue necesita en px.
  useEffect(() => {
    if (!peelRef.current) return;
    const { width, height } = peelRef.current.getBoundingClientRect();
    peelRef.current.style.setProperty('--peel-w', `${Math.round(width)}px`);
    peelRef.current.style.setProperty('--peel-h', `${Math.round(height)}px`);
  }, [isOpen, sticker?.imageUrl]);

  if (!isOpen || slotNumber === null) return null;

  const formattedSlot = slotNumber.toString().padStart(3, '0');

  // Issue #31: elimina la foto tras confirmar en el popup propio
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const jwtToken = localStorage.getItem('jwt_token');
      const res = await fetch(
        // Issue #12: indicar el álbum cuando es un álbum compartido
        `${apiUrl}/album/stickers/${slotNumber}${albumId ? `?albumId=${albumId}` : ''}`,
        {
          method: 'DELETE',
          headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        }
      );

      if (res.status === 401) {
        setDeleteError(t.sessionExpired);
        return;
      }
      if (res.status === 403) {
        setDeleteError(t.ownerOnlyDelete);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || 'No se pudo eliminar la figurita.');
        return;
      }
    } catch (err) {
      console.error('Error al eliminar figurita:', err);
      setDeleteError('No se pudo eliminar la figurita. Reintenta en unos segundos.');
      return;
    } finally {
      setIsDeleting(false);
    }

    // El popup se cierra y arranca la animación de despegue de la figurita
    setIsConfirmOpen(false);
    setIsPeeling(true);
    setTimeout(() => {
      onStickerDeleted?.(slotNumber);
      onClose();
      setIsPeeling(false);
    }, 600);
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ 
                fontFamily: 'Space Mono', 
                fontSize: '1.25rem', 
                fontWeight: 800, 
                color: sticker ? 'var(--accent-emerald)' : 'var(--text-muted)' 
              }}>
                #{formattedSlot}
              </span>
              <h2 className="modal-title">
                {sticker ? `Patente ${sticker.rawPlate}` : t.emptySlot}
              </h2>
            </div>
            <button className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          {sticker ? (
            <div>
              <div
                ref={peelRef}
                className={`peelable ${isPeeling ? 'is-peeled' : ''}`}
                style={{ marginBottom: '1.25rem', cursor: isPeeling ? 'default' : 'zoom-in' }}
                onClick={() => { if (!isPeeling) setIsFullscreen(true); }}
                title="Haz clic para ampliar y ver la foto a tamaño completo"
              >
                <div className="peelable__content">
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    #{formattedSlot}
                  </span>
                </div>
                <img
                  className="peelable__sticker peelable__cover"
                  src={sticker.imageUrl}
                  alt={`Patente ${sticker.rawPlate}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
                />
                <div className="peelable__flap" />
              </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                <Calendar size={16} />
                <span>{t.capturedAt}: {new Date(sticker.capturedAt).toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <User size={16} />
                <span>{t.capturedBy}: {sticker.capturedBy || 'Usuario Propietario'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              {onStickerDeleted && isOwner && (
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    setDeleteError(null);
                    setIsConfirmOpen(true);
                  }}
                  style={{ 
                    color: '#EF4444', 
                    borderColor: 'rgba(239, 68, 68, 0.3)', 
                    background: 'rgba(239, 68, 68, 0.1)',
                    gap: '0.4rem',
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  <Trash2 size={16} />
                  <span>{t.deletePhoto}</span>
                </button>
              )}

              <button className="btn-secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
                {t.close}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              El casillero <strong>#{formattedSlot}</strong> aún no posee ninguna figurita pegada.
            </p>
            
            <button 
              className="btn-primary" 
              onClick={() => {
                onClose();
                onOpenUploadForSlot(slotNumber);
              }}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {t.pasteSticker}
            </button>
          </div>
        )}
      </div>
    </div>

      {/* Issue #23: Visualización a tamaño real con botón claro para volver al álbum / cerrar */}
      {isFullscreen && sticker && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 200, background: 'rgba(0, 0, 0, 0.95)', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsFullscreen(false)}
        >
          <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.75rem', zIndex: 210 }}>
            <button 
              type="button" 
              className="btn-primary" 
              onClick={() => setIsFullscreen(false)}
              style={{ padding: '0.6rem 1.2rem', gap: '0.5rem', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', color: '#000', fontWeight: 700 }}
            >
              <X size={20} />
              <span>Volver al Álbum</span>
            </button>
          </div>

          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <img 
              src={sticker.imageUrl} 
              alt={`Patente ${sticker.rawPlate}`} 
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 'var(--radius-md)', boxShadow: '0 0 40px rgba(0, 242, 254, 0.2)' }}
            />
            <div style={{ marginTop: '1rem', color: '#FFF', fontSize: '0.95rem', fontFamily: 'Space Mono', background: 'rgba(255,255,255,0.1)', padding: '0.4rem 1rem', borderRadius: '999px', backdropFilter: 'blur(8px)' }}>
              Patente: <strong>{sticker.rawPlate}</strong> · Casillero #{formattedSlot}
            </div>
          </div>
        </div>
      )}

      {/* Issue #31: popup de confirmación propio, con la estética del sitio */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        locale={locale}
        title={t.confirmDeleteTitle}
        message={t.confirmDeleteMessage}
        highlight={`#${formattedSlot}`}
        hint={t.confirmDeleteHint}
        confirmLabel={t.confirmDeleteBtn}
        cancelLabel={t.cancel}
        isProcessing={isDeleting}
        errorMessage={deleteError}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (isDeleting) return;
          setIsConfirmOpen(false);
          setDeleteError(null);
        }}
      >
        <div className="confirm-preview">
          <img src={sticker?.thumbnailUrl || sticker?.imageUrl} alt={sticker ? `Patente ${sticker.rawPlate}` : ''} />
          <div className="confirm-preview-info">
            <span className="confirm-preview-plate">{sticker?.rawPlate}</span>
            <span className="confirm-preview-slot">Casillero #{formattedSlot}</span>
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
};
