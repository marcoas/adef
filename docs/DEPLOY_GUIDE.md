# 🚀 Guía de despliegue paso a paso

Cómo publicar el Álbum de Patentes con **costo 0**. El análisis de opciones,
límites y capacidad está en [DEPLOYMENT.md](DEPLOYMENT.md); este documento es
el *cómo*.

- **Opción A (recomendada):** Render (backend) + Vercel (frontend) + Neon
  (PostgreSQL) + Cloudinary (fotos). Sin tarjeta, sin mantenimiento.
- **Opción B:** una VM de Oracle Cloud Always Free con Docker Compose y Caddy
  (HTTPS). Más capacidad y no se duerme, pero el mantenimiento es propio.
  Ver [sección 10](#10-alternativa-oracle-cloud-always-free).

Archivos de despliegue del repositorio:

| Archivo | Uso |
|---|---|
| [`render.yaml`](../render.yaml) | Blueprint de Render para el backend. |
| [`frontend/vercel.json`](../frontend/vercel.json) | Vercel: framework y *Ignored Build Step* (solo despliega si cambia `frontend/`). |
| [`backend/Dockerfile`](../backend/Dockerfile) | Multi-stage: `dev`, `build`, `migrate`, `production`. |
| [`frontend/Dockerfile`](../frontend/Dockerfile) | Multi-stage: `dev`, `build`, `production`. |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) + [`Caddyfile`](../Caddyfile) | Opción B (una sola VM). |

---

## 1. Antes de empezar

- El código tiene que estar en GitHub (Render y Vercel despliegan desde ahí,
  en cada push a `main`).
- Tener a mano un gestor de contraseñas: vas a juntar unos 8 secretos.
- Orden de despliegue (cada paso necesita datos del anterior):
  1. Cuentas y credenciales: **Neon**, **Cloudinary**, **Plate Recognizer**
     y el **client id de Google** (pasos 2 a 5, en cualquier orden).
  2. **Render** (backend): necesita todo lo anterior → da la URL de la API.
  3. **Vercel** (frontend): necesita la URL de la API → da la URL pública.
  4. **Cerrar el circuito**: URL de Vercel en Google y en `FRONTEND_URL` de
     Render (paso 8).

---

## 2. Neon (PostgreSQL)

1. Crear cuenta en <https://neon.com> (plan **Free**, sin tarjeta).
2. *Create project*: nombre `album-patentes`, Postgres 16, región
   **AWS US East 1 (N. Virginia)**: la misma zona que el backend en Render
   (`region: virginia` en `render.yaml`). Cada consulta cruza esa distancia,
   así que base y backend tienen que estar juntos.
3. En *Connection Details*:
   - **Desactivar *Connection pooling***: usar la cadena **directa** (el host
     *no* contiene `-pooler`). `prisma migrate deploy` toma un *advisory lock*
     que no funciona a través de PgBouncer en modo transacción, y con el
     tráfico esperado no hace falta el pool.
   - Copiar la cadena; ya trae `?sslmode=require`. Agregar
     `&connect_timeout=15` para tolerar el despertar de Neon (se suspende a
     los 5 min sin uso):

```
postgresql://USUARIO:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=15
```

Esa es la `DATABASE_URL` del backend. No hace falta crear tablas: las crean
las migraciones en el primer deploy de Render.

---

## 3. Cloudinary (fotos)

1. Crear cuenta en <https://cloudinary.com> (plan **Free**).
2. *Settings → API Keys*: anotar **Cloud name**, **API Key** y **API Secret**.
3. No hace falta crear la carpeta: el backend usa `CLOUDINARY_FOLDER`
   (`album-patentes`) y Cloudinary la crea al subir la primera foto.

> En Render el disco es efímero: con `IMAGE_PROVIDER=local` las fotos se
> perderían en cada deploy o reinicio. Por eso `render.yaml` fija
> `IMAGE_PROVIDER=cloudinary`.

---

## 4. Plate Recognizer (OCR de patentes)

1. Crear cuenta en <https://platerecognizer.com> → producto **Snapshot Cloud**
   (plan gratuito: 2.500 lecturas/mes, 1 lectura/s).
2. En el panel de la cuenta copiar el **API Token**: es
   `PLATE_RECOGNIZER_TOKEN`. Sin él, el escaneo responde error.
3. `PLATE_RECOGNIZER_MONTHLY_QUOTA=2500` (ya fijado en `render.yaml`) hace que
   el panel de administración muestre el consumo contra el límite real.

---

## 5. Google OAuth (client id)

El login usa Google Identity Services con un *token client* (popup): solo
hacen falta **Authorized JavaScript origins**; no se usan *redirect URIs*.

