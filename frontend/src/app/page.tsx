'use client';

/**
 * Página principal (HomePage): orquesta el estado global de la aplicación.
 *
 * Responsabilidades:
 *   - Sesión de usuario: restauración desde localStorage, refresh de datos
 *     de cuenta #41 y login/logout.
 *   - Carga del álbum activo y de la lista de álbumes propios/compartidos #12,
 *     con manejo de sesión expirada (401) y de acceso revocado (403 #37).
 *   - Render de Header, AlbumGrid y de todos los modales: captura/OCR #53,
 *     detalle de casillero, login #6, panel de usuario #15 (invitaciones #12),
 *     administración #41 y log de movimientos #33.
 *   - Manejadores compartidos: pegar/despegar figuritas, cambio de álbum,
 *     apertura de casilleros, notificaciones y scroll al casillero
 *     detectado por OCR #53.
 */

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '../components/Header';
import { AlbumGrid } from '../components/AlbumGrid';
import { UploadModal } from '../components/UploadModal';
import { StickerModal } from '../components/StickerModal';
import { LoginModal } from '../components/LoginModal';
import { UserModal } from '../components/UserModal';
// Issue #41: panel privado de administración (solo usuarios admin)
import { AdminPanel } from '../components/AdminPanel';
import { ActivityLogModal } from '../components/ActivityLogModal';
import type { AlbumOption, NotificationItem, StickerData, UserSession } from '../types/domain';
import { apiFetch, readJson, withAlbum } from '../lib/api';
import { clearSession, getToken, loadStoredUser, storeUser } from '../lib/session';

