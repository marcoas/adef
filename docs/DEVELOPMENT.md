# 🛠️ Guía de Desarrollo

Cómo levantar el entorno, trabajar con el código y mantenerlo documentado.

## 1. Requisitos previos

- Docker Desktop / Docker Engine + Docker Compose (`docker compose` o `docker-compose`).
- Node.js v18+ y npm (opcional si se trabaja todo en contenedor).
- `gh` CLI (opcional) para operar con los issues de GitHub.

## 2. Arranque rápido

```bash
# 1) Variables de entorno
cp .env.example .env

# 2) Levantar todo (postgres + backend + frontend)
docker-compose up --build

# 3) Abrir
#    Frontend: http://localhost:3000
#    API:      http://localhost:4000/api/health
```

### Desarrollo sin Docker (recarga en caliente)

```bash
# Terminal 1 — backend
cd backend
npm install
npx prisma generate          # genera el cliente de Prisma desde schema.prisma
npm run dev                  # ts-node-dev en :4000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev                  # next dev en :3000
```

> La base de datos puede quedarse en contenedor mientras backend/frontend corren local: solo levantá el servicio `postgres` (`docker compose up postgres`) y asegurate de que `DATABASE_URL` apunte al host correcto (`localhost` en vez de `postgres`).

### Imágenes Docker (multi-stage)

`backend/Dockerfile` y `frontend/Dockerfile` tienen varios *targets*.
`docker-compose.yml` usa `target: dev` (recarga en caliente con el código
montado como volumen), así que el flujo de desarrollo no cambia.

| Target | Backend | Frontend |
|---|---|---|
| `dev` | `npm run dev` (ts-node-dev) | `npm run dev` (next dev) |
| `build` | `npm ci` + `tsc` + `prisma generate` | `npm install` + `next build` (`NEXT_PUBLIC_*` como build args) |
| `migrate` | `prisma migrate deploy` y termina (pre-deploy) | — |
| `production` (último, el de por defecto) | Solo dependencias de producción, `NODE_ENV=production`, `node dist/index.js` bajo `tini`, usuario `node` | `next start` |

```bash
# Construir la imagen de producción del backend y la de migraciones
cd backend
docker build --target production -t album-backend:prod .
docker build --target migrate    -t album-backend:migrate .
```

Las imágenes funcionan en x86_64 y ARM64 (Oracle A1): el motor de Prisma
(`linux-musl[-arm64]-openssl-3.0.x`) y el binario de sharp se resuelven dentro
del build según la arquitectura. El despliegue completo está en
[DEPLOY_GUIDE.md](DEPLOY_GUIDE.md); `docker-compose.prod.yml` + `Caddyfile`
son la variante de producción en una sola VM.

## 3. Scripts npm

| Comando | Contexto | Descripción |
|---|---|---|
| `npm run dev` | backend | Servidor con recarga (`ts-node-dev`). |
| `npm run build` | backend | Compila TypeScript (`tsc`) y regenera el cliente Prisma. |
| `npm start` | backend | Producción: `node dist/index.js` (requiere `npm run build`). |
| `npm run prisma:generate` | backend | Regenera `@prisma/client` tras tocar `schema.prisma`. |
| `npm run prisma:migrate` | backend | Crea una migración nueva (interactivo, pide nombre). Solo desarrollo. |
| `npm run migrate:deploy` | backend | Aplica las migraciones pendientes sin preguntar (`prisma migrate deploy`). Paso de pre-deploy en producción. |
| `npm run dev` / `build` / `lint` | frontend | Next.js dev / producción / ESLint. |

### Validaciones antes de commitear

