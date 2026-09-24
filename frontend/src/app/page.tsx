'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { AlbumGrid } from '../components/AlbumGrid';
import { UploadModal } from '../components/UploadModal';
import { StickerModal, StickerData } from '../components/StickerModal';
import { LoginModal } from '../components/LoginModal';
import { Locale } from '../lib/i18n';

interface UserSession {
  email: string;
  name: string;
  avatarUrl?: string;
}

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>('es');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [uploadTargetSlot, setUploadTargetSlot] = useState<number | null>(null);
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [stickers, setStickers] = useState<Record<number, StickerData>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Cargar sesión guardada y datos reales desde PostgreSQL backend API
  const fetchAlbumFromPostgreSQL = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/album`);
      if (res.ok) {
        const data = await res.json();
        if (data.stickers) {
          setStickers(data.stickers);
        }
      }
    } catch (err) {
      console.error('Error al cargar datos desde la API de PostgreSQL:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Restaurar sesión de usuario persistida
    const savedSession = typeof window !== 'undefined' ? localStorage.getItem('user_session') : null;
    if (savedSession) {
      try {
        setUserSession(JSON.parse(savedSession));
      } catch (e) {
        console.error('Error parseando user_session de localStorage:', e);
      }
    }
  }, []);

  // Issue #7: sin sesión no se conoce "el álbum del usuario", por lo que no se
  // consulta ni se conserva ningún dato (progreso, candados, filtros) y se limpia
  // todo el estado en el logout.
  useEffect(() => {
    if (userSession) {
      fetchAlbumFromPostgreSQL();
    } else {
      setStickers({});
      setIsLoading(false);
    }
  }, [userSession]);

  const handleStickerAdded = (slotNumber: number, rawPlate: string, imageUrl: string) => {
    setStickers((prev) => ({
      ...prev,
      [slotNumber]: {
        slotNumber,
        rawPlate,
        imageUrl,
        capturedAt: new Date().toISOString(),
        capturedBy: userSession ? userSession.name : 'Coleccionista de Patentes',
      },
    }));
    // Re-sincronizar con PostgreSQL
    fetchAlbumFromPostgreSQL();
  };

  const handleStickerDeleted = (slotNumber: number) => {
    setStickers((prev) => {
      const updated = { ...prev };
      delete updated[slotNumber];
      return updated;
    });
    fetchAlbumFromPostgreSQL();
  };

  const handleLoginSuccess = (user: UserSession) => {
    setUserSession(user);
    // El fetch del álbum lo dispara el effect que observa `userSession`
  };

  const handleLogout = () => {
    localStorage.removeItem('user_session');
    localStorage.removeItem('jwt_token');
    setUserSession(null);
    // Issue #7: al cerrar sesión se limpian stickers (progreso/candados) en el effect
  };

  // Issue #6: sin login previo no se puede interactuar con el álbum (cargar fotos)
  const handleOpenUpload = () => {
    if (!userSession) {
      setIsLoginOpen(true);
      return;
    }
    setIsUploadOpen(true);
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Principal con Auth */}
      <Header 
        locale={locale} 
        setLocale={setLocale} 
        onOpenUpload={handleOpenUpload}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        userSession={userSession}
      />

      {/* Rejilla de Figuritas del Álbum 000-999 */}
      <AlbumGrid 
        locale={locale}
        stickers={stickers}
        onSlotClick={(slot) => setSelectedSlot(slot)}
        userSession={userSession}
        onOpenLogin={() => setIsLoginOpen(true)}
      />

      {/* Modal de Captura de Fotos / OCR Real */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setUploadTargetSlot(null);
        }}
        locale={locale}
        onStickerAdded={handleStickerAdded}
        targetSlot={uploadTargetSlot}
      />

      {/* Modal Detalle de Casillero / Figurita */}
      <StickerModal 
        slotNumber={selectedSlot}
        sticker={selectedSlot !== null ? stickers[selectedSlot] || null : null}
        isOpen={selectedSlot !== null}
        onClose={() => setSelectedSlot(null)}
        locale={locale}
        onOpenUploadForSlot={(slot) => {
          setSelectedSlot(null);
          if (!userSession) {
            setIsLoginOpen(true);
            return;
          }
          setUploadTargetSlot(slot);
          setIsUploadOpen(true);
        }}
        onStickerDeleted={handleStickerDeleted}
        isOwner={!!userSession}
      />

      {/* Modal de Inicio de Sesión OAuth / Email */}
      <LoginModal 
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        locale={locale}
        onLoginSuccess={handleLoginSuccess}
      />
    </main>
  );
}

