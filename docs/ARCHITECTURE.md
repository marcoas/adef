# Arquitectura del Sistema y Procesamiento de Patentes

## 1. Visión General de la Arquitectura

El sistema **Álbum de Patentes** sigue el patrón de arquitectura desacoplada **API REST + Frontend SPA/SSR**: el frontend nunca habla con la base de datos; todo pasa por la API del backend, que es la única capa con persistencia y acceso a servicios externos (OCR, almacenamiento de imágenes).

```
[ Cliente Móvil / Desktop (Next.js) ]
        │
        ├── Requests HTTP (JSON + JWT) ──► [ Express Backend API ]
        │                                        │
        │                                        ├── Prisma ORM ──────► [ PostgreSQL ]
        │                                        │
        │                                        ├── Plate Recognizer API (OCR de patentes)
        │                                        │
        │                                        └── Image Provider ──► [ disco local | Cloudinary ]
        │
        └── Renderizado de la grilla 000-999 + miniaturas (#11)
```

## 2. Estructura del Proyecto

```
adef/
├── docker-compose.yml          # Orquestación: postgres + backend + frontend
├── .env.example                # Variables de entorno (ver docs/DEVELOPMENT.md)
├── README.md                   # Vista general y arranque rápido
├── docs/
│   ├── ARCHITECTURE.md         # Este documento
│   ├── DATABASE_DER.md         # Modelo de datos (DER, enums, cascadas)
│   ├── API.md                  # Referencia de endpoints
│   └── DEVELOPMENT.md          # Guía de desarrollo
├── backend/
│   ├── src/
│   │   ├── index.ts            # Punto de entrada: solo app.listen()
│   │   ├── app.ts              # App Express: middlewares globales + routers
│   │   ├── config.ts           # Variables de entorno
│   │   ├── db.ts               # PrismaClient compartido
│   │   ├── types.ts            # AuthedRequest + helpers authUserId/authUser
│   │   ├── lib/asyncHandler.ts # try/catch + 500 común a las rutas
│   │   ├── middleware/         # auth.ts (requireAuth/requireAdmin), apiUsage.ts
│   │   ├── routes/             # Un Router por dominio (auth, plates, album,
│   │   │                       #   invites, notifications, users, admin, health)
│   │   ├── services/
│   │   │   ├── albumService.ts        # Acceso al álbum, serialización, validación de imagen
│   │   │   ├── notificationService.ts # Avisos al dueño del álbum (#34)
│   │   │   ├── accountService.ts      # Baja de cuenta en cascada (#41/#54)
│   │   │   ├── externalApiUsage.ts    # Registro de llamadas a APIs externas (#48)
│   │   │   ├── alprService.ts  # OCR: Plate Recognizer API
│   │   │   └── images/         # Fachada de proveedores (#35): local/cloudinary
│   │   └── utils/
│   │       └── plateExtractor.ts  # Regex de patente → casillero 000-999
│   └── prisma/
│       ├── schema.prisma       # Modelo de datos fuente de verdad
│       └── migrations/         # Migraciones SQL versionadas
└── frontend/
    └── src/
        ├── app/                # App Router: page.tsx, layout.tsx, invite/[token]
        ├── components/         # Componentes React (ver §3)
        ├── lib/                # api.ts, session.ts, LocaleContext.tsx, format.ts,
        │                       #   i18n.ts (ES/EN), theme.ts, imageCompression.ts
        ├── types/domain.ts     # Tipos de dominio compartidos
        └── styles/             # globals.css (diseño + variables CSS)
```

## 3. Capas y Componentes

### Backend (`backend/src/`)

