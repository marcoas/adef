'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Loader2, AlertCircle, CheckCircle2, LogIn } from 'lucide-react';
import { LoginModal } from '../../../components/LoginModal';

interface InvitePreview {
  albumTitle: string;
  ownerName: string;
  isValid: boolean;
  used: boolean;
  expired: boolean;
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token as string;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/invites/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'La invitación no es válida.');
          setStatus('error');
          return;
        }
        setPreview(data);
        setStatus('ready');
      } catch {
        setErrorMsg('No se pudo validar la invitación.');
        setStatus('error');
      }
    })();
  }, [token, apiUrl]);

  // Si el invitado no tiene sesión, primero debe registrarse/iniciar sesión
  const handleAccept = async () => {
    const jwtToken = localStorage.getItem('jwt_token');
    if (!jwtToken) {
      setIsLoginOpen(true);
      return;
    }

    setIsAccepting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiUrl}/invites/${token}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo aceptar la invitación');

      setAccepted(true);
      setTimeout(() => router.push('/'), 1200);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo aceptar la invitación');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="modal-card" style={{ maxWidth: '440px', width: '100%' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} style={{ color: 'var(--accent-cyan)' }} />
            <h2 className="modal-title">Invitación a un álbum</h2>
          </div>
        </div>

        <div className="modal-body">
          {status === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
              <Loader2 size={18} className="animate-spin" />
              <span>Validando invitación...</span>
            </div>
          )}

          {status === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#EF4444' }}>
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {status === 'ready' && preview && !accepted && (
            <>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                <strong>{preview.ownerName}</strong> te invitó a completar el álbum{' '}
                <strong>{preview.albumTitle}</strong> juntos.
              </p>

              {!preview.isValid && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#EF4444', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  <AlertCircle size={16} />
                  <span>{preview.used ? 'Esta invitación ya fue utilizada.' : 'Esta invitación expiró.'}</span>
                </div>
              )}

              {errorMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#EF4444', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  <AlertCircle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleAccept}
                disabled={!preview.isValid || isAccepting}
              >
                {isAccepting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                <span>{isAccepting ? 'Uniéndome...' : 'Aceptar invitación'}</span>
              </button>
            </>
          )}

          {accepted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22C55E', fontSize: '0.9rem' }}>
              <CheckCircle2 size={18} />
              <span>¡Listo! Te uniste al álbum. Redirigiendo...</span>
            </div>
          )}
        </div>
      </div>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        locale="es"
        onLoginSuccess={() => {
          setIsLoginOpen(false);
          // Issue #12: tras el login se acepta la invitación con la sesión nueva
          setTimeout(() => handleAccept(), 300);
        }}
      />
    </main>
  );
}
