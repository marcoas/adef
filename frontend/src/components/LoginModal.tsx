'use client';

/**
 * Modal de inicio de sesión (#6).
 * Único método habilitado: OAuth con Google (Google Identity Services).
 * Maneja carga y errores y, al autenticar con éxito, persiste `jwt_token` y
 * `user_session` en localStorage antes de notificar al padre vía
 * onLoginSuccess.
 */

import React, { useState, useEffect } from 'react';
import { X, LogIn, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useLocale } from '../lib/LocaleContext';
import { apiFetch, readJson } from '../lib/api';
import { saveSession } from '../lib/session';
import type { UserSession } from '../types/domain';
import { Modal } from './Modal';

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
  onLoginSuccess: (user: UserSession) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const { t } = useLocale();
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

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setActiveProvider('google');
    setErrorMessage(null);

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
  };

  // El backend verifica el access token con Google y toma de ahí la identidad
  // (email, nombre y foto); el cliente nunca envía datos de usuario sueltos.
  const executeOAuthBackendLogin = async (accessToken: string) => {
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        json: { accessToken },
      });
      const data = await readJson<{ token?: string; user?: UserSession; error?: string }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'Error al autenticar con Google');
      }
      saveSession(data.token, data.user);
      if (data.user) onLoginSuccess(data.user);
      onClose();
    } catch (err: any) {
      console.error('Error OAuth google:', err);
      setErrorMessage(err.message || 'No se pudo completar el login con Google');
    } finally {
      setIsLoading(false);
      setActiveProvider(null);
    }
  };

  // Abre el popup real de Google con selector de cuenta (usando el SDK GIS ya cargado).
  // Flujo: token de acceso -> login en el backend, que lo verifica con Google.
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
        await executeOAuthBackendLogin(tokenResponse.access_token);
      },
    });
    tokenClient.requestAccessToken();
  };

  return (
    <Modal onClose={onClose}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LogIn size={22} style={{ color: 'var(--accent-cyan)' }} />
            <h2 className="modal-title">Iniciar Sesión</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Inicia sesión con tu cuenta de Google para acceder a tu álbum y colaborar con tus asociados.
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

        {/* Botón de inicio de sesión con Google */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem' }}>
          {/* Google OAuth */}
          <button 
            type="button" 
            className="btn-secondary"
            onClick={handleGoogleLogin}
            disabled={isLoading}
                        style={{ 
              width: '100%', 
              justifyContent: 'center', 
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
        </div>
    </Modal>
  );
};


