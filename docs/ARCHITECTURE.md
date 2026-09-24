# Arquitectura del Sistema y Procesamiento de Patentes

## 1. Visión General de la Arquitectura

El sistema **Álbum de Patentes** está construido siguiendo el patrón de arquitectura desacoplada de Microservicios / API Restful + Frontend SPA/SSR.

```
[ Cliente Móvil / Desktop (Next.js) ]
                │
                ├── Requests HTTP / Rest API ──► [ Express Backend API ]
                │                                       │
                ├── Tesseract.js (Client OCR)          ├── Prisma ORM
                │                                       │
                └── Renderizado de Figuritas (000-999) └──► [ PostgreSQL DB ]
```

---

## 2. Lógica de Extracción de Patentes

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

---

## 3. Despliegue con Infraestructura de Costo Cero ($0 USD)

- **Frontend:** Alojado en **Vercel** o **Netlify** con CI/CD automático desde el repositorio de GitHub.
- **Backend API:** Alojado en **Render** (Web Service gratuito) o **Railway**.
- **Base de Datos:** Instancia PostgreSQL alojada en **Supabase Free Tier** o **Neon.tech**.
- **Almacenamiento de Imágenes:** Capa gratuita de **Cloudinary** (hasta 25 GB de almacenamiento y ancho de banda mensual).
