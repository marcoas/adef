// Issue #36/#43: tema claro/oscuro persistido en localStorage (default: oscuro).
// Issue #43: el control de cambio vive en el panel de usuario, por eso este
// módulo es independiente de cualquier componente.
export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'album-theme';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* almacenamiento no disponible */
  }
}