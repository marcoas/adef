'use client';

import React, { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface QuickJumpBarProps {
  locale: Locale;
  /** Casilleros ancla: 0, 100, 200, ... 900 (Issue #32) */
  groups: number[];
  /** Grupo (centena) en el que está parado el usuario */
  activeGroup: number | null;
  onJump: (group: number) => void;
  /** Issue #32 (feedback): en pantallas angostas la barra colapsa en un botón flotante */
  collapsed?: boolean;
}

/**
 * Issue #32: barra fija, flotante y translúcida sobre el margen lateral, con los
 * números 0, 100, ... 900. Sólo se muestra mientras el álbum se ve sin filtros.
 * El 0 queda fijado arriba, el 900 abajo y los demás repartidos homogéneamente
 * (ver `justify-content: space-between` en `.quick-jump-bar`).
 * En pantallas angostas colapsa en un botón flotante que despliega la barra.
 */
export const QuickJumpBar: React.FC<QuickJumpBarProps> = ({
  locale,
  groups,
  activeGroup,
  onJump,
  collapsed = false,
}) => {
  const t = getTranslation(locale);
  const [isOpen, setIsOpen] = useState(false);

  if (!collapsed) {
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
  }

  return (
    <>
      <button
        type="button"
        className="quick-jump-fab"
        onClick={() => setIsOpen((prev) => !prev)}
        title={t.quickJump}
        aria-label={t.quickJump}
        aria-expanded={isOpen}
      >
        <ListOrdered size={20} />
      </button>
      {isOpen && (
        <div className="quick-jump-popover" onClick={() => setIsOpen(false)}>
          <nav
            className="quick-jump-bar quick-jump-bar--popover"
            aria-label={t.quickJump}
            onClick={(e) => e.stopPropagation()}
          >
            {groups.map((group) => (
              <button
                key={group}
                type="button"
                className={`quick-jump-item ${activeGroup === group ? 'active' : ''}`}
                onClick={() => {
                  onJump(group);
                  setIsOpen(false);
                }}
                title={`${t.quickJumpHint} ${group}`}
                aria-label={`${t.quickJumpHint} ${group}`}
                aria-current={activeGroup === group ? 'true' : undefined}
              >
                {group}
              </button>
            ))}
          </nav>
        </div>
      )}
    </>
  );
};
