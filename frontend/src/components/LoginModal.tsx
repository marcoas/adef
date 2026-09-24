'use client';

import React, { useState, useEffect } from 'react';
import { X, LogIn, ShieldCheck, AlertCircle, Loader2, Github, Facebook } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2?: {
          initTokenClient: (config: any) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  onLoginSuccess: (user: { email: string; name: string; avatarUrl?: string }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  locale,
  onLoginSuccess,
}) => {
  const t = getTranslation(locale);
  const [isLoading, setIsLoading] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar el SDK de Google Identity Services (GIS) una sola vez al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    if (!document.getElementById('google-jssdk')) {
      const script = document.createElement('script');
      script.id = 'google-jssdk';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOAuthLogin = async (provider: 'google' | 'facebook' | 'github') => {
    setIsLoading(true);
    setActiveProvider(provider);
    setErrorMessage(null);

    if (provider === 'google') {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
      if (!clientId || clientId === 'your_google_client_id_here.apps.googleusercontent.com') {
        setIsLoading(false);
        setActiveProvider(null);
        setErrorMessage('Google OAuth no está configurado: falta NEXT_PUBLIC_GOOGLE_CLIENT_ID en el entorno del frontend.');
        return;
      }
      if (window.google?.accounts?.oauth2) {
        // Popup real de Google con selector de cuenta (One Tap / prompt() no siempre se muestra)
        openGoogleAccountChooser(clientId);
        return;
      }
      setIsLoading(false);
      setActiveProvider(null);
      setErrorMessage('El SDK de Google aún se está cargando. Reintenta en unos segundos.');
      return;
    } else if (provider === 'facebook') {
      // Flujo OAuth Facebook
      await executeOAuthBackendLogin('facebook', 'Usuario Facebook', 'usuario_facebook@patentes.ar');
    } else if (provider === 'github') {
      // Flujo OAuth GitHub
      await executeOAuthBackendLogin('github', 'Usuario GitHub', 'usuario_github@patentes.ar');
    }
  };

  const executeOAuthBackendLogin = async (
    provider: string,
    defaultName: string,
    defaultEmail: string,
    avatarOverride?: string,
  ) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: defaultEmail,
          name: defaultName,
          avatarUrl: avatarOverride
            || (provider === 'github'
              ? 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=150&auto=format&fit=crop&q=80'
              : provider === 'facebook'
              ? 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80'
              : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'),
          authProvider: provider,
        }),
      });

      if (!res.ok) {
        throw new Error(`Error al autenticar con proveedor ${provider}`);
      }

      const data = await res.json();
      if (data.token) {
        localStorage.setItem('jwt_token', data.token);
      }
      if (data.user) {
        localStorage.setItem('user_session', JSON.stringify(data.user));
        onLoginSuccess(data.user);
      }
      onClose();
    } catch (err: any) {
      console.error(`Error OAuth ${provider}:`, err);
      setErrorMessage(err.message || `No se pudo completar el login con ${provider}`);
    } finally {
      setIsLoading(false);
      setActiveProvider(null);
    }
  };

  // Abre el popup real de Google con selector de cuenta (usando el SDK GIS ya cargado).
  // Flujo: token de acceso -> userinfo -> login en el backend con email/name/avatar.
  const openGoogleAccountChooser = (clientId: string) => {
    const tokenClient = window.google!.accounts.oauth2!.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: async (tokenResponse: any) => {
        if (tokenResponse.error) {
          setIsLoading(false);
          setActiveProvider(null);
          setErrorMessage(`Google devolvió un error: ${tokenResponse.error}`);
          return;
        }
        try {
          const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          });
          if (!profileRes.ok) {
            throw new Error('No se pudo obtener tu perfil de Google');
          }
          const profile = await profileRes.json();
          await executeOAuthBackendLogin(
            'google',
            profile.name || profile.email,
            profile.email,
            profile.picture,
          );
        } catch (err: any) {
          console.error('Error obteniendo perfil de Google:', err);
          setErrorMessage(err.message || 'No se pudo obtener tu perfil de Google');
          setIsLoading(false);
          setActiveProvider(null);
        }
      },
    });
    tokenClient.requestAccessToken();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LogIn size={22} style={{ color: 'var(--accent-cyan)' }} />
            <h2 className="modal-title">Iniciar Sesión con OAuth</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Selecciona tu proveedor de identidad preferido para ingresar a tu álbum y colaborar con tus asociados.
        </p>

        {errorMessage && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.75rem', 
            borderRadius: '0.5rem', 
            background: 'rgba(239, 68, 68, 0.15)', 
            border: '1px solid rgba(239, 68, 68, 0.3)', 
            color: '#EF4444', 
            fontSize: '0.85rem',
            marginBottom: '1rem' 
          }}>
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Botones de Proveedores OAuth Exclusivos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem' }}>
          {/* Google OAuth */}
          <button 
            type="button" 
            className="btn-secondary"
            onClick={() => handleOAuthLogin('google')}
            disabled={isLoading}
            style={{ 
              width: '100%', 
              justify: 'center', 
              background: '#FFFFFF', 
              color: '#1F2937', 
              fontWeight: 700,
              padding: '0.75rem 1rem'
            }}
          >
            {isLoading && activeProvider === 'google' ? (
              <Loader2 size={18} className="animate-spin" style={{ color: '#4285F4' }} />
            ) : (
              <ShieldCheck size={18} style={{ color: '#4285F4' }} />
            )}
            <span>{isLoading && activeProvider === 'google' ? 'Conectando con Google...' : 'Continuar con Google'}</span>
          </button>

          {/* Facebook OAuth */}
          <button 
            type="button" 
            className="btn-secondary"
            onClick={() => handleOAuthLogin('facebook')}
            disabled={isLoading}
            style={{ 
              width: '100%', 
              justify: 'center', 
              background: '#1877F2', 
              color: '#FFFFFF', 
              borderColor: '#1877F2',
              fontWeight: 700,
              padding: '0.75rem 1rem'
            }}
          >
            {isLoading && activeProvider === 'facebook' ? (
              <Loader2 size={18} className="animate-spin" style={{ color: '#FFFFFF' }} />
            ) : (
              <Facebook size={18} style={{ color: '#FFFFFF' }} />
            )}
            <span>{isLoading && activeProvider === 'facebook' ? 'Conectando con Facebook...' : 'Continuar con Facebook'}</span>
          </button>

          {/* GitHub OAuth */}
          <button 
            type="button" 
            className="btn-secondary"
            onClick={() => handleOAuthLogin('github')}
            disabled={isLoading}
            style={{ 
              width: '100%', 
              justify: 'center', 
              background: '#24292E', 
              color: '#FFFFFF', 
              borderColor: '#24292E',
              fontWeight: 700,
              padding: '0.75rem 1rem'
            }}
          >
            {isLoading && activeProvider === 'github' ? (
              <Loader2 size={18} className="animate-spin" style={{ color: '#FFFFFF' }} />
            ) : (
              <Github size={18} style={{ color: '#FFFFFF' }} />
            )}
            <span>{isLoading && activeProvider === 'github' ? 'Conectando con GitHub...' : 'Continuar con GitHub'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};


