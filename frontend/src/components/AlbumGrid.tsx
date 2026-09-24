'use client';

import React, { useState, useMemo } from 'react';
import { Search, Sparkles, Lock, BookOpen } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';
import { StickerData } from './StickerModal';

interface UserSession {
  email: string;
  name: string;
  avatarUrl?: string;
}

interface AlbumGridProps {
  locale: Locale;
  stickers: Record<number, StickerData>;
  onSlotClick: (slotNumber: number) => void;
  userSession: UserSession | null;
  onOpenLogin: () => void;
}

export const AlbumGrid: React.FC<AlbumGridProps> = ({ locale, stickers, onSlotClick, userSession, onOpenLogin }) => {
  const t = getTranslation(locale);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'collected' | 'missing'>('all');
  const [selectedAlbum, setSelectedAlbum] = useState<'own' | 'shared'>('own');

  const TOTAL_SLOTS = 1000;
  const collectedCount = Object.keys(stickers).length;
  const progressPercentage = ((collectedCount / TOTAL_SLOTS) * 100).toFixed(1);

  // Generar array de 000 a 999
  const slots = useMemo(() => {
    return Array.from({ length: TOTAL_SLOTS }, (_, i) => i);
  }, []);

  // Filtrado de casilleros
  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      const formattedNumber = slot.toString().padStart(3, '0');
      const sticker = stickers[slot];

      // Filtro por búsqueda de texto/número
      const matchesSearch = 
        formattedNumber.includes(searchTerm) ||
        (sticker && sticker.rawPlate.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterType === 'collected') return !!sticker;
      if (filterType === 'missing') return !sticker;

      return true;
    });
  }, [slots, stickers, searchTerm, filterType]);

  return (
    <div>
      {/* Bar de Progreso & Selector de Álbumes */}
      <div className="toolbar-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={20} style={{ color: 'var(--accent-cyan)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Álbum Activo:</h2>
            <select 
              value={selectedAlbum} 
              onChange={(e) => setSelectedAlbum(e.target.value as 'own' | 'shared')}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                padding: '0.4rem 0.8rem',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              <option value="own" style={{ background: '#121827' }}>
                {userSession ? `Álbum de ${userSession.name} (Propietario)` : 'Mi Álbum Principal'}
              </option>
              <option value="shared" style={{ background: '#121827' }}>Álbum Compartido (Familia & Asociados)</option>
            </select>
          </div>

          {!userSession && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: '#F87171', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={14} />
              <span>Inicia sesión para ver las fotografías del álbum</span>
            </div>
          )}
        </div>

        <div className="progress-card">
          <div className="progress-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span style={{ fontWeight: 700 }}>{t.progressTitle}</span>
            </div>
            <div style={{ fontFamily: 'Space Mono', fontWeight: 700 }}>
              <span style={{ color: 'var(--accent-cyan)' }}>{collectedCount}</span> / {TOTAL_SLOTS} ({progressPercentage}%)
            </div>
          </div>
          
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progressPercentage}%` }} 
            />
          </div>
        </div>

        {/* Buscador y Filtros */}
        <div className="controls-row">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              className="search-input"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-pills">
            <button 
              className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              {t.filterAll}
            </button>
            <button 
              className={`filter-pill ${filterType === 'collected' ? 'active' : ''}`}
              onClick={() => setFilterType('collected')}
            >
              {t.filterCollected} ({collectedCount})
            </button>
            <button 
              className={`filter-pill ${filterType === 'missing' ? 'active' : ''}`}
              onClick={() => setFilterType('missing')}
            >
              {t.filterMissing} ({TOTAL_SLOTS - collectedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Rejilla del Álbum 000-999 */}
      <div className="grid-container">
        {filteredSlots.map((slot) => {
          const sticker = stickers[slot];
          const formattedSlot = slot.toString().padStart(3, '0');

          return (
            <div 
              key={slot}
              className={`sticker-slot ${sticker ? 'collected' : ''}`}
              onClick={() => {
                if (!userSession && sticker) {
                  onOpenLogin();
                } else {
                  onSlotClick(slot);
                }
              }}
              title={
                !userSession && sticker 
                  ? `Inicia sesión para ver la foto de #${formattedSlot}` 
                  : sticker 
                  ? `Casillero #${formattedSlot}: ${sticker.rawPlate}` 
                  : `Casillero #${formattedSlot} Vacío`
              }
            >
              {sticker ? (
                userSession ? (
                  <>
                    <img 
                      src={sticker.imageUrl} 
                      alt={`Patente ${sticker.rawPlate}`} 
                      className="sticker-image"
                    />
                    <div className="plate-badge">
                      {sticker.rawPlate}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--accent-cyan)' }}>
                    <Lock size={20} />
                    <span style={{ fontSize: '0.75rem', marginTop: '4px', fontWeight: 600 }}>#{formattedSlot}</span>
                  </div>
                )
              ) : (
                <span className="slot-number">{formattedSlot}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
