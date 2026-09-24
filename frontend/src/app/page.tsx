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
    fetchAlbumFromPostgreSQL();
  }, []);

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

  const handleLoginSuccess = (user: UserSession) => {
    setUserSession(user);
    fetchAlbumFromPostgreSQL();
  };

  const handleLogout = () => {
    localStorage.removeItem('user_session');
    localStorage.removeItem('jwt_token');
    setUserSession(null);
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Principal con Auth */}
      <Header 
        locale={locale} 
        setLocale={setLocale} 
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        userSession={userSession}
      />

      {/* Rejilla de Figuritas del Álbum 000-999 */}
      <AlbumGrid 
        locale={locale}
        stickers={stickers}
        onSlotClick={(slot) => setSelectedSlot(slot)}
      />

      {/* Modal de Captura de Fotos / OCR Real */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        locale={locale}
        onStickerAdded={handleStickerAdded}
      />

      {/* Modal Detalle de Casillero / Figurita */}
      <StickerModal 
        slotNumber={selectedSlot}
        sticker={selectedSlot !== null ? stickers[selectedSlot] || null : null}
        isOpen={selectedSlot !== null}
        onClose={() => setSelectedSlot(null)}
        locale={locale}
        onOpenUploadForSlot={() => {
          setSelectedSlot(null);
          setIsUploadOpen(true);
        }}
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

