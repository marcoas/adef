# 📡 Referencia de la API REST (Backend)

Todo el backend vive en [`backend/src/index.ts`](../backend/src/index.ts) (Express + Prisma sobre PostgreSQL). La API se sirve bajo el prefijo `/api` (por defecto `http://localhost:4000/api`).

## Convenciones generales

- **Formato de respuesta:** JSON. Los errores devuelven `{ "error": "<mensaje>" }` con el código HTTP correspondiente.
- **Autenticación:** la mayoría de las rutas exigen `Authorization: Bearer <JWT>` (emitido en `POST /api/auth/login`, vigencia 7 días). Sin token → `401`.
- **Usuario restringido:** las cuentas con `status = RESTRICTED` (Issue #41) reciben `403` en el login y en toda ruta autenticada.
- **Álbum activo:** varias rutas aceptan `albumId` (query o body) para operar sobre un álbum compartido; sin parámetro se usa el álbum propio del usuario (Issue #8 / #12).

---

## Autenticación y cuenta

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Login con Google: body `{ accessToken }` (token de acceso de Google Identity Services). El backend lo verifica con Google (`tokeninfo`: emitido para `GOOGLE_CLIENT_ID`, email verificado) y toma email, nombre y foto del perfil de Google; nunca de datos enviados por el cliente. Crea el usuario y su álbum si no existen, actualiza `lastLoginAt`, siembra admins desde `ADMIN_EMAILS` (#41) y devuelve `{ token, user }`. Errores: `400` sin token, `401` token inválido o de otra app, `403` cuenta `RESTRICTED`, `500` si falta `GOOGLE_CLIENT_ID`. |
| `GET` | `/api/auth/me` | ✅ | Devuelve la sesión actual leída de la BD (incluye `isAdmin`, `status`, `lastLoginAt`) para refrescar sesiones guardadas (#41). |
| `GET` | `/api/users/me/preferences` | ✅ | Preferencia `notifyOnAlbumActivity` (#34). |
| `PUT` | `/api/users/me/preferences` | ✅ | Actualiza `notifyOnAlbumActivity` (`true`/`false`). |
| `DELETE` | `/api/users/me` | ✅ | **Autoeliminación de la cuenta (#54).** Borra definitivamente la cuenta, el álbum propio y todas sus figuritas (con imágenes), las invitaciones, y los accesos como asociado en otros álbumes. El acceso de los asociados a su álbum desaparece al eliminarse el álbum. Irreversible. |

## Reconocimiento de patentes (OCR / ALPR)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/plates/ocr` | — | Recibe `{ imageBase64 }` y devuelve la patente detectada. Usa Plate Recognizer (si hay token) con fallback a Tesseract.js; cada llamada real se registra en `external_api_calls` (#48). |
| `POST` | `/api/plates/parse` | — | Recibe `{ text }` y aplica las expresiones regulares de patente (`AAA 000` / `AA 000 AA`) devolviendo el casillero (`extractPlate`). |

## Álbum y figuritas

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/album?albumId=` | ✅ | Devuelve el álbum accesible (propio o compartido) con las 1000 posiciones, progreso y mapa de figuritas. |
| `POST` | `/api/album/stickers` | ✅ | Pega una figurita: body `{ plateText, imageUrl?, albumId? }`. Valida formato/tamaño de imagen (#10), extrae el casillero, chequea unicidad (`409` si ya está ocupado) y registra la actividad (#33) + notificación (#34). |
| `DELETE` | `/api/album/stickers/:slotNumber` | ✅ | Despega la figurita del casillero (solo dueño del álbum), borra la imagen del almacenamiento y registra la actividad. |
| `GET` | `/api/album/activity` | ✅ | Log de movimientos del álbum (#33). Query: `limit` (def. 40), `page`, `action` (`PASTE` / `UNPASTE`). |
| `GET` | `/api/albums` | ✅ | Lista los álbumes del usuario: el propio (`role: OWNER`) + los compartidos donde es asociado, con cantidad de figuritas. |

## Invitaciones y asociados

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/album/invites` *(alias `/api/invites`)* | ✅ | Genera un link único de un solo uso con vencimiento de 7 días (#12). |
| `GET` | `/api/album/invites` *(alias `/api/invites`)* | ✅ | Lista las invitaciones con su estado (válida / usada / vencida). |
| `DELETE` | `/api/album/invites/:id` | ✅ | Revoca una invitación pendiente. |
| `GET` | `/api/invites/:token` | — | Preview público del link de invitación: álbum, dueño y estado (`isValid`, `used`, `expired`). |
| `POST` | `/api/invites/:token/accept` | ✅ | Acepta la invitación y crea la membresía `ASSOCIATE`. Notifica al dueño (#37). |
| `GET` | `/api/invites/log` | ✅ | Historial de invitaciones aceptadas/vencidas con fotos aportadas por cada invitado (#39). |
| `GET` | `/api/album/members` | ✅ | Asociados del álbum propio. |
| `DELETE` | `/api/album/members/:memberUserId` | ✅ | Revoca el acceso de un asociado; le emite `ACCESS_REVOKED` (#37) y el frontend lo expulsa al instante. |
| `DELETE` | `/api/albums/:albumId/leave` | ✅ | El asociado se desvincula de un álbum compartido; notifica al dueño (`ASSOCIATE_LEFT`). El dueño no puede usarlo sobre su propio álbum. |

## Notificaciones y ranking

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/notifications` | ✅ | Avisos del usuario (#34). Query: `limit` (def. 20, máx. 100), `unreadOnly=true`. Devuelve `unreadCount`. |
| `POST` | `/api/notifications/read` | ✅ | Marca como leídas: body `{ ids: string[] }` o vacío para todas. |
| `GET` | `/api/albums/:albumId/ranking` | ✅ | Ranking de pegatinas por miembro de un álbum compartido (#40). |

## Panel de administración (solo `isAdmin`, Issue #41)

Todas exigen `requireAuth + requireAdmin`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Totales, serie de 14 días, consumo de API externa (#48) y últimos movimientos. |
| `GET` | `/api/admin/users?search=` | Listado buscable de usuarios con información de sus álbumes y membresías. |
| `GET` | `/api/admin/users/:userId/album` | Álbum de otro usuario: miembros y figuritas. |
| `PATCH` | `/api/admin/users/:userId` | Actualiza `isAdmin` y/o `status` (`ACTIVE`/`RESTRICTED`). Protege al propio admin y al último admin del sistema. |
| `DELETE` | `/api/admin/users/:userId` | Baja total de un usuario (misma lógica que la autoeliminación #54, vía `deleteAccountCascade`). No puede usarse sobre la propia cuenta. |

## Salud

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check: estado de la BD y cantidad de usuarios. |

---

> **Relacionado:** [Arquitectura](ARCHITECTURE.md) · [Base de datos (DER)](DATABASE_DER.md) · [Guía de desarrollo](DEVELOPMENT.md)

