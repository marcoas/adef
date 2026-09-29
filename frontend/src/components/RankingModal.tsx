'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Trophy, Medal, Loader2 } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

export interface RankingEntry {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  count: number;
  isOwner: boolean;
}

interface RankingModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  albumId: string | null;
  albumTitle?: string;
}

/**
 * Issue #40: popup con el ranking de pegatinas por usuario.
 * Solo tiene sentido en álbumes compartidos (el backend devuelve memberCount).
 */
export const RankingModal: React.FC<RankingModalProps> = ({
  isOpen,
  onClose,
  locale,
  albumId,
  albumTitle,
}) => {
  const t = getTranslation(locale);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadRanking = useCallback(async () => {
    if (!albumId) return;
    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const jwtToken = localStorage.getItem('jwt_token');
      const res = await fetch(`${apiUrl}/albums/${albumId}/ranking`, {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setRanking(data.ranking || []);
        setMemberCount(data.memberCount || 0);
      }
    } catch (err) {
      console.error('Error al cargar el ranking:', err);
    } finally {
      setIsLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    if (isOpen) loadRanking();
  }, [isOpen, loadRanking]);

  if (!isOpen) return null;
  const max = ranking[0]?.count || 1;

  return (
    <div className="ranking-overlay" onClick={onClose}>
      <div className="ranking-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 800 }}>
            <Trophy size={18} style={{ color: 'var(--accent-amber)' }} />
            {t.rankingTitle}{albumTitle ? `: ${albumTitle}` : ''}
          </h3>
          <button type="button" className="btn-secondary" style={{ padding: '0.35rem 0.5rem' }} onClick={onClose} aria-label={t.close}>
            <X size={15} />
          </button>
        </div>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={16} className="animate-spin" />
            <span>{t.activityLoading}</span>
          </div>
        ) : memberCount <= 1 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t.rankingOnlyShared}</p>
        ) : ranking.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t.rankingEmpty}</p>
        ) : (
          ranking.map((entry, idx) => (
            <div key={entry.userId} className="ranking-row">
              <span className={`ranking-pos ${idx === 0 ? 'first' : ''}`}>
                {idx === 0 ? <Medal size={14} /> : idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.name}{entry.isOwner ? ` (${t.ownerTag})` : ''}
                  </strong>
                  <span style={{ fontFamily: 'Space Mono', fontWeight: 700 }}>{entry.count}</span>
                </div>
                <div className="ranking-bar" style={{ width: `${Math.max((entry.count / max) * 100, 4)}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
