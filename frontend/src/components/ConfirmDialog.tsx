'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { getTranslation, Locale } from '../lib/i18n';

interface ConfirmDialogProps {
  isOpen: boolean;
  locale: Locale;
  title: string;
  /** Texto previo al fragmento destacado (ej: "¿Seguro que querés despegar la figurita del casillero") */
  message: string;
  /** Fragmento destacado en monoespaciada (ej: "#777") */
  highlight?: string;
  hint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  errorMessage?: string | null;
  /** Contenido opcional entre el mensaje y los botones (ej: vista previa) */
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Issue #31: popup de confirmación propio, adaptado a la estética del sitio,
 * que reemplaza al `window.confirm()`/`window.alert()` del navegador.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  locale,
  title,
  message,
  highlight,
  hint,
  confirmLabel,
  cancelLabel,
  isProcessing = false,
  errorMessage = null,
  children,
  onConfirm,
  onCancel,
}) => {
  const t = getTranslation(locale);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Esc cancela y el foco arranca en "Cancelar" (acción segura por defecto)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) onCancel();
    };

    document.addEventListener('keydown', handleKeyDown);
    cancelRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (!isProcessing) onCancel();
      }}
    >
      <div className="modal-card confirm-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="close-btn confirm-close-btn"
          onClick={onCancel}
          disabled={isProcessing}
          aria-label={t.close}
        >
          <X size={18} />
        </button>

        <div className="confirm-icon-badge" aria-hidden="true">
          <AlertTriangle size={24} />
        </div>

        <h3 className="confirm-title">{title}</h3>

        <p className="confirm-message">
          {message}
          {highlight ? <strong className="confirm-highlight">{highlight}</strong> : null}
          ?
        </p>

        {hint && <p className="confirm-hint">{hint}</p>}

        {children}

        {errorMessage && (
          <div className="confirm-error" role="alert">
            <AlertTriangle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="confirm-actions">
          <button
            type="button"
            ref={cancelRef}
            className="btn-secondary"
            onClick={onCancel}
            disabled={isProcessing}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {cancelLabel || t.cancel}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={isProcessing}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            <span>{confirmLabel || t.confirmDeleteBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
