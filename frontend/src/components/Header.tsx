'use client';

import React from 'react';
import { Camera, Users, Car, Globe, LogIn, UserCheck, LogOut } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface UserSession {
  email: string;
  name: string;
  avatarUrl?: string;
}

interface HeaderProps {
  locale: Locale;
  setLocale: (lang: Locale) => void;
  onOpenUpload: () => void;
  onOpenLogin: () => void;
  onLogout?: () => void;
  userSession: UserSession | null;
}

export const Header: React.FC<HeaderProps> = ({
  locale,
  setLocale,
  onOpenUpload,
  onOpenLogin,
  onLogout,
  userSession,
}) => {
  const t = getTranslation(locale);

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

          {userSession ? (
            <div style={{ position: 'relative' }}>
              <button 
                className="btn-secondary"
                onClick={onLogout}
                title={`Conectado como ${userSession.name}. Haz clic para cerrar sesión.`}
                style={{
                  borderColor: 'rgba(16, 185, 129, 0.4)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  gap: '0.5rem',
                }}
              >
                <UserCheck size={18} style={{ color: 'var(--accent-emerald)' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{userSession.name}</span>
                <LogOut size={16} style={{ color: '#EF4444', marginLeft: '0.25rem' }} />
              </button>
            </div>
          ) : (
            <button className="btn-secondary" onClick={onOpenLogin}>
              <LogIn size={18} />
              <span>Iniciar Sesión</span>
            </button>
          )}

          <button className="btn-secondary">
            <Users size={18} />
            <span>{t.invitePartner}</span>
          </button>

          <button className="btn-primary" onClick={onOpenUpload}>
            <Camera size={18} />
            <span>{t.uploadButton}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

