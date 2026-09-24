'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, Lock, BookOpen } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';
import { StickerData } from './StickerModal';

export interface AlbumOption {
  id: string;
  title: string;
  role: 'OWNER' | 'ASSOCIATE';
}

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
  // Issue #12: álbumes propios + compartidos (invitaciones aceptadas)
  albums?: AlbumOption[];
  activeAlbumId?: string | null;
  onChangeAlbum?: (albumId: string) => void;
}

export const AlbumGrid: React.FC<AlbumGridProps> = ({
  locale,
  stickers,
  onSlotClick,
  userSession,
  onOpenLogin,
  albums = [],
  activeAlbumId = null,
  onChangeAlbum,
}) => {
  const t = getTranslation(locale);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'collected' | 'missing'>('all');
  const [selectedAlbum, setSelectedAlbum] = useState<'own' | 'shared'>('own');

  // Issue #7: sin sesión no existe "el álbum del usuario"; se limpian los filtros
  // locales (búsqueda, filtro, álbum seleccionado) al cerrar sesión.
  useEffect(() => {
    if (!userSession) {
      setSearchTerm('');
      setFilterType('all');
      setSelectedAlbum('own');
    }
  }, [userSession]);

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
              value={activeAlbumId || 'own'} 
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'own') {
                  setSelectedAlbum('own');
                  const own = albums.find((a) => a.role === 'OWNER');
                  if (own && onChangeAlbum) onChangeAlbum(own.id);
                } else {
                  setSelectedAlbum('shared');
                  if (onChangeAlbum) onChangeAlbum(value);
                }
              }}
              disabled={!userSession}
              title={userSession ? undefined : 'Inicia sesión para ver tus álbumes'}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                padding: '0.4rem 0.8rem',
                fontSize: '0.9rem',
                cursor: userSession ? 'pointer' : 'not-allowed',
                opacity: userSession ? 1 : 0.45,
              }}
            >
              <option value="own" style={{ background: '#121827' }}>
                {userSession ? `Álbum de ${userSession.name} (Propietario)` : 'Mi Álbum Principal'}
              </option>
              {/* Issue #12: un álbum compartido por cada invitación aceptada */}
              {albums
                .filter((a) => a.role === 'ASSOCIATE')
                .map((a) => (
                  <option key={a.id} value={a.id} style={{ background: '#121827' }}>
                    {a.title} (Invitado)
                  </option>
                ))}
            </select>
          </div>

          {!userSession && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: '#F87171', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={14} />
              <span>Inicia sesión para ver las fotografías del álbum</span>
            </div>
          )}
        </div>

        {/* Issue #7: sin sesión no se conoce el progreso del usuario (valores limpiados en logout) */}
        <div className="progress-card" style={{ opacity: userSession ? 1 : 0.45 }}>
          <div className="progress-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span style={{ fontWeight: 700 }}>{t.progressTitle}</span>
            </div>
            <div style={{ fontFamily: 'Space Mono', fontWeight: 700 }}>
              {userSession ? (
                <>
                  <span style={{ color: 'var(--accent-cyan)' }}>{collectedCount}</span> / {TOTAL_SLOTS} ({progressPercentage}%)
                </>
              ) : (
                'Inicia sesión para ver tu progreso'
              )}
            </div>
          </div>
          
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: userSession ? `${progressPercentage}%` : '0%' }} 
            />
          </div>
        </div>

        {/* Buscador y Filtros */}
        <div className="controls-row" style={{ opacity: userSession ? 1 : 0.45 }}>
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              className="search-input"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!userSession}
              title={userSession ? undefined : 'Inicia sesión para buscar en tu álbum'}
            />
          </div>

          <div className="filter-pills">
            <button 
              className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
              disabled={!userSession}
              title={userSession ? undefined : 'Inicia sesión para filtrar tu álbum'}
            >
              {t.filterAll}
            </button>
            <button 
              className={`filter-pill ${filterType === 'collected' ? 'active' : ''}`}
              onClick={() => setFilterType('collected')}
              disabled={!userSession}
              title={userSession ? undefined : 'Inicia sesión para filtrar tu álbum'}
            >
              {t.filterCollected} ({userSession ? collectedCount : 0})
            </button>
            <button 
              className={`filter-pill ${filterType === 'missing' ? 'active' : ''}`}
              onClick={() => setFilterType('missing')}
              disabled={!userSession}
              title={userSession ? undefined : 'Inicia sesión para filtrar tu álbum'}
            >
              {t.filterMissing} ({userSession ? TOTAL_SLOTS - collectedCount : TOTAL_SLOTS})
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
                    {/* Issue #11: miniatura liviana + carga diferida para no
                        bloquear la grilla cuando el álbum tiene muchas fotos */}
                    <img 
                      src={sticker.thumbnailUrl || sticker.imageUrl} 
                      alt={`Patente ${sticker.rawPlate}`} 
                      className="sticker-image"
                      loading="lazy"
                      decoding="async"
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
