import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Álbum de Patentes | Colección de Patentes 000-999',
  description: 'Webapp lúdica y familiar para coleccionar y registrar fotografías de patentes de automóviles en un álbum digital de 1000 casilleros.',
  keywords: ['patentes', 'album', 'figuritas', 'mercosur', 'autitos', 'coleccion'],
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
            __html: `(function(){try{var t=localStorage.getItem('album-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
