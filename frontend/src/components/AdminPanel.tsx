'use client';

// Issue #41: Panel privado de administración (solo administradores).
// Se abre desde el Panel de Usuario y consume:
//   GET    /api/admin/dashboard          → totales, 14 días, uso de API, actividad
//   GET    /api/admin/users              → listado buscable con información de álbumes
//   GET    /api/admin/users/:id/album    → ver el álbum de otro usuario
//   PATCH  /api/admin/users/:id          → isAdmin y/o status (ACTIVE/RESTRICTED)
//   DELETE /api/admin/users/:id          → cancelación total del usuario
import React, { useState, useEffect, useCallback } from 'react';
import {
  X, ShieldCheck, LayoutDashboard, Users, Search, AlertCircle, Loader2,
  Ban, CheckCircle2, Trash2, Eye, ChevronLeft, User as UserIcon, Mail,
  Activity, KeyRound, UserX, BookOpen, Image as ImageIcon,
} from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  currentUserId?: string | null;
}

interface AdminMember {
  id: string;
  role: string;
  joinedAt: string;
  user: { id: string; name: string; email: string; avatarUrl?: string | null };
}

interface AdminOwnedAlbum {
  id: string;
  title: string;
  createdAt: string;
  members: AdminMember[];
}

interface AdminMembership {
  role: string;
  joinedAt: string;
  album: { id: string; title: string; ownerId: string; owner: { name: string; email: string } };
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  isAdmin: boolean;
  status: 'ACTIVE' | 'RESTRICTED';
  lastLoginAt: string | null;
  createdAt: string;
  ownedAlbums: AdminOwnedAlbum[];
  memberships: AdminMembership[];
  _count: { stickers: number };
}

interface ApiUsageEntry {
  route: string;
  requests: number;
  errors: number;
  byDay: Record<string, number>;
}

interface RecentActivity {
  id: string;
  userName: string;
  slotNumber: number;
  action: 'PASTE' | 'UNPASTE';
  createdAt: string;
  album: { title: string } | null;
}

interface DashboardData {
  totals: { users: number; albums: number; stickers: number; restrictedUsers: number; adminUsers: number };
  last14Days: { day: string; users: number; stickers: number }[];
  apiUsage: ApiUsageEntry[];
  recentActivity: RecentActivity[];
  generatedAt: string;
}

interface UserAlbumData {
  user: { id: string; name: string; email: string; avatarUrl?: string | null };
  album: { id: string; title: string } | null;
  memberCount: number;
  members: AdminMember[];
  stickers: {
    id: string;
    slotNumber: number;
    imageUrl: string;
    thumbnailUrl: string | null;
    uploadedBy: { name: string };
  }[];
}

