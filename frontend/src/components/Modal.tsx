'use client';

/**
 * Contenedor común de los modales: overlay que cierra al hacer click
 * afuera, tarjeta que frena la propagación del click y cierre con Escape.
 * El contenido (header, cuerpo, footer) lo define cada modal.
 *
 * Con modales apilados (p. ej. un ConfirmDialog sobre otro modal) solo
 * reacciona a Escape el overlay que está más arriba.
 */
import React, { useEffect, useRef } from 'react';

const OVERLAY_SELECTOR = '.modal-overlay, .ranking-overlay';

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Clase de la tarjeta (default: `modal-card`). */
  className?: string;
  style?: React.CSSProperties;
  /** Clase del overlay (default: `modal-overlay`). */
  overlayClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  onClose,
  children,
  className = 'modal-card',
  style,
  overlayClassName = 'modal-overlay',
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const overlays = document.querySelectorAll(OVERLAY_SELECTOR);
      if (overlays[overlays.length - 1] === overlayRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div ref={overlayRef} className={overlayClassName} onClick={onClose}>
      <div className={className} style={style} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};
