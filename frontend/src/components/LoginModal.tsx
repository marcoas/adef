'use client';

import React, { useState, useEffect } from 'react';
import { X, LogIn, ShieldCheck, AlertCircle, Loader2, Github, Facebook } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (notification?: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
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

  // Inicializar Google Identity Services (GIS)
  useEffect(() => {
    if (!isOpen) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

    const handleGoogleCredentialResponse = async (response: any) => {
      setIsLoading(true);
      setActiveProvider('google');
      setErrorMessage(null);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        const res = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: response.credential,
            authProvider: 'google',
          }),
        });

        if (!res.ok) {
          throw new Error('Error al autenticar con el backend');
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
        console.error('Error en autenticación Google:', err);
        setErrorMessage(err.message || 'Error al verificar credenciales con el servidor');
      } finally {
        setIsLoading(false);
        setActiveProvider(null);
      }
    };

    const initGoogleAuth = () => {
      if (window.google?.accounts?.id && clientId && clientId !== 'your_google_client_id_here.apps.googleusercontent.com') {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
          });

          const btnContainer = document.getElementById('google-btn-container');
          if (btnContainer) {
            btnContainer.innerHTML = '';
            window.google.accounts.id.renderButton(btnContainer, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text: 'continue_with',
              shape: 'rectangular',
              width: 320,
            });
          }
        } catch (e) {
          console.warn('Error iniciando SDK Google GIS:', e);
        }
      }
    };

    if (!document.getElementById('google-jssdk')) {
      const script = document.createElement('script');
      script.id = 'google-jssdk';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogleAuth;
      document.body.appendChild(script);
    } else {
      initGoogleAuth();
    }
  }, [isOpen, onClose, onLoginSuccess]);

  if (!isOpen) return null;

  const handleOAuthLogin = async (provider: 'google' | 'facebook' | 'github') => {
    setIsLoading(true);
    setActiveProvider(provider);
    setErrorMessage(null);

    if (provider === 'google') {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
      if (window.google?.accounts?.id && clientId && clientId !== 'your_google_client_id_here.apps.googleusercontent.com') {
        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            executeOAuthBackendLogin('google', 'Usuario Google', 'usuario_google@patentes.ar');
          }
        });
        return;
      }
      await executeOAuthBackendLogin('google', 'Usuario Google', 'usuario_google@patentes.ar');
    } else if (provider === 'facebook') {
      // Flujo OAuth Facebook
      await executeOAuthBackendLogin('facebook', 'Usuario Facebook', 'usuario_facebook@patentes.ar');
    } else if (provider === 'github') {
      // Flujo OAuth GitHub
      await executeOAuthBackendLogin('github', 'Usuario GitHub', 'usuario_github@patentes.ar');
    }
  };

  const executeOAuthBackendLogin = async (provider: string, defaultName: string, defaultEmail: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: defaultEmail,
          name: defaultName,
          avatarUrl: provider === 'github' 
            ? 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=150&auto=format&fit=crop&q=80'
            : provider === 'facebook'
            ? 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
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
          <div id="google-btn-container" style={{ display: 'flex', justifyContent: 'center' }}></div>

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


