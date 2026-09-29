'use client';

import React, { useState } from 'react';
import { X, Calendar, User, CheckCircle2, Trash2 } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

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

  if (!isOpen || slotNumber === null) return null;

  const formattedSlot = slotNumber.toString().padStart(3, '0');

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
                style={{ position: 'relative', width: '100%', aspectRatio: '16/9', marginBottom: '1.25rem', cursor: 'zoom-in' }}
                className={isPeeling ? "animate-peel" : ""}
                onClick={() => setIsFullscreen(true)}
                title="Haz clic para ampliar y ver la foto a tamaño completo"
              >
                <img 
                  src={sticker.imageUrl} 
                  alt={`Patente ${sticker.rawPlate}`} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
                />
              </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem' }}>
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
                  onClick={async () => {
                    if (confirm(`¿Estás seguro de que deseas eliminar la foto del casillero #${formattedSlot}?`)) {
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
                          alert('Tu sesión expiró o no es válida. Inicia sesión nuevamente.');
                          return;
                        }
                        if (res.status === 403) {
                          alert('Solo el dueño del álbum puede eliminar figuritas.');
                          return;
                        }
                      } catch (err) {
                        console.error('Error al eliminar figurita:', err);
                      }
                      
                      setIsPeeling(true);
                      setTimeout(() => {
                        onStickerDeleted(slotNumber);
                        onClose();
                        setIsPeeling(false);
                      }, 600);
                    }
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
                  <span>Eliminar Foto</span>
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
    </>
  );
};
