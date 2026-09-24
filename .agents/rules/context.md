---
trigger: always_on
---

# Contexto del Proyecto: Álbum de Patentes

## Descripción General
Webapp lúdica y familiar (responsive mobile y desktop) inspirada en el concepto de llenar un álbum de figuritas, basada en la colección y registro fotográfico de patentes de automóviles en Argentina.

## Stack Tecnológico (100% Gratuito y Open Source)
* **Frontend:** React / Next.js (o similar SSR/SPA moderno) con diseño adaptable (Mobile-First).
* **Backend:** Node.js (con gestor de dependencias estándar similar a Composer/npm) o Python (FastAPI).
* **Base de Datos:** MariaDB, Mysql, PostgreSQL (alojada en capa gratuita de proveedores como Supabase, Neon o Render) para datos relacionales y usuarios.
* **Almacenamiento de Imágenes:** Cloudinary (capa gratuita) o almacenamiento compatible con S3 gratuito (ej. Cloudflare R2 con capa gratuita generosa).
* **Contenedorización:** Docker y Docker Compose para levantar todo el entorno localmente sin fricción.

## Alojamiento y Despliegue (Infraestructura 0 Costo)
* **Control de Versiones y Código:** GitHub (Repositorio público o privado gratuito).
* **Frontend y Hosting Web:** Vercel o Netlify (capa gratuita para proyectos personales).
* **Backend y API:** Render, Railway (plan gratuito) o Fly.io.
* **Base de Datos:** Supabase / Neon (Free Tier).

## Reglas de Negocio y Funcionalidades
1. **Autenticación:** Sistema centralizado mediante OAuth (Google, Facebook, Apple) integrado (ej. NextAuth o Supabase Auth).
2. **Estructura del Álbum:**
   * Cada usuario registrado posee **un único álbum**.
   * El álbum contiene exactamente **1000 casilleros numerados del 000 al 999** (basados en los últimos 3 dígitos numéricos de la patente).
3. **Colaboración:** 
   * Los usuarios pueden invitar a uno o varios "asociados" para compartir el mismo álbum.
   * El propietario y sus asociados tienen permisos idénticos para capturar y pegar figuritas.
4. **Reconocimiento de Patentes (OCR / IA):**
   * Modelos de patentes soportados en Argentina:
     * Modelo Antiguo: `AAA 000` (Tres letras, tres números).
     * Modelo Vigente: `AA 000 AA` (Dos letras, tres números, dos letras).
   * El sistema debe procesar la imagen mediante un servicio de OCR o IA gratuito/liviano (ej. Tesseract.js del lado del cliente/servidor o APIs con nivel gratuito como Google Cloud Vision / alternativas open source).
   * **Lógica de pegado:** Se extraen los últimos 3 dígitos numéricos de la patente leída y la fotografía se asigna automáticamente al casillero correspondiente (siempre que esté vacío). No se requiere validación estricta de fraude o edición por ser de carácter lúdico.
5. **Seguridad y Estándares:**
   * Alto estándar de seguridad en manejo de sesiones OAuth y validación de entradas.
   * Código limpio, modular, tipado (TypeScript recomendado) y documentado.

## Internacionalización (i18n)
* **Idioma principal:** Español.
* **Requisito:** Arquitectura preparada para soportar traducción a otros idiomas mediante archivos de recursos de texto (JSON/i18next).

## Documentacion
El codigo y base de datos debera quedar excelentemente documentado tanto inline como en documentos especialmente creados a tal fin. Con graficos tipo DER

## Restricciones Técnicas
* **Costo Cero:** Ninguna herramienta, API, motor de base de data o servicio de hosting debe requerir tarjeta de crédito ni generar cargos mensuales.
* **Dockerización:** Todo el entorno de desarrollo debe estar orquestado mediante `docker-compose.yml` en la raíz del proyecto.