- **Middlewares (`app.ts`):** `trust proxy` (configurable con `TRUST_PROXY`, para que `req.ip` sea la IP real detrás de Render/Caddy/nginx), `helmet` (headers de seguridad), `cors`, `express.json()`, compresión gzip (`compression`), límite de tasa por IP (`middleware/rateLimit.ts`), contador de consumo de la API (`middleware/apiUsage.ts`) y servido estático de `/uploads`.
- **Autenticación (`middleware/auth.ts`):** JWT (`jsonwebtoken`, 7 días). `requireAuth` valida el token, carga el usuario de la BD y bloquea cuentas `RESTRICTED` (#41); `requireAdmin` exige `isAdmin`.
- **Rutas (`routes/`):** un `Router` por dominio (auth, plates, álbum/figuritas/ranking, invitaciones/miembros, notificaciones, usuario, administración, health), montados bajo `/api` en `app.ts`. Cada handler se envuelve con `asyncHandler`, que loguea y responde 500 ante errores no controlados. La referencia completa está en [`API.md`](API.md).
- **Para sumar un dominio:** crear `routes/<dominio>.ts`, poner la lógica reutilizable en `services/` y montarlo en `app.ts`.
- **Dominio auxiliar:**
  - `services/albumService.ts` — `getOrCreateUserAlbum`, `requireOwnAlbum`, `resolveAccessibleAlbum` (álbum propio o compartido #8/#12/#37), `serializeSticker` y `validateImageInput` (#10).
  - `services/notificationService.ts`, `services/accountService.ts`, `services/externalApiUsage.ts` — avisos (#34), baja de cuentas (#41/#54) y consumo de APIs externas (#48).
  - `utils/plateExtractor.ts` — validación de formatos de patente y cálculo del casillero.
  - `services/alprService.ts` — reconocimiento ALPR delegado a Plate Recognizer. Limitador en memoria (1 llamada/s, FIFO) y corte por cuota mensual (`OcrQuotaExceededError`); el registro y el conteo del consumo (#48) se inyectan vía `ALPRDeps` desde `services/externalApiUsage.ts`, sin acoplar el servicio a la BD.
  - `services/images/` — fachada `storeImage` / `deleteStoredImages` con proveedores *local* y *cloudinary* (#35).

### Frontend (Next.js App Router)

- **`app/page.tsx`** — orquestador único de estado (sesión, álbum activo, álbumes, modales).
- **Componentes principales:** `AlbumGrid` (grilla 000-999 con filtros y controles), `Header` (acciones + menú de usuario), `UploadModal` (captura, compresión y OCR), `StickerModal` (detalle/despegar), `UserModal` (panel de usuario #15/#45, invitaciones #12 y autoeliminación #54), `AdminPanel` (#41), `InvitePage` (#12), `NotificationsBell` (#34), `ActivityLogModal` (#33), `RankingModal` (#40), `ConfirmDialog` (#31), `QuickJumpBar` (#32) y `Modal` (contenedor común: overlay, tarjeta y cierre con Escape).
- **Acceso al backend:** siempre vía `lib/api.ts` (`apiFetch` / `apiJson` / `withAlbum`), que agrega la URL base y el JWT y convierte las respuestas `{ error }` en `ApiError`. La sesión (JWT + usuario en localStorage) se maneja solo con `lib/session.ts`.
- **Tipos:** las formas de datos compartidas viven en `types/domain.ts`.
- **Cross-cutting:** `lib/LocaleContext.tsx` (`useLocale()` devuelve `locale`, `setLocale` y los textos `t` de `lib/i18n.ts`, ES/EN), `lib/theme.ts` (tema claro/oscuro persistente #36/#43), `lib/format.ts` (casilleros y fechas), `lib/imageCompression.ts` (compresión de fotos en el navegador antes de subirlas, ver §5).

---

## 4. Lógica de Extracción de Patentes

El sistema reconoce dos tipos de patentes estándar:

1. **Formato Antiguo (`AAA 000`):**
   - Expresión Regular: `/^([A-Z]{3})\s*(\d{3})$/i`
   - Ejemplo: `ABC 123` ➔ Números: `123` ➔ **Casillero #123**

2. **Formato Mercosur Vigente (`AA 000 AA`):**
   - Expresión Regular: `/^([A-Z]{2})\s*(\d{3})\s*([A-Z]{2})$/i`
   - Ejemplo: `AA 456 BB` ➔ Números: `456` ➔ **Casillero #456**

### Regla de Asignación de Casilleros:
Independientemente del modelo de patente, la extracción obtiene la secuencia exacta de **3 dígitos numéricos**.
El número entero resultante (ej: `042` ➔ `42`) corresponde al casillero único del álbum (rango `000` al `999`).

## 5. Flujo Principal: Pegado de una Figurita

```
[UploadModal]                     [Backend]                          [BD / Almacenamiento]
     │  0. foto (cámara/archivo)     │                                        │
     │  compressImage() en el        │                                        │
     │  navegador: ≤1280 px, JPEG 0,8│                                        │
     │  1. imagen comprimida         │                                        │
     │──────────────────────────────►│  POST /api/plates/ocr                  │
     │                               │  (ALPR vía Plate Recognizer)          │
     │                               │  + registro en external_api_calls #48 │
     │  2. patente + casillero       │                                        │
     │◄──────────────────────────────│                                        │
     │  3. usuario confirma          │                                        │
     │  POST /api/album/stickers     │                                        │
     │  (misma imagen comprimida)    │                                        │
     │──────────────────────────────►│  extractPlate() → slot 000-999         │
     │                               │  valida imagen (tipo/tamaño) #10       │
     │                               │  chequea unicidad (409 si ocupado)     │
     │                               │  storeImage() ───────────────────────►│ disco/Cloudinary
     │                               │  INSERT stickers + activity #33       │
     │                               │  + notification al dueño #34          │
     │  4. grilla se actualiza       │◄──────────────────────────────────────│
```

**Compresión en el navegador:** antes de cualquier envío, `UploadModal` pasa la foto (JPG/PNG de hasta 5 MB) por `compressImage()` de `frontend/src/lib/imageCompression.ts`, que con canvas (sin dependencias) la redimensiona a un lado mayor de **1280 px** como máximo (nunca agranda fotos chicas), aplica la orientación EXIF (`createImageBitmap(..., { imageOrientation: 'from-image' })`, con fallback a `<img>`) y la exporta como **data URL JPEG calidad 0,8**. Se comprime **una sola vez** y esa misma imagen se usa para el preview, el OCR y el guardado, así la foto de 3–5 MB de un celular viaja como unos cientos de KB (dos veces) en lugar de pesar varios MB en cada envío: el tráfico saliente es el recurso más caro del hosting gratuito. Si la compresión falla (navegador sin soporte, archivo corrupto) o no achica la imagen (p. ej. un PNG chico), se envía la original leída con `FileReader`, por lo que el flujo nunca se rompe. El resultado (`data:image/jpeg;base64,...`) cumple la validación del backend (`validateImageInput`: MIME JPG/PNG y `MAX_IMAGE_SIZE_MB`).

Detalles: la casilla solo se llena si está vacía (carácter lúdico, sin validación anti-fraude #8); la imagen viaja como data URL o URL http(s), y el backend responde `422` si la patente no es válida, `415`/`413` si el formato o tamaño de la imagen no corresponde.

## 6. Almacenamiento de Imágenes (#11 / #35)

La fachada `backend/src/services/images/index.ts` expone `storeImage()` / `deleteStoredImages()` y resuelve el proveedor según `IMAGE_PROVIDER`:

- **`local`** (default) — archivos en `backend/src/uploads/` con nombre aleatorio (URL inmutable) y miniatura WebP 320 px; Express los sirve en `/uploads`.
- **`cloudinary`** — nube gratuita; requiere credenciales en `.env`.
- El **borrado se propaga a todos los proveedores** (cada uno ignora URLs ajenas), permitiendo convivencia de fotos locales y de la nube.

La BD solo guarda URLs: la grilla usa `thumbnail_url` (#11) y el detalle la imagen original.

## 7. Colaboración: Álbumes Compartidos

- **Invitación (#12):** link con token de un solo uso y vencimiento de 7 días (`GET /invite/[token]` en el frontend). Al aceptar se crea `album_members` con rol `ASSOCIATE`.
- **Permisos:** dueño y asociados comparten permisos de captura; el dueño administra miembros (revocar #37) e invitaciones (revocar, log #39).
- **Log histórico (#33):** cada pegado/despegado inserta una fila en `sticker_activities` con snapshot del nombre (sobrevive a bajas de cuenta).
- **Notificaciones (#34):** avisos al dueño por figurita pegada, asociado sumado/desvinculado y acceso revocado; el frontend las muestra en la campana y permite marcar leídas.
- **Ranking (#40):** conteo de figuritas por miembro en álbumes compartidos.

## 8. Seguridad y Administración

- **Sesión:** JWT firmado (`JWT_SECRET`); el token y la sesión de usuario viven en `localStorage` del navegador.
- **Entradas:** validación de patente, tipo/MIME y tamaño de imagen (#10), y autorización por recurso (cada usuario solo opera sobre álbumes a los que accede #8).
- **Administración (#41):** panel privado (`AdminPanel`) con dashboard, gestión de usuarios (restringir/reactivar, rol admin) y consumo de APIs externas (#48). Los admins se siembran idempotentemente con `ADMIN_EMAILS`; `RESTRICTED` bloquea login y rutas.
- **Autoeliminación (#54):** `DELETE /api/users/me` elimina la cuenta de forma irreversible con cascada en BD y borrado de imágenes (ver [DATABASE_DER.md](DATABASE_DER.md) §onDelete y `deleteAccountCascade()`).

## 9. Despliegue con Infraestructura de Costo Cero ($0 USD)

- **Frontend:** Alojado en **Vercel** o **Netlify** con CI/CD automático desde el repositorio de GitHub.
- **Backend API:** Alojado en **Render** (Web Service gratuito) o **Railway**.
- **Base de Datos:** Instancia PostgreSQL alojada en **Supabase Free Tier** o **Neon.tech**.
- **Almacenamiento de Imágenes:** Capa gratuita de **Cloudinary** (hasta 25 GB de almacenamiento y ancho de banda mensual).

---

> **Relacionado:** [Base de datos (DER)](DATABASE_DER.md) · [Referencia de la API](API.md) · [Guía de desarrollo](DEVELOPMENT.md) · [README](../README.md)
