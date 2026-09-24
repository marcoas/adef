'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Users, Link2, Copy, Check, Loader2, Share2, AlertCircle, Plus, Clock } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface Invite {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
  usedAt: string | null;
  isValid: boolean;
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, locale }) => {
  const t = getTranslation(locale);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const authHeaders = useCallback((): Record<string, string> => {
    const jwtToken = localStorage.getItem('jwt_token');
    return jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {};
  }, []);

  const loadInvites = useCallback(async () => {
    if (!localStorage.getItem('jwt_token')) return;
    try {
      const res = await fetch(`${apiUrl}/album/invites`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch (err) {
      console.error('Error al cargar invitaciones:', err);
    }
  }, [apiUrl, authHeaders]);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      loadInvites();
    }
  }, [isOpen, loadInvites]);

  const createInvite = async () => {
    if (!localStorage.getItem('jwt_token')) {
      setErrorMsg('Debés iniciar sesión para invitar asociados.');
      return;
    }

    setIsCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiUrl}/album/invites`, { method: 'POST', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo generar el link');
      // El link recién creado siempre es válido (el backend no devuelve isValid en el POST)
      setInvites((prev) => [{ ...data.invite, isValid: true }, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo generar el link');
    } finally {
      setIsCreating(false);
    }
  };

  const copyLink = async (invite: Invite) => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopiedToken(invite.token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setErrorMsg('No se pudo copiar el link. Copialo manualmente.');
    }
  };

  // Issue #12: en el celular se abre el selector nativo para compartir
  const shareLink = async (invite: Invite) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Te invito a completar mi álbum de patentes',
          text: 'Completemos juntos el álbum de patentes. Entrá con este link:',
          url: invite.url,
        });
        return;
      } catch {
        // el usuario canceló: se ignora
      }
    }
    copyLink(invite);
  };

  if (!isOpen) return null;

  const activeInvite = invites.find((i) => i.isValid);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} style={{ color: 'var(--accent-cyan)' }} />
            <h2 className="modal-title">{t.invitePartner}</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Generá un link único de un solo uso y compartilo con quien quieras. Quien lo use queda
            como invitado: puede ver y cargar fotos, pero no eliminar.
          </p>

          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeInvite && (
            <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.85rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--accent-cyan)', marginBottom: '0.5rem' }}>
                <Link2 size={14} />
                Link activo · vence {new Date(activeInvite.expiresAt).toLocaleDateString()}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  readOnly
                  value={activeInvite.url}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: '1 1 220px', padding: '0.55rem 0.7rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'Space Mono' }}
                />
                <button type="button" className="btn-secondary" style={{ padding: '0.55rem 0.7rem' }} onClick={() => copyLink(activeInvite)}>
                  {copiedToken === activeInvite.token ? <Check size={16} style={{ color: '#22C55E' }} /> : <Copy size={16} />}
                  <span>{copiedToken === activeInvite.token ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button type="button" className="btn-primary" style={{ padding: '0.55rem 0.7rem' }} onClick={() => shareLink(activeInvite)}>
                  <Share2 size={16} />
                  <span>Compartir</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                <a className="btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem' }} href={`https://wa.me/?text=${encodeURIComponent(`Te invito a completar mi álbum de patentes: ${activeInvite.url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <a className="btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem' }} href={`mailto:?subject=${encodeURIComponent('Invitación al álbum de patentes')}&body=${encodeURIComponent(activeInvite.url)}`}>Email</a>
              </div>
            </div>
          )}

          <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem' }} onClick={createInvite} disabled={isCreating}>
            {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>{isCreating ? 'Generando...' : 'Generar nuevo link de un solo uso'}</span>
          </button>

          {invites.length > 0 && (
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={13} /> Últimos links generados
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '140px', overflowY: 'auto' }}>
                {invites.map((invite) => (
                  <li key={invite.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem', color: invite.isValid ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                    <span style={{ fontFamily: 'Space Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ...{invite.token.slice(-10)}
                    </span>
                    <span style={{ flexShrink: 0 }}>
                      {invite.isValid ? 'Activo' : invite.usedAt ? 'Usado' : 'Vencido'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