1. <https://console.cloud.google.com> → crear un proyecto
   (`album-patentes`).
2. *APIs & Services → OAuth consent screen* (o *Google Auth Platform →
   Branding / Audience*): tipo **External**, nombre de la app, correo de
   soporte. Alcances: `openid`, `email`, `profile` (no requieren
   verificación de Google).
   - Mientras el estado sea **Testing**, solo pueden entrar los *test users*
     cargados. Para abrirlo a todos: *Publish app* → **In production**.
3. *Credentials → Create credentials → OAuth client ID → Web application*.
   - *Authorized JavaScript origins*: por ahora `http://localhost:3000`.
     La URL de Vercel se agrega en el [paso 8](#8-cerrar-el-circuito-google-y-cors)
     (todavía no existe).
   - *Authorized redirect URIs*: vacío.
4. Copiar el **Client ID** (`xxxx.apps.googleusercontent.com`). Se usa en
   **dos** lugares con el mismo valor: `GOOGLE_CLIENT_ID` (Render, para
   verificar tokens) y `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Vercel, para abrir el
   popup).

---

## 6. Render (backend)

### 6.1 Cómo está configurado (`render.yaml`)

- **Runtime `node`, plan `free`** (0,1 CPU / 512 MB; se duerme tras ~15 min
  sin tráfico y tarda 30–60 s en despertar).
- **Migraciones en el build, no al arrancar.** `preDeployCommand` existe, pero
  Render lo ofrece [solo en servicios pagos](https://render.com/docs/deploys);
  por eso el comando de build es:

  ```
  npm ci --include=dev && npm run build && npm run migrate:deploy
  ```

  Las migraciones corren **una vez por deploy**, antes de que la versión nueva
  reciba tráfico. Si fallan, el deploy falla y sigue sirviendo la versión
  anterior. Despertar o reiniciar el servicio **no** vuelve a migrar. Con un
  plan pago, conviene moverlo a `preDeployCommand: npm run migrate:deploy`.
- **Por qué no `runtime: docker`:** Render no permite elegir el `--target`
  del Dockerfile ni correr el pre-deploy en el plan free. Las migraciones
  tendrían que ir en el arranque del contenedor, que es justo lo que se quiere
  evitar. El runtime node además arranca más rápido al despertar.
- Arranca con `node dist/index.js` (equivale a `npm start`, sin el proceso
  extra de npm: unos 30 MB menos de RAM).
- `healthCheckPath: /api/health` (consulta la BD: si Neon no responde, Render
  no da por bueno el deploy).
- `buildFilter`: solo redespliega si cambia `backend/**` o `render.yaml`.

### 6.2 Pasos

1. Crear cuenta en <https://render.com> e iniciar sesión con GitHub.
2. *New → Blueprint* → elegir el repositorio. Render lee `render.yaml` y
   muestra el servicio `album-patentes-api`.
3. Completar las variables marcadas `sync: false`:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Cadena **directa** de Neon (paso 2). |
| `FRONTEND_URL` | Provisoriamente `http://localhost:3000`; se corrige en el paso 8. |
| `GOOGLE_CLIENT_ID` | Client ID del paso 5. |
| `PLATE_RECOGNIZER_TOKEN` | Token del paso 4. |
| `ADMIN_EMAILS` | Tu correo de Google (separar varios con coma). |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Paso 3. |

   Ya vienen definidas: `NODE_VERSION=20`, `NODE_ENV=production`,
   `IMAGE_PROVIDER=cloudinary`, `CLOUDINARY_FOLDER`, `MAX_IMAGE_SIZE_MB=5`,
   `PLATE_RECOGNIZER_MONTHLY_QUOTA=2500`. `JWT_SECRET` lo genera Render
   (`generateValue`), y `PORT` lo inyecta Render.
4. *Apply*. En el log del build tienen que aparecer `prisma migrate deploy` y
   `All migrations have been successfully applied.`
5. Anotar la URL pública: `https://album-patentes-api.onrender.com` (o la que
   asigne Render). Probar:

```bash
curl https://album-patentes-api.onrender.com/api/health
# {"status":"online","database":"connected (PostgreSQL)",...}
```

> `sync: false` solo pide el valor **al crear** el Blueprint. Después, los
> cambios de variables se hacen en *Environment* del servicio (y no se pisan
> al volver a sincronizar el Blueprint).

---

## 7. Vercel (frontend)

1. Crear cuenta en <https://vercel.com> (plan **Hobby**: solo uso no
   comercial) con GitHub.
2. *Add New → Project* → importar el repositorio.
3. **Root Directory: `frontend`**. Vercel detecta Next.js y usa
   `frontend/vercel.json`.
4. *Environment Variables* (entorno **Production**, y **Preview** si se
   quieren previews):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://album-patentes-api.onrender.com/api` (con `/api`, sin `/` final) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | El mismo Client ID del paso 5. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `es` (opcional; `es` es el valor por defecto). |

5. *Deploy*. Anotar el dominio de producción, p. ej.
   `https://album-patentes.vercel.app`.

> ⚠️ Las variables `NEXT_PUBLIC_*` se **incrustan en el JavaScript al
> compilar**. Si se cambian, hay que **redesplegar** (*Deployments → ⋯ →
> Redeploy*); cambiarlas en el panel no afecta al deploy ya publicado.

**Ignored Build Step.** `frontend/vercel.json` define
`"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."`. Vercel lo ejecuta dentro
de `frontend/`: si el último commit no tocó `frontend/`, el comando sale con
código 0 y el build se omite (los cambios solo de backend o docs no gastan
builds). En el primer deploy, o si no hay commit anterior, sale con error y el
build se hace igual. Para forzar un build: *Redeploy* desde el panel.

---

## 8. Cerrar el circuito (Google y CORS)

1. **Google Cloud Console → Credentials → el OAuth client → Authorized
   JavaScript origins**: agregar el dominio de producción de Vercel, sin `/`
   final y sin ruta:
   - `https://album-patentes.vercel.app`
   - (si hay dominio propio) `https://album.midominio.com`
   - Mantener `http://localhost:3000` para desarrollo.

   Los cambios pueden tardar unos minutos en aplicarse.
2. **Render → Environment → `FRONTEND_URL`** = `https://album-patentes.vercel.app`
   (exacto, sin `/` final). Es el único origen que acepta CORS y la base de
   los links de invitación. Guardar → Render redespliega.

> Las URLs de *preview* de Vercel (`album-patentes-git-rama-...vercel.app`)
> **no** pueden iniciar sesión: Google no admite comodines en los orígenes y
> CORS acepta un único origen. Probar los previews contra un backend local o
> usar solo producción.

---

## 9. Verificación post-deploy

1. `curl https://<backend>/api/health` → `200` con `"database":"connected (PostgreSQL)"`.
   La primera llamada tras un rato puede tardar 30–60 s (Render despierta).
2. Abrir el frontend → **Iniciar sesión con Google** → elegir cuenta.
   - `redirect_uri_mismatch` / `origin_mismatch` / popup que se cierra:
     falta el origen en Google (paso 8.1).
   - Error de CORS en la consola del navegador: `FRONTEND_URL` mal escrito.
   - `500` en `/api/auth/login`: falta `GOOGLE_CLIENT_ID` en Render.
3. Con el correo de `ADMIN_EMAILS`: debe aparecer el panel de administración.
4. Escanear una foto de una patente: la figurita se pega y la imagen se ve
   desde `res.cloudinary.com` (si la URL apunta a `onrender.com/uploads`,
   `IMAGE_PROVIDER` no es `cloudinary`).
5. Invitar a un asociado: el link debe empezar con la URL de Vercel.
6. En Render, *Events*: el deploy en verde; en *Logs*:
   `Servidor Backend conectado a PostgreSQL iniciado en puerto 10000`.

**Nuevas migraciones:** crearlas en desarrollo (`npm run prisma:migrate`),
commitear `backend/prisma/migrations/` y hacer push. El próximo deploy de
Render las aplica en el build.

---

## 10. Alternativa: Oracle Cloud Always Free

Todo en una VM: Caddy (HTTPS automático) → frontend Next.js y backend Express;
PostgreSQL en la misma red interna de Docker, sin puertos expuestos.
Un solo dominio sirve las dos cosas (`/api` y `/uploads` van al backend), así
que alcanza un registro DNS y un origen en Google.

```
Internet ─► :443 Caddy ─┬─ /api/*, /uploads/* ─► backend:4000 ─► postgres:5432
                        └─ resto ──────────────► frontend:3000
```

### 10.1 Crear la VM

1. Cuenta en <https://cloud.oracle.com> (pide tarjeta para verificar; pasar a
   **Pay As You Go** evita que Oracle reclame VMs ociosas y sigue sin costo si
   no se sale de los recursos Always Free).
2. *Compute → Instances → Create*: imagen **Ubuntu 24.04**, forma
   **VM.Standard.A1.Flex** (ARM64), 2 OCPU / 12 GB. Si da *Out of capacity*,
   reintentar más tarde u otro *availability domain*.
3. Cargar tu clave SSH pública. Anotar la IP pública.
4. *Networking → VCN → Security List* de la subred: agregar reglas de
   entrada TCP **80** y **443** desde `0.0.0.0/0` (y UDP 443 para HTTP/3).
5. En la VM, el firewall de Ubuntu en Oracle bloquea todo salvo SSH:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 10.2 Dominio

Apuntar un registro **A** del dominio (p. ej. `album.midominio.com`) a la IP
pública. Sin dominio propio sirve `IP-CON-GUIONES.sslip.io` (p. ej.
`130-61-10-20.sslip.io`): resuelve a esa IP y Let's Encrypt emite el
certificado. Google OAuth exige un dominio (no acepta IPs como origen).

### 10.3 Instalar y configurar

```bash
# Docker Engine + plugin compose (soporta ARM64)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/<usuario>/<repo>.git album && cd album
cp .env.example .env
nano .env
```

Valores del `.env` para producción (las demás se pueden dejar como están):

| Variable | Valor |
|---|---|
| `DOMAIN` | `album.midominio.com` (sin `https://`). |
| `POSTGRES_USER` / `POSTGRES_DB` | A elección. |
| `POSTGRES_PASSWORD` | Aleatoria: `openssl rand -base64 24`. |
| `JWT_SECRET` | Aleatorio: `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | Client ID del paso 5 (también se usa para el frontend). |
| `PLATE_RECOGNIZER_TOKEN` | Paso 4. |
| `PLATE_RECOGNIZER_MONTHLY_QUOTA` | `2500`. |
| `ADMIN_EMAILS` | Tu correo. |
| `IMAGE_PROVIDER` | `cloudinary` (recomendado, ver nota) o `local` (fotos en el volumen `uploads`). |
| `CLOUDINARY_*` | Si `IMAGE_PROVIDER=cloudinary`. |

`docker-compose.prod.yml` arma solo lo demás: `DATABASE_URL` (apunta al
servicio `postgres`), `FRONTEND_URL=https://${DOMAIN}`,
`NEXT_PUBLIC_API_URL=https://${DOMAIN}/api` y
`NEXT_PUBLIC_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}`. Si falta una variable
obligatoria, `docker compose` se niega a arrancar y dice cuál.

> **Nota sobre `IMAGE_PROVIDER=local` detrás de Caddy:** hasta que el backend
> configure `app.set('trust proxy', 1)` (mejora 1 de
> [DEPLOYMENT.md](DEPLOYMENT.md)), arma las URLs de las fotos con `http://` y
> el rate limit ve a todos los usuarios con la IP de Caddy. Con Cloudinary las
> URLs son siempre `https://`.

### 10.4 Levantar

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Qué pasa en cada `up`:

1. Se construyen las imágenes **nativas ARM64** (target `production` del
   backend y del frontend; el primer build tarda varios minutos).
2. `postgres` arranca y espera a estar sano.
3. `migrate` (target `migrate` del backend) corre `prisma migrate deploy` y
   **termina**: es el paso de pre-deploy.
4. `backend` arranca **solo si la migración terminó bien**. Si el contenedor
   se reinicia, no vuelve a migrar.
5. Caddy obtiene el certificado de Let's Encrypt (requiere que el DNS ya
   apunte a la VM y los puertos 80/443 estén abiertos).

### 10.5 Google, verificación y operación

- Google Cloud Console → *Authorized JavaScript origins*: agregar
  `https://album.midominio.com`.
- Verificar: `curl https://album.midominio.com/api/health` y seguir la
  [sección 9](#9-verificación-post-deploy).
- Logs: `docker compose -f docker-compose.prod.yml logs -f backend caddy`.
- **Actualizar** a una versión nueva:

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build   # vuelve a correr migrate
docker image prune -f
```

- **Backups** de la base (a cargo propio), p. ej. con `cron` diario:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup-$(date +%F).sql.gz
```

- Mantener el SO al día (`sudo apt update && sudo apt upgrade`) y no publicar
  el puerto de Postgres.

---

## 11. Probar la imagen de producción en local

```bash
cd backend
docker build --target production -t album-backend:prod .
docker build --target migrate    -t album-backend:migrate .

# Migrar y arrancar contra una base accesible desde el contenedor
docker run --rm -e DATABASE_URL=... album-backend:migrate
docker run --rm -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... album-backend:prod
curl http://localhost:4000/api/health
```

Con Docker Buildx se puede construir para ARM64 desde x86
(`docker buildx build --platform linux/arm64 --target production .`), con
QEMU instalado; en la VM de Oracle no hace falta porque el build ya es nativo.
