'use client';

import React, { useState, useMemo } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';
import { StickerData } from './StickerModal';

interface AlbumGridProps {
  locale: Locale;
  stickers: Record<number, StickerData>;
  onSlotClick: (slotNumber: number) => void;
}

export const AlbumGrid: React.FC<AlbumGridProps> = ({ locale, stickers, onSlotClick }) => {
  const t = getTranslation(locale);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'collected' | 'missing'>('all');

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
      {/* Bar de Progreso */}
      <div className="toolbar-container">
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
              onClick={() => onSlotClick(slot)}
              title={sticker ? `Casillero #${formattedSlot}: ${sticker.rawPlate}` : `Casillero #${formattedSlot} Vacío`}
            >
              {sticker ? (
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
                <span className="slot-number">{formattedSlot}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
