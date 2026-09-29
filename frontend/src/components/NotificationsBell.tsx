'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck, History, Sparkles, Users, X } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

export interface NotificationItem {
  id: string;
  type: 'STICKER_PASTED' | 'ASSOCIATE_JOINED' | 'ASSOCIATE_LEFT';
  albumId: string;
  albumTitle: string;
  actorName: string;
  slotNumber: number | null;
  rawPlate: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsBellProps {
  locale: Locale;
  userSession: { name: string; email: string } | null;
  onOpenActivityLog?: () => void;
  onSelectNotification?: (notification: NotificationItem) => void;
}

type BrowserPermission = 'unsupported' | 'default' | 'granted' | 'denied';

const POLL_INTERVAL_MS = 30000;
const LAST_SEEN_KEY = 'notifications_last_seen_at';

/**
 * Issue #34: campana de notificaciones de actividad del álbum.
 * Consulta periódicamente los avisos creados por el backend (cuando un asociado
 * pega una figurita o se suma al álbum) y, si el usuario lo autorizó, dispara
 * también el aviso nativo del navegador.
 */
export const NotificationsBell: React.FC<NotificationsBellProps> = ({
  locale,
  userSession,
  onOpenActivityLog,
  onSelectNotification,
}) => {
  const t = getTranslation(locale);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [browserPermission, setBrowserPermission] = useState<BrowserPermission>('default');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const authToken = () => (typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null);

  const fetchNotifications = useCallback(
    async (allowNativeAlert: boolean) => {
      const jwtToken = authToken();
      if (!jwtToken) return;

      try {
        const res = await fetch(`${apiUrl}/notifications?limit=20`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        const items: NotificationItem[] = data.notifications || [];
        setNotifications(items);
        setUnreadCount(data.unreadCount || 0);

        const latest = items[0]?.createdAt || null;
        const previousLatest = lastSeenRef.current;

        if (allowNativeAlert && latest && previousLatest && latest > previousLatest) {
          const fresh = items.filter((n) => !n.readAt && n.createdAt > previousLatest);
          if (fresh.length > 0 && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
            fresh.slice(0, 3).forEach((n) => {
              try {
                // eslint-disable-next-line no-new
                new window.Notification(n.type === 'STICKER_PASTED' ? '¡Nueva figurita pegada!' : 'Nuevo asociado', {
                  body: n.message,
                  tag: n.id,
                });
              } catch (err) {
                console.warn('No se pudo mostrar la notificación nativa:', err);
              }
            });
          }
        }

        if (latest) {
          lastSeenRef.current = latest;
          localStorage.setItem(LAST_SEEN_KEY, latest);
        }
      } catch (err) {
        console.error('Error al consultar las notificaciones:', err);
      }
    },
    [apiUrl],
  );

  // Permiso del navegador para los avisos nativos
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPermission('unsupported');
      return;
    }
    setBrowserPermission(window.Notification.permission as BrowserPermission);
  }, []);

  // Polling: primera carga sin aviso nativo (evita repetir avisos viejos) y luego cada 30s
  useEffect(() => {
    if (!userSession) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    lastSeenRef.current = localStorage.getItem(LAST_SEEN_KEY);
    fetchNotifications(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchNotifications(true);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [userSession, fetchNotifications]);

  // Cerrar el panel al hacer click fuera
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markNotificationsAsRead = async (ids: string[]) => {
    const jwtToken = authToken();
    if (!jwtToken) return;

    try {
      await fetch(`${apiUrl}/notifications/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` },
        body: JSON.stringify(ids.length > 0 ? { ids } : {}),
      });
      const now = new Date().toISOString();
      const next = notifications.map((n) =>
        ids.length === 0 || ids.includes(n.id) ? { ...n, readAt: n.readAt || now } : n,
      );
      setNotifications(next);
      setUnreadCount(next.filter((n) => !n.readAt).length);
    } catch (err) {
      console.error('Error al marcar las notificaciones como leídas:', err);
    }
  };

  const handleSelectNotification = (notification: NotificationItem) => {
    if (!notification.readAt) markNotificationsAsRead([notification.id]);
    if (onSelectNotification) onSelectNotification(notification);
    setIsOpen(false);
  };

  const handleEnableBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const permission = await window.Notification.requestPermission();
      setBrowserPermission(permission as BrowserPermission);
    } catch (err) {
      console.error('Error al pedir permiso de notificaciones:', err);
    }
  };

  const formatRelative = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    const localeCode = locale === 'en' ? 'en-US' : 'es-AR';

    if (minutes < 1) return locale === 'en' ? 'just now' : 'ahora';
    if (minutes < 60) return locale === 'en' ? `${minutes} min ago` : `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return locale === 'en' ? `${hours} h ago` : `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return locale === 'en' ? `${days} d ago` : `hace ${days} d`;
    return new Date(iso).toLocaleDateString(localeCode, { day: '2-digit', month: '2-digit' });
  };

  if (!userSession) return null;

  return (
    <div className="notifications-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`notifications-bell ${isOpen ? 'open' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={t.notifications}
        aria-label={`${t.notifications}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        aria-expanded={isOpen}
      >
        {unreadCount > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unreadCount > 0 && (
          <span className="notifications-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-dropdown" role="dialog" aria-label={t.notifications}>
          <div className="notifications-dropdown-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.85rem' }}>
              <Bell size={14} style={{ color: 'var(--accent-cyan)' }} />
              {t.notifications}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notifications-mark-all"
                onClick={() => markNotificationsAsRead([])}
                title={t.markAllRead}
              >
                <CheckCheck size={13} />
                <span>{t.markAllRead}</span>
              </button>
            )}
          </div>

          {browserPermission !== 'granted' && browserPermission !== 'unsupported' && (
            <button
              type="button"
              className="notifications-enable-btn"
              onClick={handleEnableBrowserNotifications}
              disabled={browserPermission === 'denied'}
            >
              {browserPermission === 'denied' ? <X size={13} /> : <Bell size={13} />}
              <span>{browserPermission === 'denied' ? t.browserNotifBlocked : t.enableBrowserNotif}</span>
            </button>
          )}

          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="notifications-empty">{t.notificationsEmpty}</div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`notification-item ${notification.readAt ? '' : 'unread'}`}
                  onClick={() => handleSelectNotification(notification)}
                >
                  <span className="notification-icon">
                    {notification.type === 'STICKER_PASTED' ? <Sparkles size={14} /> : <Users size={14} />}
                  </span>
                  <span className="notification-body">
                    <span className="notification-message">{notification.message}</span>
                    <span className="notification-meta">
                      {notification.albumTitle} · {formatRelative(notification.createdAt)}
                    </span>
                  </span>
                  {!notification.readAt && <span className="notification-dot" aria-hidden="true" />}
                </button>
              ))
            )}
          </div>

          {onOpenActivityLog && (
            <button
              type="button"
              className="notifications-footer-link"
              onClick={() => {
                setIsOpen(false);
                onOpenActivityLog();
              }}
            >
              <History size={13} />
              <span>{t.activityLog}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
