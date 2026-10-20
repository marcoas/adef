'use client';

/**
 * Idioma activo de la app (i18n) compartido por contexto, para que los
 * componentes no reciban `locale` por props. `useLocale()` devuelve el
 * idioma, su setter y el diccionario de textos ya resuelto (`t`).
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { getTranslation, Locale } from './i18n';

const DEFAULT_LOCALE: Locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === 'en' ? 'en' : 'es';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const { locale, setLocale } = useContext(LocaleContext);
  return { locale, setLocale, t: getTranslation(locale) };
}