// useSearchParams() exige un límite de Suspense para que `next build` pueda
// prerenderizar la página (el contenido se resuelve en el cliente).
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [uploadTargetSlot, setUploadTargetSlot] = useState<number | null>(null);
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  // Issue #41: panel de administración (solo se muestra para usuarios admin)
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [stickers, setStickers] = useState<Record<number, StickerData>>({});
  // Issue #12: álbumes propios + compartidos y cuál está activo
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Issue #33: log histórico de movimientos del álbum activo
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);

  // Issue #12: álbum activo según el rol del usuario en él
  const activeAlbum = albums.find((a) => a.id === activeAlbumId) || null;
  const isActiveAlbumOwner = activeAlbum ? activeAlbum.role === 'OWNER' : true;

  // Cargar sesión guardada y datos reales desde PostgreSQL backend API
  const fetchAlbumFromPostgreSQL = useCallback(async (albumId?: string | null) => {
    try {
      // Issue #8: el álbum se solicita con el token para que el backend
      // devuelva únicamente el álbum del usuario autenticado.
      if (!getToken()) {
        setStickers({});
        setIsLoading(false);
        return;
      }

      const res = await apiFetch(withAlbum('/album', albumId || activeAlbumId));

      if (res.status === 401) {
        // Sesión inválida/expirada: se limpia para no mostrar datos ajenos
        clearSession();
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
      // Issue #37 (feedback): si el dueño me revocó el acceso mientras tenía el
      // álbum abierto, el backend responde 403 con accessRevoked: expulsar al
      // instante al álbum propio y avisar, para no seguir viendo/cargando fotos.
      else if (res.status === 403) {
        const data = await readJson(res);
        if (data.accessRevoked) {
          setActiveAlbumId(null);
          setStickers({});
          alert(data.error || 'Tu acceso a este álbum fue revocado.');
          const list = await fetchMyAlbums();
          setAlbums(list);
          const fallback = list.find((a) => a.role === 'OWNER') || list[0];
          setActiveAlbumId(fallback ? fallback.id : null);
          await fetchAlbumFromPostgreSQL(fallback ? fallback.id : null);
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
    if (!getToken()) return [];

    try {
      const res = await apiFetch('/albums');
      if (!res.ok) return [];
      const data = await res.json();
      return (data.albums || []) as AlbumOption[];
    } catch (err) {
      console.error('Error al cargar los álbumes del usuario:', err);
      return [];
    }
  }, []);

  // Issue #41: refrescar datos de cuenta (id, rol admin) desde el backend
  // para sesiones guardadas antes de que el login empezara a devolverlos.
  const refreshUserSession = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await apiFetch('/auth/me');
      if (!res.ok) return;
      const data = await res.json();
      const fresh = data.user as { id?: string; isAdmin?: boolean; name?: string; avatarUrl?: string | null };
      setUserSession((prev) => {
        if (!prev) return prev;
        const next: UserSession = { ...prev, id: fresh.id ?? prev.id, isAdmin: !!fresh.isAdmin };
        storeUser(next);
        return next;
      });
    } catch (e) {
      console.error('Error refrescando la sesión de usuario:', e);
    }
  }, []);

  useEffect(() => {
    // Restaurar sesión de usuario persistida
    const savedSession = loadStoredUser();
    if (savedSession) {
      setUserSession(savedSession);
      // Issue #41: completar id/isAdmin si la sesión guardada es antigua
      void refreshUserSession();
    }
  }, [refreshUserSession]);

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

  const [recentAddedSlot, setRecentAddedSlot] = useState<number | null>(null);
  // Issue #53: casillero detectado por el OCR mientras el popup de captura sigue
  // abierto. Permite scrollear el álbum hasta él antes de que el usuario confirme.
  // El nonce fuerza un nuevo scroll aun si se repite el mismo casillero.
  const [previewSlot, setPreviewSlot] = useState<{ slot: number; nonce: number } | null>(null);
  const previewNonceRef = useRef(0);
  // Issue #34: casillero a abrir cuando la notificación apunta a otro álbum
  const [pendingNotificationSlot, setPendingNotificationSlot] = useState<number | null>(null);

  // Issue #53: el OCR informa el casillero leído; el álbum se desplaza hasta él
  // mientras el popup sigue abierto. Sin dígitos (o patente vacía) → null.
  const handlePlateDetected = useCallback((slotNumber: number | null) => {
    if (slotNumber === null) {
      setPreviewSlot(null);
      return;
    }
    previewNonceRef.current += 1;
    setPreviewSlot({ slot: slotNumber, nonce: previewNonceRef.current });
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
    setRecentAddedSlot(slotNumber);
    setTimeout(() => setRecentAddedSlot(null), 800);
    // Issue #53: la patente ya quedó pegada, el scroll previo cumplió su propósito
    setPreviewSlot(null);
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

  // Issue #34: al hacer click en un aviso se abre la figurita avisada
  const handleSelectNotification = async (notification: NotificationItem) => {
    if (notification.slotNumber === null) return;

    if (notification.albumId === activeAlbumId) {
      setSelectedSlot(notification.slotNumber);
      return;
    }

    // El aviso pertenece a otro álbum: primero se cambia de álbum
    setPendingNotificationSlot(notification.slotNumber);
    await handleChangeAlbum(notification.albumId);
  };

  useEffect(() => {
    if (pendingNotificationSlot !== null && !isLoading) {
      setSelectedSlot(pendingNotificationSlot);
      setPendingNotificationSlot(null);
    }
  }, [pendingNotificationSlot, isLoading]);

  const handleLogout = () => {
    clearSession();
    setUserSession(null);
    setIsUserModalOpen(false);
    // Issue #41: al cerrar sesión se cierra también el panel de administración
    setIsAdminPanelOpen(false);
    // Issue #7: al cerrar sesión se limpian stickers (progreso/candados) en el effect
  };

  // Issue #6: sin login previo no se puede interactuar con el álbum (cargar fotos)
  const handleOpenUpload = () => {
    if (!userSession) {
      setIsLoginOpen(true);
      return;
    }
    // Issue #53: cada apertura arranca sin casillero previsualizado
    setPreviewSlot(null);
    setIsUploadOpen(true);
  };

  // Issue #51: al hacer clic en un casillero vacío no se abre el popup
  // "casillero vacío": se pasa directamente a "Pegar Figurita" para ese casillero.
  const handleSlotClick = (slot: number) => {
    if (!userSession) return;
    if (stickers[slot]) {
      setSelectedSlot(slot);
    } else {
      setPreviewSlot(null);
      setUploadTargetSlot(slot);
      setIsUploadOpen(true);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Principal con Auth y Menú de Usuario (Issue #15) */}
      <Header 
        onOpenUpload={handleOpenUpload}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenUserModal={() => setIsUserModalOpen(true)}
        onLogout={handleLogout}
        userSession={userSession}
        onOpenActivityLog={() => setIsActivityLogOpen(true)}
        onSelectNotification={handleSelectNotification}
      />

      {/* Rejilla de Figuritas del Álbum 000-999 con Controles Sticky (Issue #16), Filtro Unificado (Issue #13) y Buscador Compacto (Issue #14) */}
      <AlbumGrid 
        stickers={stickers}
        onSlotClick={handleSlotClick}
        userSession={userSession}
        onOpenLogin={() => setIsLoginOpen(true)}
        albums={albums}
        activeAlbumId={activeAlbumId}
        onChangeAlbum={handleChangeAlbum}
        recentAddedSlot={recentAddedSlot}
        previewSlot={previewSlot}
        onOpenActivityLog={() => setIsActivityLogOpen(true)}
      />

      {/* Modal de Captura de Fotos / OCR Real */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setUploadTargetSlot(null);
          // Issue #53: al cerrar el popup se descarta el casillero previsualizado
          setPreviewSlot(null);
        }}
        onStickerAdded={handleStickerAdded}
        targetSlot={uploadTargetSlot}
        albumId={activeAlbumId}
        // Issue #53: el OCR informa el casillero detectado para scrollear el álbum
        onPlateDetected={handlePlateDetected}
      />

      {/* Modal Detalle de Casillero / Figurita */}
      <StickerModal 
        slotNumber={selectedSlot}
        sticker={selectedSlot !== null ? stickers[selectedSlot] || null : null}
        isOpen={selectedSlot !== null}
        onClose={() => setSelectedSlot(null)}
        onStickerDeleted={handleStickerDeleted}
        // Issue #12: en un álbum compartido el invitado no puede eliminar
        isOwner={!!userSession && isActiveAlbumOwner}
        albumId={activeAlbumId}
      />

      {/* Modal de Inicio de Sesión OAuth / Email */}
      <LoginModal 
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Issue #15: Panel de Usuario para logout, cambiar idioma, ver y revocar invitaciones */}
      <UserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        userSession={userSession}
        onLogout={handleLogout}
        // Issue #41: acceso al panel privado de administración (solo admins)
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
      />

      {/* Issue #41: panel privado de administración (se abre desde el panel de usuario) */}
      <AdminPanel
        isOpen={isAdminPanelOpen && !!userSession?.isAdmin}
        onClose={() => setIsAdminPanelOpen(false)}
        currentUserId={userSession?.id ?? null}
      />

      {/* Issue #33: log histórico y cronológico de movimientos del álbum */}
      <ActivityLogModal
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
        albumId={activeAlbumId}
      />
    </main>
  );
}

