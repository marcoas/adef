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
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
