'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Plus, Undo2, X, AlertCircle } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface ActivityItem {
  id: string;
  action: 'PASTE' | 'UNPASTE';
  slotNumber: number;
  rawPlate: string;
  userName: string;
  createdAt: string;
}

interface ActivityLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  /** Issue #12: álbum activo (propio o compartido) */
  albumId?: string | null;
}

type ActivityFilter = 'all' | 'PASTE' | 'UNPASTE';

/**
 * Issue #33: log histórico y cronológico de los movimientos del álbum
 * (quién y cuándo pegó o despegó cada figurita).
 */
export const ActivityLogModal: React.FC<ActivityLogModalProps> = ({
  isOpen,
  onClose,
  locale,
  albumId = null,
}) => {
  const t = getTranslation(locale);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [albumTitle, setAlbumTitle] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const sessionExpiredMsg = t.sessionExpired;

  const loadActivities = useCallback(
    async (targetPage: number, currentFilter: ActivityFilter, append: boolean) => {
      const jwtToken = localStorage.getItem('jwt_token');
      if (!jwtToken) return;

      setIsLoading(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({ page: String(targetPage), limit: '40' });
        if (albumId) params.set('albumId', albumId);
        if (currentFilter !== 'all') params.set('action', currentFilter);

        const res = await fetch(`${apiUrl}/album/activity?${params.toString()}`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });

        if (res.status === 401) {
          setErrorMsg(sessionExpiredMsg);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'No se pudieron cargar los movimientos.');
        }

        const data = await res.json();
        const incoming: ActivityItem[] = data.activities || [];
        setActivities((prev) => (append ? [...prev, ...incoming] : incoming));
        setTotal(data.total || 0);
        setHasMore(!!data.hasMore);
        setPage(targetPage);
        setAlbumTitle(data.album?.title || '');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Error al cargar los movimientos.');
      } finally {
        setIsLoading(false);
      }
    },
    [apiUrl, albumId, sessionExpiredMsg],
  );

  useEffect(() => {
    if (!isOpen) return;
    setActivities([]);
    loadActivities(1, filter, false);
    // Sólo al abrir el modal o al cambiar de álbum: el cambio de filtro se maneja aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, albumId]);

  const handleChangeFilter = (next: ActivityFilter) => {
    setFilter(next);
    loadActivities(1, next, false);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card activity-log-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '0.85rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <div style={{ background: 'rgba(0, 242, 254, 0.15)', padding: '6px', borderRadius: 'var(--radius-sm)', color: 'var(--accent-cyan)', display: 'flex' }}>
              <History size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="modal-title">{t.activityLogTitle}</h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {albumTitle && <span>{albumTitle}</span>}
                {albumTitle && <span>·</span>}
                <span>{total} {t.activityMovements}</span>
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </div>

        {/* Filtros rápidos del log */}
        <div className="activity-log-filters">
          <button
            type="button"
            className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => handleChangeFilter('all')}
          >
            {t.activityAll}
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === 'PASTE' ? 'active' : ''}`}
            onClick={() => handleChangeFilter('PASTE')}
          >
            {t.activityPastedTab}
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === 'UNPASTE' ? 'active' : ''}`}
            onClick={() => handleChangeFilter('UNPASTE')}
          >
            {t.activityUnpastedTab}
          </button>
        </div>

        {/* Listado cronológico */}
        <div className="modal-body activity-log-body" style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
          {errorMsg && (
            <div className="activity-log-empty error">
              <AlertCircle size={17} />
              <span>{errorMsg}</span>
            </div>
          )}

          {!errorMsg && isLoading && activities.length === 0 && (
            <div className="activity-log-empty">
              <Loader2 size={17} className="animate-spin" />
              <span>{t.activityLoading}</span>
            </div>
          )}

          {!errorMsg && !isLoading && activities.length === 0 && (
            <div className="activity-log-empty">
              <History size={18} />
              <span>{t.activityLogEmpty}</span>
            </div>
          )}

          {activities.map((activity) => {
            const isPaste = activity.action === 'PASTE';
            const formattedSlot = activity.slotNumber.toString().padStart(3, '0');
            return (
              <div key={activity.id} className={`activity-log-item ${isPaste ? 'paste' : 'unpaste'}`}>
                <div className="activity-log-icon">
                  {isPaste ? <Plus size={15} /> : <Undo2 size={15} />}
                </div>
                <div className="activity-log-content">
                  <div className="activity-log-text">
                    <strong>{activity.userName}</strong>{' '}
                    <span className={isPaste ? 'activity-verb-paste' : 'activity-verb-unpaste'}>
                      {isPaste ? t.activityPasted : t.activityUnpasted}
                    </span>{' '}
                    <span className="activity-log-slot">#{formattedSlot}</span>{' '}
                    <span style={{ color: 'var(--text-muted)' }}>({activity.rawPlate})</span>
                  </div>
                  <div className="activity-log-date">{formatDate(activity.createdAt)}</div>
                </div>
              </div>
            );
          })}

          {hasMore && !errorMsg && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
              onClick={() => loadActivities(page + 1, filter, true)}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : null}
              <span>{t.loadMore}</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
