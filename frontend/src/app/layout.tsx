import type { Metadata } from 'next';
/**
 * Layout raíz de la app Next.js (App Router).
 * Importa los estilos globales, define los metadatos SEO (título,
 * descripción, keywords y favicon de chapa patente #47) y envuelve todas
 * las páginas con <html>/<body> y el proveedor de idioma (LocaleProvider).
 */
import '../styles/globals.css';
import { LocaleProvider } from '../lib/LocaleContext';
import { THEME_STORAGE_KEY } from '../lib/theme';

export const metadata: Metadata = {
  title: 'Álbum de Patentes | Colección de Patentes 000-999',
  description: 'Webapp lúdica y familiar para coleccionar y registrar fotografías de patentes de automóviles en un álbum digital de 1000 casilleros.',
  keywords: ['patentes', 'album', 'figuritas', 'mercosur', 'autitos', 'coleccion'],
  // Issue #47: favicon con forma de chapa patente argentina
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Issue #36: tema claro/oscuro. Script inline anti-flash: lee localStorage
  // antes del primer render (default: oscuro, respetando solo 'light' guardado).
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
