# 🚗 Álbum de Patentes

Webapp lúdica y familiar (responsive mobile y desktop) inspirada en el concepto de llenar un álbum de figuritas, basada en la colección y registro fotográfico de patentes de automóviles.

---

## 📌 Características Principales

- **Álbum de 1000 Figuritas (000 al 999):** Cada usuario posee un álbum digital con 1000 casilleros basados en los 3 últimos dígitos numéricos de las patentes.
- **Formato de Patentes Soportados:**
  - Modelo Antiguo: `AAA 000` (Ejemplo: `ABC 123` ➔ Casillero **123**).
  - Modelo Vigente (Mercosur): `AA 000 AA` (Ejemplo: `AE 789 CD` ➔ Casillero **789**).
- **Escaneo con OCR (Reconocimiento Automático):** Procesa imágenes de patentes y ubica automáticamente la figurita en el casillero correspondiente. La foto se comprime en el navegador (máx. 1280 px, JPEG) antes de subirla para ahorrar datos móviles y tráfico del servidor.
- **Colaboración Familiar / Asociados:** Invita a amigos o familiares a compartir y completar un mismo álbum.
- **Multi-idioma (i18n):** Interfaz disponible en Español e Inglés.
- **Entorno 100% Gratuito y Dockerizado:** Despliegue local con un solo comando utilizando Docker Compose.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Plataforma Hosting / Producción (Costo 0) |
|---|---|---|
| **Frontend** | React / Next.js, CSS Modules, Lucide Icons, i18next | Vercel |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM, Plate Recognizer API (OCR) | Render (Free) / Oracle Cloud Always Free |
| **Base de Datos** | PostgreSQL 16 | Supabase / Neon (Free Tier) |
| **Imágenes** | Cloudinary (Free Tier) / Local Provider | Cloudinary |
| **Orquestación** | Docker & Docker Compose | Containerized local dev |

---

## 🚀 Inicio Rápido en Desarrollo Local

### Requisitos Previos
- Docker Desktop / Docker Engine & Docker Compose (`docker compose` o `docker-compose`).
- Node.js v18+ (opcional para desarrollo sin contenedor).

### Pasos para Ejecutar
1. Clonar el repositorio y copiar las variables de entorno:
   ```bash
   cp .env.example .env
   ```

2. Levantar los contenedores (Frontend, Backend y PostgreSQL):
   ```bash
   docker-compose up --build
   ```

3. Acceder a las aplicaciones:
   - **Frontend App:** [http://localhost:3000](http://localhost:3000)
   - **Backend API:** [http://localhost:4000/api/health](http://localhost:4000/api/health)
   - **Base de Datos Postgres:** `localhost:5432`

---

## 📂 Estructura del Proyecto

```
adef/
├── docker-compose.yml      # Orquestación: postgres + backend + frontend
├── docker-compose.prod.yml # Producción en una VM (Oracle) + Caddyfile (HTTPS)
├── render.yaml             # Blueprint de Render (backend)
├── .env.example            # Variables de entorno documentadas
├── docs/                   # Documentación del sistema (ver abajo)
├── backend/                # API REST (Express + TypeScript + Prisma)
│   ├── src/app.ts          #   App Express (middlewares + routers)
│   ├── src/routes/         #   Un router por dominio
│   ├── src/middleware/     #   Autenticación JWT / admin y consumo de API
│   ├── src/services/       #   Lógica de dominio, OCR/ALPR e imágenes
│   └── prisma/             #   Schema y migraciones (PostgreSQL)
└── frontend/               # App Next.js (App Router)
    ├── src/app/            #   Páginas (principal, /invite/[token])
    ├── src/components/     #   Componentes React (grilla, modales, paneles)
    ├── src/lib/            #   Cliente de API, sesión, idioma (ES/EN), tema, compresión de fotos
    └── src/types/          #   Tipos de dominio compartidos
```

---

## 🧑‍💻 Comandos de Desarrollo

```bash
# Compilar / validar sin ejecutar
cd backend  && npx prisma generate && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# Backend en caliente (sin Docker): npm run dev
# Frontend en caliente (sin Docker): npm run dev
# Nueva migración BD:                npm run prisma:migrate  (en backend/)
# Aplicar migraciones (pre-deploy):  npm run migrate:deploy  (en backend/)
```

Guía completa de entorno, scripts, migraciones y convenciones: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

---

## 📄 Documentación Adicional

- [Arquitectura del Sistema, estructura y flujos](docs/ARCHITECTURE.md)
- [Diagrama de Entidad Relación (DER) y reglas de cascada](docs/DATABASE_DER.md)
- [Referencia de la API REST (endpoints)](docs/API.md)
- [Guía de Desarrollo (setup, scripts, convenciones)](docs/DEVELOPMENT.md)
- [Despliegue: opciones de hosting y capacidad](docs/DEPLOYMENT.md)
- [Guía de despliegue paso a paso (Render + Vercel + Neon, u Oracle Cloud)](docs/DEPLOY_GUIDE.md)
