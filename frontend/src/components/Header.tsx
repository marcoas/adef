'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Camera, Users, Car, Globe, LogIn, UserCheck, LogOut, ChevronDown, User, ShieldCheck } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface UserSession {
  email: string;
  name: string;
  avatarUrl?: string;
  authProvider?: string;
}

interface HeaderProps {
  locale: Locale;
  setLocale: (lang: Locale) => void;
  onOpenUpload: () => void;
  onOpenLogin: () => void;
  onOpenInvite?: () => void;
  onOpenUserModal?: () => void;
  onLogout?: () => void;
  userSession: UserSession | null;
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

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  locale,
  setLocale,
  onOpenUpload,
  onOpenLogin,
  onOpenInvite = () => {},
  onOpenUserModal = () => {},
  onLogout,
  userSession,
}) => {
  const t = getTranslation(locale);
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
    if (provider === 'facebook') return <FacebookIcon />;
    if (provider === 'github') return <GithubIcon />;

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
            <p className="brand-subtitle">{t.appSubtitle}</p>
          </div>
        </div>

        <div className="header-actions">
          <button 
            className="btn-secondary" 
            onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
            title="Cambiar idioma"
          >
            <Globe size={18} />
            <span>{locale.toUpperCase()}</span>
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

              {/* Menú Desplegable: Al hacer click muestra nombre y opciones */}
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

                  {/* Opción 2: Invitar Asociados */}
                  <button
                    type="button"
                    className="user-dropdown-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenInvite();
                    }}
                  >
                    <Users size={16} style={{ color: 'var(--accent-blue)' }} />
                    <span>{t.invitePartner}</span>
                  </button>

                  {/* Opción 3: Ver y Revocar Invitaciones */}
                  <button
                    type="button"
                    className="user-dropdown-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenUserModal();
                    }}
                  >
                    <ShieldCheck size={16} style={{ color: 'var(--accent-emerald)' }} />
                    <span>{t.manageInvites}</span>
                  </button>

                  {/* Opción 4: Cambiar Idioma */}
                  <button
                    type="button"
                    className="user-dropdown-item"
                    onClick={() => {
                      setLocale(locale === 'es' ? 'en' : 'es');
                    }}
                  >
                    <Globe size={16} style={{ color: 'var(--accent-amber)' }} />
                    <span>{t.changeLanguage} ({locale === 'es' ? 'EN' : 'ES'})</span>
                  </button>

                  <div className="user-dropdown-divider" />

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

          {/* Botón Invitar Asociado en Header */}
          <button
            className="btn-secondary"
            onClick={userSession ? onOpenInvite : onOpenLogin}
            title={userSession ? undefined : 'Inicia sesión para invitar a un asociado'}
            style={!userSession ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            <Users size={18} />
            <span>{t.invitePartner}</span>
          </button>

          {/* Botón Capturar Patente */}
          <button
            className="btn-primary"
            onClick={onOpenUpload}
            title={userSession ? undefined : 'Inicia sesión para capturar una patente'}
            style={!userSession ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            <Camera size={18} />
            <span>{t.uploadButton}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

