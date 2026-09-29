'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, Lock, BookOpen, ArrowUp, ArrowLeftRight, CheckCircle2, CircleDashed, X } from 'lucide-react';
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
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Issue #16: botón flotante al pie para scroll rápido hacia el inicio
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 250);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
  const missingCount = TOTAL_SLOTS - collectedCount;
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
        !searchTerm ||
        formattedNumber.includes(searchTerm) ||
        (sticker && sticker.rawPlate.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterType === 'collected') return !!sticker;
      if (filterType === 'missing') return !sticker;

      return true;
    });
  }, [slots, stickers, searchTerm, filterType]);

  // Issue #13: alternar de forma interactiva entre pegadas y faltantes
  const toggleCollectedMissing = () => {
    if (!userSession) return;
    if (filterType === 'collected') {
      setFilterType('missing');
    } else {
      setFilterType('collected');
    }
  };

  return (
    <div>
      {/* Barra de Progreso & Selector de Álbumes */}
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
      </div>

      {/* Issue #16: Barra de Filtros & Búsqueda SIEMPRE VISIBLE al hacer scroll (Sticky) */}
      <div className="sticky-controls-bar">
        <div className="sticky-controls-inner">
          <div className="controls-row" style={{ opacity: userSession ? 1 : 0.45 }}>
            {/* Issue #14: Cuadro de búsqueda achicado (hasta 3 dígitos) */}
            <div className="search-input-wrapper compact-search">
              <Search size={15} className="search-icon" />
              <input 
                type="text" 
                className="search-input compact-input"
                placeholder=""
                maxLength={3}
                inputMode="numeric"
                value={searchTerm}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 3);
                  setSearchTerm(val);
                }}
                disabled={!userSession}
                title={userSession ? 'Buscar por número de 3 dígitos (ej: 042)' : 'Inicia sesión para buscar en tu álbum'}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchTerm('')}
                  title="Limpiar búsqueda"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Issue #13 & #14: Botones de filtrado con botón/switch unificado Pegadas/Faltantes */}
            <div className="filter-pills-group">
              {/* Botón Todas */}
              <button 
                type="button"
                className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
                disabled={!userSession}
                title={userSession ? undefined : 'Inicia sesión para filtrar tu álbum'}
              >
                {t.filterAll}
              </button>

              {/* Issue #13: Botón / Switch unificado interactivo para Pegadas / Faltantes */}
              <div 
                className={`unified-toggle-container ${filterType !== 'all' ? 'active' : ''}`}
                title={userSession ? 'Alternar entre Pegadas y Faltantes' : undefined}
              >
                <button
                  type="button"
                  className={`unified-toggle-segment ${filterType === 'collected' ? 'selected collected-active' : ''}`}
                  onClick={() => setFilterType('collected')}
                  disabled={!userSession}
                  title="Mostrar figuritas pegadas"
                >
                  <CheckCircle2 size={14} className="segment-icon" />
                  <span>{t.filterCollected} ({userSession ? collectedCount : 0})</span>
                </button>

                <button
                  type="button"
                  className="unified-toggle-switch-btn"
                  onClick={toggleCollectedMissing}
                  disabled={!userSession}
                  title="Alternar entre Pegadas y Faltantes"
                >
                  <ArrowLeftRight size={13} />
                </button>

                <button
                  type="button"
                  className={`unified-toggle-segment ${filterType === 'missing' ? 'selected missing-active' : ''}`}
                  onClick={() => setFilterType('missing')}
                  disabled={!userSession}
                  title="Mostrar casilleros faltantes"
                >
                  <CircleDashed size={14} className="segment-icon" />
                  <span>{t.filterMissing} ({userSession ? missingCount : TOTAL_SLOTS})</span>
                </button>
              </div>
            </div>
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

      {/* Issue #16: Botón flotante al pie de pantalla para volver al inicio */}
      {showScrollTop && (
        <button
          type="button"
          className="floating-scroll-top"
          onClick={scrollToTop}
          title={t.scrollToTop}
          aria-label={t.scrollToTop}
        >
          <ArrowUp size={22} />
        </button>
      )}
    </div>
  );
};