```bash
cd backend  && npx prisma generate && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## 4. Variables de entorno

Todas están documentadas en [`.env.example`](../.env.example). Las más relevantes:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (Docker o Supabase/Neon). |
| `JWT_SECRET` | Secreto de firma del JWT (obligatorio cambiarlo en producción). |
| `ADMIN_EMAILS` | Correos sembrados como admin en cada login (#41). |
| `IMAGE_PROVIDER` | `local` o `cloudinary` (+ credenciales Cloudinary). |
| `MAX_IMAGE_SIZE_MB` | Tamaño máximo de foto a subir (#10). Se valida sobre la imagen ya comprimida por el navegador (normalmente < 0,5 MB). |
| `PLATE_RECOGNIZER_TOKEN` / `PLATE_RECOGNIZER_MONTHLY_QUOTA` | API ALPR y su cuota mensual (#48). Al alcanzar la cuota (llamadas del mes, exitosas + fallidas) el OCR deja de llamar a la API y responde `503`; `0` desactiva el corte. |
| `TRUST_PROXY` | Saltos de proxy inverso confiables para tomar la IP real de `X-Forwarded-For` (rate limit por IP). Por defecto `1` con `NODE_ENV=production` y desactivado en desarrollo; `0`/`false` lo desactiva. `true` se degrada a `1` por inseguro. |
| `NEXT_PUBLIC_API_URL` | URL de la API para el frontend. |
| `FRONTEND_URL` | URL pública del frontend (para armar links de invitación). |

## 5. Base de datos y migraciones

- La **fuente de verdad** es [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma); el modelo completo se describe en [DATABASE_DER.md](DATABASE_DER.md).
- Para cambiar el esquema:

```bash
cd backend
# 1) editar prisma/schema.prisma
npm run prisma:migrate        # genera carpeta en prisma/migrations/ con SQL
npm run prisma:generate       # refresca los tipos del cliente
```

- Las migraciones se versionan en git y se aplican **una vez por despliegue**
  con `npm run migrate:deploy`, nunca al arrancar el proceso: en Render dentro
  del build (el plan free no tiene *pre-deploy*) y en Docker Compose de
  producción con el servicio `migrate`. Ver [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md).
- En desarrollo no se aplican solas: tras clonar, o tras un `pull` que trae
  migraciones nuevas, correr `npm run migrate:deploy` (o `prisma:migrate`)
  en `backend/` contra la base local.
- **Regla:** nunca editar una migración ya creada; crear una nueva que corrija.

## 6. Convenciones del código

- **TypeScript estricto** en ambas capas; sin `any` salvo datos externos justificados.
- **Comentarios inline:** todo archivo comienza con un JSDoc de cabecera que explica su responsabilidad; los bloques no obvios llevan comentario. Cuando una línea/función corresponde a un issue, se referencia con `// Issue #NN:` (patrón usado en todo el repo).
- **Documentación Markdown:** si una decisión de diseño o un endpoint cambia, actualizar el doc correspondiente en `docs/` en el mismo commit.
- **i18n:** toda cadena visible en UI se agrega en `frontend/src/lib/i18n.ts` con traducción **ES y EN** y se lee con `const { t } = useLocale()`; no hardcodear textos en los componentes.
- **Backend:** rutas nuevas en `backend/src/routes/<dominio>.ts` envueltas en `asyncHandler`; la lógica reutilizable va en `services/`, la configuración en `config.ts`.
- **Frontend:** llamar al backend solo con `lib/api.ts` (nunca `fetch` directo ni leer `localStorage` para el token) y declarar tipos compartidos en `types/domain.ts`.
- **Fotos:** toda imagen que se envíe al backend pasa antes por `compressImage()` de `lib/imageCompression.ts` (máx. 1280 px, JPEG 0,8, orientación EXIF) y se reutiliza el mismo resultado en todos los envíos; no mandar el base64 original del archivo.
- **Chequeos:** `npm run typecheck` (backend) y `npm run lint` + `npm run build` (frontend) antes de commitear.
- **Estilos:** variables CSS globales (`--bg-card`, `--border-color`, etc.) y clases utilitarias existentes (`btn-primary`, `btn-secondary`, `btn-danger`, `modal-overlay`...); evitar estilos inline salvo dinamismo.
- **Popups de confirmación:** usar `ConfirmDialog` (Issue #31), nunca `window.confirm`.

## 7. Flujo de trabajo con GitHub (issues)

1. Crear/leer el issue; el título o la rama/commit lo referencian con `#NN`.
2. Implementar la solución acotada al issue.
3. Validar con `tsc --noEmit` (backend y frontend).
4. **Un commit por issue**, con mensaje `feat(#NN): ...` / `fix(#NN): ...`.
5. Push a `main` y comentar el issue con un resumen de lo hecho; cerrarlo cuando esté verificado.

## 8. Documentación del proyecto

| Documento | Contenido |
|---|---|
| [README](../README.md) | Vista general, stack y arranque. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitectura, estructura y flujos. |
| [DATABASE_DER.md](DATABASE_DER.md) | Modelo de datos completo. |
| [API.md](API.md) | Todos los endpoints. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Hosting con costo 0 y capacidad medida. |
| [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) | Despliegue paso a paso (Render + Vercel + Neon, u Oracle). |
| Este archivo | Entorno, scripts y convenciones. |

**Regla:** todo cambio (endpoints, arquitectura, dependencias, variables de
entorno, esquema de BD, despliegue) actualiza en el **mismo commit** la
documentación afectada de esta tabla y `.env.example`.

---