const padSlot = (n: number) => String(n).padStart(3, '0');

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, locale, currentUserId }) => {
  const t = getTranslation(locale);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const [tab, setTab] = useState<'dashboard' | 'users'>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [albumView, setAlbumView] = useState<{ userId: string; data: UserAlbumData | null; loading: boolean } | null>(null);

  const authHeaders = useCallback((): Record<string, string> => ({
    Authorization: `Bearer ${localStorage.getItem('jwt_token') || ''}`,
  }), []);

  // Carga dashboard + usuarios cada vez que se abre el panel (datos frescos)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setActionMsg(null);
    setAlbumView(null);
    setSearch('');
    setTab('dashboard');
    const run = async () => {
      try {
        const [dashRes, usersRes] = await Promise.all([
          fetch(`${apiUrl}/admin/dashboard`, { headers: authHeaders() }),
          fetch(`${apiUrl}/admin/users`, { headers: authHeaders() }),
        ]);
        if (dashRes.ok) setDashboard((await dashRes.json()) as DashboardData);
        if (usersRes.ok) {
          const data = (await usersRes.json()) as { users: AdminUser[] };
          setUsers(data.users || []);
        }
      } catch (err) {
        console.error('Error al cargar el panel de administración:', err);
        if (!cancelled) setActionMsg({ type: 'error', text: t.adminActionError });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Refresca el listado de usuarios cada vez que se activa la pestaña
  // "Usuarios" (para capturar cuentas creadas/eliminadas fuera del panel)
  useEffect(() => {
    if (!isOpen || tab !== 'users') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/admin/users`, { headers: authHeaders() });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { users: AdminUser[] };
          setUsers(data.users || []);
        }
      } catch (err) {
        console.error('Error refrescando usuarios:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isOpen]);

  // PATCH de usuario (rol admin y/o estado). El backend rechaza modificar al
  // propio admin y revocar el rol al último admin (se muestra su error).
  const patchUser = async (
    userId: string,
    payload: { isAdmin?: boolean; status?: 'ACTIVE' | 'RESTRICTED' },
    successText: string,
  ) => {
    setBusyUserId(userId);
    setActionMsg(null);
    try {
      const res = await fetch(`${apiUrl}/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || t.adminActionError);
      setUsers((prev) => prev.map((u) => (u.id === userId
        ? {
          ...u,
          isAdmin: typeof payload.isAdmin === 'boolean' ? payload.isAdmin : u.isAdmin,
          status: payload.status || u.status,
        }
        : u)));
      setActionMsg({ type: 'success', text: successText });
    } catch (err) {
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : t.adminActionError });
    } finally {
      setBusyUserId(null);
    }
  };

  // Cancelación total: elimina usuario + álbum + figuritas + imágenes (backend)
  const deleteUser = async (user: AdminUser) => {
    const ok = window.confirm(`${t.adminDeleteConfirm} ${user.name} (${user.email})? ${t.adminDeleteHint}`);
    if (!ok) return;
    setBusyUserId(user.id);
    setActionMsg(null);
    try {
      const res = await fetch(`${apiUrl}/admin/users/${user.id}`, { method: 'DELETE', headers: authHeaders() });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || t.adminActionError);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setActionMsg({ type: 'success', text: t.adminDeleteSuccess });
    } catch (err) {
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : t.adminActionError });
    } finally {
      setBusyUserId(null);
    }
  };

  // Ver el álbum de otro usuario (miembros + figuritas)
  const openUserAlbum = async (userId: string) => {
    setActionMsg(null);
    setAlbumView({ userId, data: null, loading: true });
    try {
      const res = await fetch(`${apiUrl}/admin/users/${userId}/album`, { headers: authHeaders() });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || t.adminActionError);
      }
      const data = (await res.json()) as UserAlbumData;
      setAlbumView({ userId, data, loading: false });
    } catch (err) {
      setAlbumView(null);
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : t.adminActionError });
    }
  };

  if (!isOpen) return null;

  const query = search.trim().toLowerCase();
  const filteredUsers = users.filter(
    (u) => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query),
  );
  const maxDaily = dashboard
    ? Math.max(1, ...dashboard.last14Days.map((d) => Math.max(d.users, d.stickers)))
    : 1;
  const totals = dashboard?.totals;
  const totalsConfig = totals
    ? [
      { label: t.adminTotalUsers, value: totals.users, icon: <Users size={15} /> },
      { label: t.adminTotalAlbums, value: totals.albums, icon: <BookOpen size={15} /> },
      { label: t.adminTotalStickers, value: totals.stickers, icon: <ImageIcon size={15} /> },
      { label: t.adminTotalRestricted, value: totals.restrictedUsers, icon: <Ban size={15} /> },
      { label: t.adminTotalAdmins, value: totals.adminUsers, icon: <ShieldCheck size={15} /> },
    ]
    : [];

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    padding: '0.9rem 1rem',
    marginBottom: '1rem',
  };
  const cardTitle = (icon: React.ReactNode, label: string) => (
    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {icon}
      {label}
    </div>
  );
  const badge = (label: string, color: string, bg: string) => (
    <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '999px', color, background: bg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </span>
  );
  const smallBtn: React.CSSProperties = {
    padding: '0.35rem 0.65rem',
    fontSize: '0.75rem',
    gap: '0.35rem',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '980px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <div style={{ background: 'rgba(0, 242, 254, 0.15)', padding: '6px', borderRadius: 'var(--radius-sm)', color: 'var(--accent-cyan)' }}>
              <ShieldCheck size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="modal-title">{t.adminPanel}</h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.adminPanelDesc}
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button type="button" className={`filter-pill ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            <LayoutDashboard size={14} />
            <span>{t.adminTabDashboard}</span>
          </button>
          <button type="button" className={`filter-pill ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            <Users size={14} />
            <span>{t.adminTabUsers}</span>
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
          {actionMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: actionMsg.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', border: `1px solid ${actionMsg.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, color: actionMsg.type === 'error' ? '#EF4444' : '#10B981', fontSize: '0.85rem', marginBottom: '1rem' }}>
              <AlertCircle size={16} />
              <span>{actionMsg.text}</span>
            </div>
          )}

          {loading && !dashboard && users.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '3rem 0', color: 'var(--text-secondary)' }}>
              <Loader2 size={20} className="animate-spin" />
              <span>{t.adminLoading}</span>
            </div>
          ) : tab === 'dashboard' ? (
            <>
              {/* Tarjetas de totales */}
              {dashboard && totals && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  {totalsConfig.map((item) => (
                    <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.8rem 0.9rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span style={{ color: 'var(--accent-cyan)' }}>{item.icon}</span>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Gráfico 14 días */}
              {dashboard && (
                <div style={card}>
                  {cardTitle(<Activity size={14} style={{ color: 'var(--accent-cyan)' }} />, t.adminLast14Days)}
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-cyan)', display: 'inline-block' }} />
                      {t.adminChartUsers}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-amber)', display: 'inline-block' }} />
                      {t.adminChartStickers}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100px' }}>
                    {dashboard.last14Days.map((d) => (
                      <div
                        key={d.day}
                        title={`${d.day} — ${d.users} ${t.adminChartUsers} / ${d.stickers} ${t.adminChartStickers}`}
                        style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100%' }}
                      >
                        <div style={{ flex: 1, height: `${(d.users / maxDaily) * 100}%`, background: 'var(--accent-cyan)', borderRadius: '2px', opacity: d.users > 0 ? 1 : 0 }} />
                        <div style={{ flex: 1, height: `${(d.stickers / maxDaily) * 100}%`, background: 'var(--accent-amber)', borderRadius: '2px', opacity: d.stickers > 0 ? 1 : 0 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                    <span>{dashboard.last14Days[0]?.day}</span>
                    <span>{dashboard.last14Days[dashboard.last14Days.length - 1]?.day}</span>
                  </div>
                </div>
              )}

              {/* Uso de la API */}
              {dashboard && (
                <div style={card}>
                  {cardTitle(<LayoutDashboard size={14} style={{ color: 'var(--accent-cyan)' }} />, t.adminApiUsage)}
                  {dashboard.apiUsage.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.adminApiEmpty}</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '0.4rem 0.5rem' }}>{t.adminApiRoute}</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{t.adminApiRequests}</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{t.adminApiErrors}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard.apiUsage.map((row) => (
                            <tr key={row.route} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.route}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>{row.requests}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: row.errors > 0 ? '#EF4444' : 'var(--text-muted)' }}>{row.errors}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Actividad reciente */}
              {dashboard && (
                <div style={{ ...card, marginBottom: 0 }}>
                  {cardTitle(<Activity size={14} style={{ color: 'var(--accent-cyan)' }} />, t.adminRecentActivity)}
                  {dashboard.recentActivity.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.adminRecentActivityEmpty}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {dashboard.recentActivity.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.action === 'PASTE' ? 'var(--accent-cyan)' : '#EF4444', flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{a.userName}</span>
                          <span>{a.action === 'PASTE' ? t.activityPasted : t.activityUnpasted}</span>
                          <span>{t.slotLabel} {padSlot(a.slotNumber)}</span>
                          {a.album && <span style={{ color: 'var(--text-muted)' }}>· {a.album.title}</span>}
                          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {new Date(a.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {!albumView && (
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.adminSearchPlaceholder}
                    style={{ width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>
              )}

              {albumView ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setAlbumView(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, padding: '0', marginBottom: '1rem' }}
                  >
                    <ChevronLeft size={15} />
                    {t.adminBackToList}
                  </button>
                  {albumView.loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '2.5rem 0', color: 'var(--text-secondary)' }}>
                      <Loader2 size={20} className="animate-spin" />
                      <span>{t.adminLoading}</span>
                    </div>
                  ) : albumView.data ? (
                    <>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserIcon size={17} style={{ color: 'var(--accent-cyan)' }} />
                        {t.adminAlbumOf} {albumView.data.user.name}
                      </h3>
                      {albumView.data.album ? (
                        <>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            {albumView.data.album.title} · {albumView.data.memberCount} {t.adminAlbumMembers.toLowerCase()}
                          </p>
                          <div style={card}>
                            {cardTitle(<Users size={14} style={{ color: 'var(--accent-cyan)' }} />, t.adminAlbumMembers)}
                            {albumView.data.members.length === 0 ? (
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.adminNoMembers}</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {albumView.data.members.map((m) => (
                                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem' }}>
                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', color: '#0B0F19', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', overflow: 'hidden', flexShrink: 0 }}>
                                      {m.user.avatarUrl ? (
                                        <img src={m.user.avatarUrl} alt={m.user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        m.user.name.charAt(0).toUpperCase()
                                      )}
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                        {m.user.name}
                                        {m.user.id === currentUserId && ` (${t.adminYou})`}
                                      </div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {m.user.email}
                                      </div>
                                    </div>
                                    {badge(
                                      m.role === 'OWNER' ? t.adminRoleOwner : t.adminRoleMember,
                                      m.role === 'OWNER' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                      m.role === 'OWNER' ? 'rgba(0, 242, 254, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ ...card, marginBottom: 0 }}>
                            {cardTitle(
                              <ImageIcon size={14} style={{ color: 'var(--accent-cyan)' }} />,
                              `${t.adminAlbumStickers} (${albumView.data.stickers.length})`,
                            )}
                            {albumView.data.stickers.length === 0 ? (
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.adminNoStickers}</p>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '0.5rem' }}>
                                {albumView.data.stickers.map((s) => (
                                  <div key={s.id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--bg-main)' }}>
                                    <div style={{ aspectRatio: '1 / 1', overflow: 'hidden' }}>
                                      <img
                                        src={s.thumbnailUrl || s.imageUrl}
                                        alt={`${t.slotLabel} ${padSlot(s.slotNumber)}`}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    </div>
                                    <div style={{ padding: '0.3rem 0.4rem', fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                      <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{padSlot(s.slotNumber)}</div>
                                      <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {s.uploadedBy?.name}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={card}>
                          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t.adminNoAlbum}</p>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              ) : filteredUsers.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>
                  {t.adminNoUsers}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const busy = busyUserId === u.id;
                    return (
                      <div
                        key={u.id}
                        style={{
                          background: 'var(--bg-card)',
                          border: `1px solid ${u.status === 'RESTRICTED' ? 'rgba(239,68,68,0.45)' : 'var(--border-color)'}`,
                          borderRadius: 'var(--radius-md)',
                          padding: '0.9rem 1rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flex: 1, minWidth: '230px' }}>
                            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', color: '#0B0F19', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', overflow: 'hidden', flexShrink: 0 }}>
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                u.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</span>
                                {isSelf && badge(t.adminYou, 'var(--accent-cyan)', 'rgba(0, 242, 254, 0.12)')}
                                {u.isAdmin && badge(t.adminBadgeAdmin, 'var(--accent-cyan)', 'rgba(0, 242, 254, 0.12)')}
                                {badge(
                                  u.status === 'RESTRICTED' ? t.adminBadgeRestricted : t.adminBadgeActive,
                                  u.status === 'RESTRICTED' ? '#EF4444' : '#10B981',
                                  u.status === 'RESTRICTED' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                                )}
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                                <Mail size={12} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {t.adminLastLogin}: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : t.adminNeverLogin}
                                {' · '}
                                {u._count.stickers} {t.adminStickersCount}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => openUserAlbum(u.id)}
                              disabled={busy}
                              title={t.adminViewAlbum}
                              style={{ ...smallBtn }}
                            >
                              <Eye size={13} />
                              <span>{t.adminViewAlbum}</span>
                            </button>
                            {!isSelf && (
                              <>
                                {u.status === 'ACTIVE' ? (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => patchUser(u.id, { status: 'RESTRICTED' }, t.adminRestrictSuccess)}
                                    disabled={busy}
                                    title={t.adminRestrict}
                                    style={{ ...smallBtn, color: '#EF4444' }}
                                  >
                                    <Ban size={13} />
                                    <span>{t.adminRestrict}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => patchUser(u.id, { status: 'ACTIVE' }, t.adminReactivateSuccess)}
                                    disabled={busy}
                                    title={t.adminReactivate}
                                    style={{ ...smallBtn, color: '#10B981' }}
                                  >
                                    <CheckCircle2 size={13} />
                                    <span>{t.adminReactivate}</span>
                                  </button>
                                )}
                                {u.isAdmin ? (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => patchUser(u.id, { isAdmin: false }, t.adminRevokeAdminSuccess)}
                                    disabled={busy}
                                    title={t.adminRevokeAdmin}
                                    style={{ ...smallBtn }}
                                  >
                                    <UserX size={13} />
                                    <span>{t.adminRevokeAdmin}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => patchUser(u.id, { isAdmin: true }, t.adminGrantAdminSuccess)}
                                    disabled={busy}
                                    title={t.adminGrantAdmin}
                                    style={{ ...smallBtn }}
                                  >
                                    <KeyRound size={13} />
                                    <span>{t.adminGrantAdmin}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => deleteUser(u)}
                                  disabled={busy}
                                  title={t.adminDelete}
                                  style={{ ...smallBtn, color: '#EF4444' }}
                                >
                                  <Trash2 size={13} />
                                  <span>{t.adminDelete}</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Albumes: propiedad y asociaciones con otros usuarios */}
                        {(u.ownedAlbums.length > 0 || u.memberships.length > 0) && (
                          <div style={{ marginTop: '0.65rem', paddingTop: '0.55rem', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {u.ownedAlbums.map((a) => (
                              <div key={a.id}>
                                <b style={{ color: 'var(--text-primary)' }}>{t.adminOwnerOf}</b> {a.title}
                                {' — '}
                                {a.members.length === 0
                                  ? t.adminNoShares
                                  : `${t.adminSharedWith}: ${a.members.map((m) => m.user.name).join(', ')}`}
                              </div>
                            ))}
                            {u.memberships.map((m) => (
                              <div key={m.album.id}>
                                <b style={{ color: 'var(--text-primary)' }}>{t.adminMemberOf}</b> {m.album.title}
                                {' '}({t.ownerTag}: {m.album.owner.name})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};