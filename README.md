# 🚗 Álbum de Patentes de Argentina

Webapp lúdica y familiar (responsive mobile y desktop) inspirada en el concepto de llenar un álbum de figuritas, basada en la colección y registro fotográfico de patentes de automóviles en Argentina.

---

## 📌 Características Principales

- **Álbum de 1000 Figuritas (000 al 999):** Cada usuario posee un álbum digital con 1000 casilleros basados en los 3 últimos dígitos numéricos de las patentes.
- **Formato de Patentes Soportados (Argentina):**
  - Modelo Antiguo: `AAA 000` (Ejemplo: `ABC 123` ➔ Casillero **123**).
  - Modelo Vigente (Mercosur): `AA 000 AA` (Ejemplo: `AE 789 CD` ➔ Casillero **789**).
- **Escaneo con OCR (Reconocimiento Automático):** Procesa imágenes de patentes y ubica automáticamente la figurita en el casillero correspondiente.
- **Colaboración Familiar / Asociados:** Invita a amigos o familiares a compartir y completar un mismo álbum.
- **Multi-idioma (i18n):** Interfaz disponible en Español e Inglés.
- **Entorno 100% Gratuito y Dockerizado:** Despliegue local con un solo comando utilizando Docker Compose.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Plataforma Hosting / Producción (Costo 0) |
|---|---|---|
| **Frontend** | React / Next.js, CSS Modules, Lucide Icons, i18next | Vercel / Netlify |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM, Tesseract OCR | Render / Railway (Free) |
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

## 📄 Documentación Adicional

- [Diagrama de Entidad Relación (DER)](docs/DATABASE_DER.md)
- [Arquitectura del Sistema y Flujo OCR](docs/ARCHITECTURE.md)
