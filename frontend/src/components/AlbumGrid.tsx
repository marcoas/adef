'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, Lock, BookOpen, ArrowUp, ArrowLeftRight, CheckCircle2, CircleDashed, X, History } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';
import { StickerData } from './StickerModal';
import { QuickJumpBar } from './QuickJumpBar';

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
  recentAddedSlot?: number | null;
  // Issue #33: acceso al log histórico de movimientos del álbum
  onOpenActivityLog?: () => void;
}

// Issue #32: casilleros ancla de la barra de links rápidos (0, 100, ... 900)
const JUMP_GROUPS = Array.from({ length: 10 }, (_, i) => i * 100);

export const AlbumGrid: React.FC<AlbumGridProps> = ({
  locale,
  stickers,
  onSlotClick,
  userSession,
  onOpenLogin,
  albums = [],
  activeAlbumId = null,
  onChangeAlbum,
  recentAddedSlot,
  onOpenActivityLog,
}) => {
  const t = getTranslation(locale);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'collected' | 'missing'>('all');
  const [selectedAlbum, setSelectedAlbum] = useState<'own' | 'shared'>('own');
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Issue #32: centena activa según la posición del scroll
  const [activeGroup, setActiveGroup] = useState<number | null>(null);

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

  // Issue #32: la barra de links rápidos sólo se muestra mientras el álbum se ve
  // sin filtros (ni búsqueda): con filtros los casilleros ancla no están en pantalla.
  const isFiltered = filterType !== 'all' || searchTerm.trim().length > 0;
  const showQuickJump = !!userSession && !isFiltered;

  // Offset vertical ocupado por el header y la barra de controles sticky
  const getStickyOffset = () => {
    const headerHeight = document.querySelector('.header-container')?.getBoundingClientRect().height || 0;
    const controlsHeight = document.querySelector('.sticky-controls-bar')?.getBoundingClientRect().height || 0;
    return headerHeight + controlsHeight + 12;
  };

  // Issue #32: desplaza el álbum hasta que las figuritas de esa centena queden visibles
  const jumpToGroup = (group: number) => {
    const target = document.getElementById(`slot-${group}`);
    if (!target) return;

    setActiveGroup(group);
    const top = target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
    window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
  };

  // Issue #32: resalta la centena que está a la vista del usuario
  useEffect(() => {
    if (!showQuickJump) {
      setActiveGroup(null);
      return;
    }

    let rafId = 0;

    const updateActiveGroup = () => {
      rafId = 0;
      const threshold = getStickyOffset() + 8;

      // Al llegar al final de la página el último grupo ancla no cruza el umbral
      const reachedBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
      let current = JUMP_GROUPS[0];

      for (const group of JUMP_GROUPS) {
        const anchor = document.getElementById(`slot-${group}`);
        if (!anchor) continue;
        if (anchor.getBoundingClientRect().top <= threshold) current = group;
      }

      setActiveGroup(reachedBottom ? JUMP_GROUPS[JUMP_GROUPS.length - 1] : current);
    };

    const handleScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(updateActiveGroup);
    };

    updateActiveGroup();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [showQuickJump, userSession]);

  return (
    <div>
      {/* Issue #21 & #28: Unificar Álbum Activo + Progreso y Ocultar si no hay sesión */}
      {userSession && (
        <div className="toolbar-container">
          <div className="progress-card unified-header-row">
            {/* Selector de Álbum Activo */}
            <div className="album-selector-group">
              <BookOpen size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span style={{ fontSize: '0.95rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Álbum Activo:</span>
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
                className="album-select-dropdown"
              >
                <option value="own" style={{ background: '#121827' }}>
                  {`Álbum de ${userSession.name} (Propietario)`}
                </option>
                {albums
                  .filter((a) => a.role === 'ASSOCIATE')
                  .map((a) => (
                    <option key={a.id} value={a.id} style={{ background: '#121827' }}>
                      {a.title} (Invitado)
                    </option>
                  ))}
              </select>
            </div>

            {/* Progreso del Álbum en el mismo renglón */}
            <div className="album-progress-group">
              <div className="progress-info-text">
                <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.progressTitle}:</span>
                <span style={{ fontFamily: 'Space Mono', fontWeight: 700, fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>{progressPercentage}%</span>
                </span>
              </div>

              <div className="progress-bar-bg compact-progress">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${progressPercentage}%` }} 
                />
              </div>
            </div>

          </div>
        </div>
      )}

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

            {/* Issue #33: acceso al log histórico de movimientos del álbum */}
            {userSession && onOpenActivityLog && (
              <button
                type="button"
                className="toolbar-icon-btn"
                onClick={onOpenActivityLog}
                title={t.activityLog}
              >
                <History size={15} />
                <span className="toolbar-icon-btn-label">{t.activityLog}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Issue #32: barra flotante de links rápidos (sólo sin filtros) */}
      {showQuickJump && (
        <QuickJumpBar
          locale={locale}
          groups={JUMP_GROUPS}
          activeGroup={activeGroup}
          onJump={jumpToGroup}
        />
      )}

      {/* Rejilla del Álbum 000-999 */}
      <div className="grid-container">
        {filteredSlots.map((slot) => {
          const sticker = stickers[slot];
          const formattedSlot = slot.toString().padStart(3, '0');

          return (
            <div 
              key={slot}
              id={`slot-${slot}`}
              className={`sticker-slot ${sticker ? 'collected' : ''} ${!userSession ? 'slot-disabled-no-session' : ''}`}
              onClick={() => {
                if (!userSession) return;
                onSlotClick(slot);
              }}
              style={!userSession ? { cursor: 'not-allowed', opacity: 0.35 } : undefined}
              title={
                !userSession 
                  ? `Casillero #${formattedSlot} (Inicia sesión para interactuar)` 
                  : sticker 
                  ? `Casillero #${formattedSlot}: ${sticker.rawPlate}` 
                  : `Casillero #${formattedSlot} Vacío`
              }
            >
              {sticker && userSession ? (
                /* Issue #30: pegado con doblez diagonal (ver .pastable en globals.css) */
                <div className={`pastable ${recentAddedSlot === slot ? 'animate-paste' : ''}`}>
                  <div className="pastable__cover">
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
                  </div>
                  <div className="pastable__flapwrap">
                    <div className="pastable__flap" />
                  </div>
                </div>
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
