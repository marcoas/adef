/**
 * Tipos de dominio compartidos por páginas y componentes.
 * Reflejan las respuestas JSON del backend (ver docs/API.md).
 */

/** Sesión del usuario autenticado (persistida en localStorage). */
export interface UserSession {
  email: string;
  name: string;
  avatarUrl?: string;
  authProvider?: string;
  // Issue #41: datos de cuenta para el panel de administración
  id?: string;
  isAdmin?: boolean;
}

/** Rol del usuario dentro de un álbum (Issue #12). */
export type AlbumRole = 'OWNER' | 'ASSOCIATE';

/** Movimiento del log del álbum (Issue #33). */
export type StickerAction = 'PASTE' | 'UNPASTE';

/** Figurita pegada en un casillero. */
export interface StickerData {
  slotNumber: number;
  rawPlate: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  capturedAt: string;
  capturedBy?: string;
}

/** Álbum propio o compartido disponible para el usuario (Issue #12). */
export interface AlbumOption {
  id: string;
  title: string;
  role: AlbumRole;
}

/** Aviso de actividad del álbum (Issue #34). */
export interface NotificationItem {
  id: string;
  type: 'STICKER_PASTED' | 'ASSOCIATE_JOINED' | 'ASSOCIATE_LEFT' | 'ACCESS_REVOKED';
  albumId: string;
  albumTitle: string;
  actorName: string;
  slotNumber: number | null;
  rawPlate: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

/** Link de invitación de un solo uso (Issue #12). */
export interface Invite {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
  usedAt: string | null;
  isValid: boolean;
}

/** Entrada del historial de invitaciones (Issue #39). */
export interface InviteLogEntry {
  id: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: 'accepted' | 'expired' | 'pending';
  usedBy: { id: string; name: string; email: string } | null;
  stickersAdded: number;
}

/** Miembro (asociado) de un álbum. */
export interface AlbumMember {
  id: string;
  role: string;
  joinedAt: string;
  user: { id: string; name: string; email: string; avatarUrl?: string | null };
}

/** Mensaje de resultado de una acción en los paneles. */
export type ActionMessage = { type: 'success' | 'error'; text: string };
