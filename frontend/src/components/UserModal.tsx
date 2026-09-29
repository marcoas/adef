'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, User, Mail, Globe, Users, Trash2, Copy, Check, 
  Share2, Plus, AlertCircle, Loader2, LogOut, ShieldCheck, Link2, Bell
} from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface UserSession {
  email: string;
  name: string;
  avatarUrl?: string;
}

interface Invite {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
  usedAt: string | null;
  isValid: boolean;
}

interface AlbumMember {
  id: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  userSession: UserSession | null;
  onLogout: () => void;
  onOpenInviteModal?: () => void;
}

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  onClose,
  locale,
  setLocale,
  userSession,
  onLogout,
}) => {
  const t = getTranslation(locale);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<AlbumMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  // Issue #34: preferencia de avisos de actividad del álbum
  const [notifyAlbumActivity, setNotifyAlbumActivity] = useState(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  // Issue #39: historial de invitaciones (aceptadas/vencidas + fotos aportadas)
  interface InviteLogEntry {
    id: string;
    createdAt: string;
    expiresAt: string;
    usedAt: string | null;
    status: 'accepted' | 'expired' | 'pending';
    usedBy: { id: string; name: string; email: string } | null;
    stickersAdded: number;
  }
  const [inviteLog, setInviteLog] = useState<InviteLogEntry[]>([]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const authHeaders = useCallback((): Record<string, string> => {
    const jwtToken = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
    return jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {};
  }, []);

  const loadData = useCallback(async () => {
    if (!userSession) return;
    setIsLoading(true);
    try {
      const [invitesRes, membersRes, prefsRes, logRes] = await Promise.all([
        fetch(`${apiUrl}/album/invites`, { headers: authHeaders() }),
        fetch(`${apiUrl}/album/members`, { headers: authHeaders() }),
        // Issue #34: preferencia de avisos de actividad del álbum
        fetch(`${apiUrl}/users/me/preferences`, { headers: authHeaders() }),
        // Issue #39: historial de invitaciones cerca del gestor de invitaciones
        fetch(`${apiUrl}/invites/log`, { headers: authHeaders() }),
      ]);

      if (invitesRes.ok) {
        const invData = await invitesRes.json();
        setInvites(invData.invites || []);
      }
      if (membersRes.ok) {
        const memData = await membersRes.json();
        setMembers(memData.members || []);
      }
      if (prefsRes.ok) {
        const prefsData = await prefsRes.json();
        if (typeof prefsData.notifyOnAlbumActivity === 'boolean') {
          setNotifyAlbumActivity(prefsData.notifyOnAlbumActivity);
        }
      }
      if (logRes.ok) {
        const logData = await logRes.json();
        setInviteLog(logData.log || []);
      }
    } catch (err) {
      console.error('Error cargando datos del panel de usuario:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, authHeaders, userSession]);

  useEffect(() => {
    if (isOpen) {
      setActionMsg(null);
      loadData();
    }
  }, [isOpen, loadData]);

  // Issue #34: activar/desactivar los avisos de actividad del álbum
  const toggleNotifyAlbumActivity = async () => {
    if (isSavingPrefs) return;
    const nextValue = !notifyAlbumActivity;
    const previousValue = notifyAlbumActivity;

    setIsSavingPrefs(true);
    setNotifyAlbumActivity(nextValue);
    setActionMsg(null);

    try {
      const res = await fetch(`${apiUrl}/users/me/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ notifyOnAlbumActivity: nextValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la preferencia.');

      setActionMsg({
        type: 'success',
        text: nextValue ? t.notificationsOn : t.notificationsOff,
      });
    } catch (err) {
      setNotifyAlbumActivity(previousValue);
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar la preferencia.',
      });
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleCreateInvite = async () => {
    setIsCreating(true);
    setActionMsg(null);
    try {
      const res = await fetch(`${apiUrl}/album/invites`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo generar la invitación.');
      setInvites((prev) => [{ ...data.invite, isValid: true }, ...prev]);
      setActionMsg({ type: 'success', text: '¡Nueva invitación generada con éxito!' });
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al crear invitación.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`${apiUrl}/album/invites/${inviteId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo revocar la invitación.');
      }
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      setActionMsg({ type: 'success', text: t.revokedSuccess });
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al revocar.',
      });
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    try {
      const res = await fetch(`${apiUrl}/album/members/${memberUserId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo remover al asociado.');
      }
      setMembers((prev) => prev.filter((m) => m.user.id !== memberUserId));
      setActionMsg({ type: 'success', text: 'Asociado removido del álbum.' });
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al remover asociado.',
      });
    }
  };

  const copyLink = async (invite: Invite) => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopiedToken(invite.token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setActionMsg({ type: 'error', text: 'No se pudo copiar el link.' });
    }
  };

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
        // Ignorar cancelación del usuario
      }
    }
    copyLink(invite);
  };

  if (!isOpen || !userSession) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card user-panel-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header Modal */}
        <div className="modal-header" style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ background: 'rgba(0, 242, 254, 0.15)', padding: '6px', borderRadius: 'var(--radius-sm)', color: 'var(--accent-cyan)' }}>
              <User size={20} />
            </div>
            <h2 className="modal-title">{t.userPanel}</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
          {/* Alertas */}
          {actionMsg && (
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                padding: '0.65rem 0.85rem', 
                borderRadius: 'var(--radius-sm)', 
                background: actionMsg.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', 
                border: `1px solid ${actionMsg.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, 
                color: actionMsg.type === 'error' ? '#EF4444' : '#10B981', 
                fontSize: '0.85rem', 
                marginBottom: '1rem' 
              }}
            >
              <AlertCircle size={16} />
              <span>{actionMsg.text}</span>
            </div>
          )}

          {/* Tarjeta de Perfil */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0F19', fontWeight: 800, fontSize: '1.25rem', overflow: 'hidden' }}>
                {userSession.avatarUrl ? (
                  <img src={userSession.avatarUrl} alt={userSession.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  userSession.name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{userSession.name}</h3>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Mail size={13} /> {userSession.email}
                </p>
              </div>
            </div>

            {/* Selector de idioma */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Globe size={16} style={{ color: 'var(--accent-cyan)' }} />
              <button
                type="button"
                className={`filter-pill ${locale === 'es' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                onClick={() => setLocale('es')}
              >
                ES
              </button>
              <button
                type="button"
                className={`filter-pill ${locale === 'en' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                onClick={() => setLocale('en')}
              >
                EN
              </button>
            </div>
          </div>

          {/* Issue #34: preferencia de avisos de actividad del álbum */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <Bell size={16} style={{ color: 'var(--accent-amber)' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{t.notificationSettings}</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              {t.notificationSettingsDesc}
            </p>
            <button
              type="button"
              className="notification-pref-toggle"
              data-enabled={notifyAlbumActivity}
              onClick={toggleNotifyAlbumActivity}
              disabled={isSavingPrefs}
              role="switch"
              aria-checked={notifyAlbumActivity}
            >
              <span className="notification-pref-knob" />
              <span className="notification-pref-label">
                {isSavingPrefs ? <Loader2 size={13} className="spin" /> : null}
                {notifyAlbumActivity ? t.notificationsOn : t.notificationsOff}
              </span>
            </button>
          </div>

          {/* Sección de Invitaciones y Asociados */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={16} style={{ color: 'var(--accent-cyan)' }} />
                {t.manageInvites}
              </h4>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', gap: '0.35rem' }} 
                onClick={handleCreateInvite}
                disabled={isCreating}
              >
                {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>{t.invitePartner}</span>
              </button>
            </div>

            {/* Listado de Asociados Aceptados */}
            {members.length > 0 && (
              <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldCheck size={14} style={{ color: 'var(--accent-emerald)' }} />
                  {t.associatesList} ({members.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {members.map((m) => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{m.user.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.user.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.user.id)}
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
                        title={t.removeAssociate}
                      >
                        <Trash2 size={13} />
                        <span>{t.revoke}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Listado de Links de Invitación (con opción de revocar) */}
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Link2 size={14} />
                Links de invitación generados
              </div>

              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <Loader2 size={16} className="animate-spin" style={{ marginRight: '0.5rem' }} />
                  Cargando...
                </div>
              ) : invites.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No tenés links de invitación activos. Generá uno para compartir tu álbum.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {invites.map((invite) => (
                    <div 
                      key={invite.id} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: invite.isValid ? 'rgba(0,242,254,0.04)' : 'rgba(255,255,255,0.02)', 
                        border: `1px solid ${invite.isValid ? 'rgba(0,242,254,0.2)' : 'var(--border-color)'}`, 
                        borderRadius: 'var(--radius-sm)', 
                        padding: '0.5rem 0.75rem',
                        gap: '0.5rem',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                          <span style={{ 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            fontSize: '0.7rem', 
                            fontWeight: 700, 
                            background: invite.isValid ? 'rgba(16,185,129,0.2)' : 'rgba(107,114,128,0.2)', 
                            color: invite.isValid ? '#10B981' : 'var(--text-muted)' 
                          }}>
                            {invite.isValid ? 'Activo' : invite.usedAt ? 'Usado' : 'Vencido'}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Vence: {new Date(invite.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ fontFamily: 'Space Mono', fontSize: '0.75rem', color: 'var(--text-primary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ...{invite.token.slice(-12)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        {invite.isValid && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => copyLink(invite)}
                              title="Copiar link"
                            >
                              {copiedToken === invite.token ? <Check size={13} style={{ color: '#22C55E' }} /> : <Copy size={13} />}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => shareLink(invite)}
                              title="Compartir"
                            >
                              <Share2 size={13} />
                            </button>
                          </>
                        )}
                        {/* Botón Revocar Invitación */}
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', color: '#EF4444', borderColor: 'rgba(239,68,68,0.25)' }}
                          onClick={() => handleRevokeInvite(invite.id)}
                          title="Revocar esta invitación"
                        >
                          <Trash2 size={13} />
                          <span>{t.revoke}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Issue #39: historial de invitaciones (fecha + fotos aportadas) */}
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Link2 size={14} />
                {t.inviteLog}
              </div>
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <Loader2 size={16} className="animate-spin" style={{ marginRight: '0.5rem' }} />
                  Cargando...
                </div>
              ) : inviteLog.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {t.inviteLogEmpty}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {inviteLog.map((entry) => (
                    <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.usedBy ? entry.usedBy.name : '—'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {entry.status === 'accepted' && entry.usedAt
                            ? `${t.inviteAccepted} · ${new Date(entry.usedAt).toLocaleDateString()} · ${entry.stickersAdded} ${t.inviteLogStickers}`
                            : entry.status === 'expired'
                              ? `${t.inviteExpired} · ${new Date(entry.expiresAt).toLocaleDateString()}`
                              : `${t.invitePending} · ${locale === 'en' ? 'expires' : 'vence'} ${new Date(entry.expiresAt).toLocaleDateString()}`}
                        </div>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.75rem', color: entry.status === 'accepted' ? '#10B981' : 'var(--text-muted)', flexShrink: 0 }}>
                        {entry.status === 'accepted' ? t.inviteAccepted : entry.status === 'expired' ? t.inviteExpired : t.invitePending}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Modal con Logout */}
        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              onClose();
              onLogout();
            }}
            style={{ color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}
          >
            <LogOut size={16} />
            <span>{t.logout}</span>
          </button>

          <button type="button" className="btn-secondary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
