'use client';

import React from 'react';
import { X, Calendar, User, CheckCircle2 } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

export interface StickerData {
  slotNumber: number;
  rawPlate: string;
  imageUrl: string;
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
}

export const StickerModal: React.FC<StickerModalProps> = ({
  slotNumber,
  sticker,
  isOpen,
  onClose,
  locale,
  onOpenUploadForSlot,
}) => {
  const t = getTranslation(locale);

  if (!isOpen || slotNumber === null) return null;

  const formattedSlot = slotNumber.toString().padStart(3, '0');

  return (
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
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', marginBottom: '1.25rem' }}>
              <img 
                src={sticker.imageUrl} 
                alt={`Patente ${sticker.rawPlate}`} 
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
              />
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'rgba(16, 185, 129, 0.9)',
                color: '#FFF',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle2 size={14} />
                <span>PEGADA</span>
              </div>
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

            <button className="btn-secondary" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
              {t.close}
            </button>
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
  );
};
