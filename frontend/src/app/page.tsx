'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '../components/Header';
import { AlbumGrid, AlbumOption } from '../components/AlbumGrid';
import { UploadModal } from '../components/UploadModal';
import { StickerModal, StickerData } from '../components/StickerModal';
import { LoginModal } from '../components/LoginModal';
import { InviteModal } from '../components/InviteModal';
import { Locale } from '../lib/i18n';

interface UserSession {
  email: string;
  name: string;
  avatarUrl?: string;
}

export default function HomePage() {
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<Locale>('es');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [uploadTargetSlot, setUploadTargetSlot] = useState<number | null>(null);
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [stickers, setStickers] = useState<Record<number, StickerData>>({});
  // Issue #12: álbumes propios + compartidos y cuál está activo
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Issue #12: álbum activo según el rol del usuario en él
  const activeAlbum = albums.find((a) => a.id === activeAlbumId) || null;
  const isActiveAlbumOwner = activeAlbum ? activeAlbum.role === 'OWNER' : true;

  // Cargar sesión guardada y datos reales desde PostgreSQL backend API
  const fetchAlbumFromPostgreSQL = useCallback(async (albumId?: string | null) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      // Issue #8: el álbum se solicita con el token para que el backend
      // devuelva únicamente el álbum del usuario autenticado.
      const jwtToken = localStorage.getItem('jwt_token');
      if (!jwtToken) {
        setStickers({});
        setIsLoading(false);
        return;
      }

      const targetAlbum = albumId || activeAlbumId;
      const res = await fetch(
        `${apiUrl}/album${targetAlbum ? `?albumId=${targetAlbum}` : ''}`,
        { headers: { Authorization: `Bearer ${jwtToken}` } }
      );

      if (res.status === 401) {
        // Sesión inválida/expirada: se limpia para no mostrar datos ajenos
        localStorage.removeItem('user_session');
        localStorage.removeItem('jwt_token');
        setUserSession(null);
        setStickers({});
        return;
      }

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
  }, [activeAlbumId]);

  // Issue #12: lista de álbumes (propio + compartidos por invitación)
  const fetchMyAlbums = useCallback(async () => {
    const jwtToken = localStorage.getItem('jwt_token');
    if (!jwtToken) return [];

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    try {
      const res = await fetch(`${apiUrl}/albums`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.albums || []) as AlbumOption[];
    } catch (err) {
      console.error('Error al cargar los álbumes del usuario:', err);
      return [];
    }
  }, []);

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
    let cancelled = false;

    if (userSession) {
      (async () => {
        const list = await fetchMyAlbums();
        if (cancelled) return;

        setAlbums(list);
        // Prioridad: ?album= (link de invitación) > álbum propio
        const requested = searchParams?.get('album');
        const requestedAlbum = requested && list.find((a) => a.id === requested);
        const initial = requestedAlbum || list.find((a) => a.role === 'OWNER') || list[0];
        setActiveAlbumId(initial ? initial.id : null);
        await fetchAlbumFromPostgreSQL(initial ? initial.id : null);
      })();
    } else {
      setStickers({});
      setAlbums([]);
      setActiveAlbumId(null);
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [userSession]);

  // Issue #12: cambiar de álbum (propio <-> compartidos)
  const handleChangeAlbum = async (albumId: string) => {
    setActiveAlbumId(albumId);
    setIsLoading(true);
    await fetchAlbumFromPostgreSQL(albumId);
  };

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
        onOpenInvite={() => setIsInviteOpen(true)}
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
        albums={albums}
        activeAlbumId={activeAlbumId}
        onChangeAlbum={handleChangeAlbum}
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
        albumId={activeAlbumId}
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
        // Issue #12: en un álbum compartido el invitado no puede eliminar
        isOwner={!!userSession && isActiveAlbumOwner}
        albumId={activeAlbumId}
      />

      {/* Modal de Inicio de Sesión OAuth / Email */}
      <LoginModal 
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        locale={locale}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Issue #12: generador de links de invitación de un solo uso */}
      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        locale={locale}
      />
    </main>
  );
}

