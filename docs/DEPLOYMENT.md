# 🌐 Despliegue: opciones de hosting y capacidad

Análisis de dónde publicar el sistema con **costo 0** y cuántos usuarios
simultáneos soporta cada opción. Medido el **2026-10-20** sobre el backend sin
OCR local (el reconocimiento es solo una llamada a Plate Recognizer). Los
límites de los planes gratuitos cambian seguido: revisá las fuentes antes de
decidir.

---

## 1. Opciones

| | **A. Servicios administrados** | **B. Oracle Cloud Always Free** |
|---|---|---|
| Frontend | Vercel (Hobby) | misma VM |
| Backend | Render (Free Web Service) | VM ARM A1: 2 OCPU / 12 GB (Docker Compose) |
| Base de datos | Neon (Free) | PostgreSQL en la VM |
| Imágenes | Cloudinary (Free) | Cloudinary o disco local |
| Tarjeta de crédito | No | Sí (verificación; *Pay As You Go* recomendado) |
| Mantenimiento | Ninguno | SO, firewall, HTTPS, backups a cargo propio |
| Se duerme | Sí, tras ~15 min sin tráfico (despierta en 30–60 s) | No |

Ambas opciones usan **un solo repositorio**: Vercel apunta a `frontend/` y
Render a `backend/` mediante *Root Directory*.

> ⚠️ En la opción A **no** usar `IMAGE_PROVIDER=local`: el disco de Render es
> efímero y las fotos se pierden en cada deploy/reinicio. La base gratis de
> Render se borra a los 30 días: por eso Neon.

---

## 2. Capacidad medida

Prueba de carga con el backend en Docker limitado a **0,1 CPU / 512 MB**
(perfil Render) y **1,5 núcleos** (perfil Oracle), álbum de 300 figuritas,
fotos de 2,5 MB (12 MP) y 177 KB (1280 px), y Plate Recognizer simulado con
800 ms de latencia.

| | Perfil Render | Perfil Oracle |
|---|---|---|
| `GET /album` (300 figuritas, 97 KB) | 2,2 req/s | 60 req/s |
| Notificaciones | 11 req/s | 267 req/s |
| 1 escaneo (foto grande / chica) | 3,2 s / 1,3 s | 0,9 s |
| Escaneos por minuto (grandes / chicas) | ~25–34 / ~64 | ~575 / ~1.000 |
| Memoria máxima | ~97 MB | ~517 MB |
| Arranque en frío | ~50 s (+ despertar de Render) | ~4 s |

### Usuarios simultáneos estimados

Supuestos: cada usuario consulta las notificaciones cada 30 s (polling de
`NotificationsBell`) y recarga el álbum una vez por minuto; CPU al 50% como
margen; un escaneo envía la foto 2 veces (`/plates/ocr` y `/album/stickers`).

| | Opción A (Render…) | Opción B (Oracle) |
|---|---|---|
| Navegando | ~40–50 (álbumes de 300); ~20 con álbumes casi llenos | ~500–1.000 |
| Escaneando a la vez (< 5 s de espera) | 1–2 con fotos grandes, 3–4 comprimidas | 20+ |

Las cifras de Oracle están ajustadas a la baja (núcleos ARM ≈ 60–80% de la
máquina de prueba x86). No se simuló la latencia de red hacia Neon.

---

## 3. Límites externos (llegan antes que el servidor)

| Servicio | Límite gratuito | Impacto |
|---|---|---|
| **Plate Recognizer** | 2.500 lecturas/mes, 1 lectura/s | ~83 escaneos/día **en total**: es el techo real en ambas opciones. El backend encola las llamadas a 1/s y corta al llegar a la cuota (ver §4). |
| **Render** | 5 GB/mes de tráfico saliente (incluye llamadas a Plate Recognizer y Cloudinary) | ~750 escaneos/mes con fotos grandes (~10.000 comprimidas). Al superarlo, sin tarjeta, suspende el servicio hasta fin de mes. |
| **Neon** | 100 CU-hora/mes, 5 GB de tráfico | Con una pestaña abierta, el polling impide que la base se suspenda. |
| **Cloudinary** | 25 créditos/mes | Miles de fotos. |
| **Vercel Hobby** | 100 GB | Sin problema; **solo uso no comercial**. |
| **Oracle** | 10 TB de tráfico; reclama VMs ociosas (CPU/red/RAM < ~20% por 7 días) | Usar *Pay As You Go* para evitar el reclamo. Puede haber errores *Out of capacity* al crear la VM. |

---

## 4. Mejoras aplicadas (2026-10-20)

Las mejoras surgidas de la prueba de carga ya están implementadas; las cifras
de la sección 2 se midieron **antes** de aplicarlas.

| # | Mejora | Dónde |
|---|---|---|
| 1 | `trust proxy` configurable con `TRUST_PROXY` (por defecto `1` en producción): el rate limit usa la IP real del usuario. | `backend/src/app.ts`, `config.ts` |
| 2 | La foto se comprime en el navegador (lado mayor ≤ 1280 px, JPEG 0,8) una sola vez y se reutiliza para el OCR y el guardado. | `frontend/src/lib/imageCompression.ts`, `UploadModal.tsx` |
| 3 | `GET /album` trae solo el nombre de quien subió cada figurita. | `backend/src/routes/album.ts` |
| 4 | Compresión gzip de respuestas (`compression`). | `backend/src/app.ts` |
| 5 | Migraciones una vez por despliegue (`npm run migrate:deploy`), no al arrancar. | `render.yaml`, `docker-compose.prod.yml` |
| 6 | Llamadas a Plate Recognizer encoladas a 1/s y corte al alcanzar `PLATE_RECOGNIZER_MONTHLY_QUOTA` (`503` con `code: OCR_QUOTA_EXCEEDED`; el modal muestra el mensaje y permite cargar la patente a mano). | `backend/src/services/alprService.ts` |

**Riesgos conocidos:**
- La cola de 1/s es por proceso: con varias instancias del backend cada una
  tendría su propio límite.
- Con solicitudes simultáneas justo en el límite, la cuota se puede exceder
  por unas pocas llamadas.
- `TRUST_PROXY=1` supone un único proxy delante (Caddy en Oracle; el balanceador
  en Render). Si se agrega otro (p. ej. Cloudflare), subir el valor.
- Fotos a 1280 px: si la patente sale muy chica (foto lejana), la lectura puede
  empeorar levemente.

---

## 5. Preparación para producción

Resuelta: ver la guía paso a paso en **[DEPLOY_GUIDE.md](DEPLOY_GUIDE.md)**
(`render.yaml`, `frontend/vercel.json`, `backend/Dockerfile` multi-stage,
`docker-compose.prod.yml` + `Caddyfile` para Oracle, variables por servicio y
Google OAuth).

---

## Fuentes

- Render: [Free](https://render.com/docs/free) · [Outbound bandwidth](https://render.com/docs/outbound-bandwidth) · [New bandwidth pricing](https://render.com/blog/new-bandwidth-pricing-on-render)
- Neon: [Free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas) · [Pricing](https://neon.com/pricing)
- Plate Recognizer: [Sitio](https://platerecognizer.com/?p=332) · [Límite de 1 lectura/s](https://platerecognizer.com/zoneminder/)
- Cloudinary: [Billing and plans](https://cloudinary.com/documentation/billing_and_plans)
- Vercel: [Limits](https://vercel.com/docs/limits)
- Oracle: [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) · [InfoQ: recorte de A1 a 2 OCPU / 12 GB](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/) · [Reclamo de instancias ociosas](https://blog.51sec.org/2023/02/oracle-cloud-cleaning-up-idle-compute.html)
