'use client';

/**
 * Cabecera principal de la aplicación (#15).
 * Acciones de "Pegar figurita" e "Invitar asociado", selector de idioma
 * ES/EN, campana de notificaciones #34 (NotificationsBell) y menú de
 * usuario desplegable con acceso al panel de usuario, al panel de
 * administración #41 y al logout. Aplica el tema claro/oscuro #36/#43
 * al montar.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Camera, Car, LogIn, UserCheck, LogOut, ChevronDown, User } from 'lucide-react';
import { useLocale } from '../lib/LocaleContext';
import type { NotificationItem, UserSession } from '../types/domain';
import { NotificationsBell } from './NotificationsBell';

// Issue #36: el tema se aplica al montar y se controla desde el panel de usuario (#43)
import { getStoredTheme, applyTheme } from '../lib/theme';

interface HeaderProps {
  onOpenUpload: () => void;
  onOpenLogin: () => void;
  onOpenUserModal?: () => void;
  onLogout?: () => void;
  userSession: UserSession | null;
  // Issue #33: acceso al log de movimientos
  onOpenActivityLog?: () => void;
  // Issue #34: abrir la figurita avisada por una notificación
  onSelectNotification?: (notification: NotificationItem) => void;
}

// Issue #17: Iconos de proveedores OAuth para el botón de usuario
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  onOpenUpload,
  onOpenLogin,
  onOpenUserModal = () => {},
  onLogout,
  userSession,
  onOpenActivityLog,
  onSelectNotification,
}) => {
  const { t } = useLocale();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Issue #36/#43: aplica el tema guardado al montar. El control para cambiarlo
  // vive en el panel de usuario, así que aquí no hace falta mantener estado.
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  // Issue #17: Renderizar icono de autenticación
  const renderAuthIcon = () => {
    if (!userSession) return null;
    const provider = (userSession.authProvider || '').toLowerCase();

    if (userSession.avatarUrl) {
      return (
        <img 
          src={userSession.avatarUrl} 
          alt={userSession.name} 
          style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
        />
      );
    }

    if (provider === 'google') return <GoogleIcon />;

    return <UserCheck size={18} style={{ color: 'var(--accent-emerald)' }} />;
  };

  return (
    <header className="header-container">
      <div className="header-content">
        <div className="logo-badge">
          <div className="logo-icon">
            <Car size={24} />
          </div>
          <div>
            <h1 className="brand-title">{t.appTitle}</h1>
          </div>
        </div>

        <div className="header-actions">
          {/* Issue #34: campana de notificaciones de actividad del álbum */}
          {userSession && (
            <NotificationsBell
              userSession={userSession}
              onOpenActivityLog={onOpenActivityLog}
              onSelectNotification={onSelectNotification}
            />
          )}

          {/* Issue #46: "Pegar Figurita" ahora va ANTES del botón de login / menú de usuario */}
          <button
            className="btn-primary"
            onClick={onOpenUpload}
            title={userSession ? undefined : 'Inicia sesión para pegar una foto'}
            style={!userSession ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            <Camera size={18} />
            <span>{t.uploadButton}</span>
          </button>

          {/* Issue #15 & #17: Menú de usuario desplegable. Botón muestra SOLO el icono de usuario/OAuth */}
          {userSession ? (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button 
                type="button"
                className="btn-secondary user-menu-button user-icon-only-button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                title={`Usuario: ${userSession.name} (${userSession.email})`}
                style={{
                  borderColor: isDropdownOpen ? 'var(--accent-cyan)' : 'rgba(16, 185, 129, 0.4)',
                  background: isDropdownOpen ? 'rgba(0, 242, 254, 0.12)' : 'rgba(16, 185, 129, 0.1)',
                  padding: '0.6rem 0.75rem',
                  gap: '0.35rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {renderAuthIcon()}
                </div>
                <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: isDropdownOpen ? 'rotate(180deg)' : 'none', color: 'var(--text-secondary)' }} />
              </button>

              {/* Menú Desplegable: Al hacer click muestra nombre y opciones (Panel, Invitar, Idioma, Logout) */}
              {isDropdownOpen && (
                <div className="user-dropdown-menu">
                  {/* Cabecera del usuario con avatar + nombre + email */}
                  <div className="user-dropdown-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {renderAuthIcon()}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {userSession.name}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {userSession.email}
                    </div>
                  </div>

                  <div className="user-dropdown-divider" />

                  {/* Opción 1: Panel de Usuario */}
                  <button
                    type="button"
                    className="user-dropdown-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenUserModal();
                    }}
                  >
                    <User size={16} style={{ color: 'var(--accent-cyan)' }} />
                    <span>{t.userPanel}</span>
                  </button>

                  <div className="user-dropdown-divider" />

                  {/* Issue #42: el log de movimientos solo se abre desde la campana
                      de notificaciones (pie de su desplegable), no desde este menú. */}

                  {/* Opción 5: Cerrar Sesión */}
                  <button
                    type="button"
                    className="user-dropdown-item logout"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      if (onLogout) onLogout();
                    }}
                  >
                    <LogOut size={16} style={{ color: '#EF4444' }} />
                    <span style={{ color: '#EF4444', fontWeight: 600 }}>{t.logout}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn-secondary" onClick={onOpenLogin}>
              <LogIn size={18} />
              <span>Iniciar Sesión</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

