'use client';

import React from 'react';
import { getTranslation, Locale } from '../lib/i18n';

interface QuickJumpBarProps {
  locale: Locale;
  /** Casilleros ancla: 0, 100, 200, ... 900 (Issue #32) */
  groups: number[];
  /** Grupo (centena) en el que está parado el usuario */
  activeGroup: number | null;
  onJump: (group: number) => void;
}

/**
 * Issue #32: barra fija, flotante y translúcida sobre el margen lateral, con los
 * números 0, 100, ... 900. Sólo se muestra mientras el álbum se ve sin filtros.
 * El 0 queda fijado arriba, el 900 abajo y los demás repartidos homogéneamente
 * (ver `justify-content: space-between` en `.quick-jump-bar`).
 */
export const QuickJumpBar: React.FC<QuickJumpBarProps> = ({
  locale,
  groups,
  activeGroup,
  onJump,
}) => {
  const t = getTranslation(locale);

  return (
    <nav className="quick-jump-bar" aria-label={t.quickJump}>
      {groups.map((group) => (
        <button
          key={group}
          type="button"
          className={`quick-jump-item ${activeGroup === group ? 'active' : ''}`}
          onClick={() => onJump(group)}
          title={`${t.quickJumpHint} ${group}`}
          aria-label={`${t.quickJumpHint} ${group}`}
          aria-current={activeGroup === group ? 'true' : undefined}
        >
          {group}
        </button>
      ))}
    </nav>
  );
};
