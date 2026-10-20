/**
 * Construcción de la aplicación Express (sin `listen`, para poder testearla).
 *
 * Aplica los middlewares globales de seguridad, el contador de consumo de la
 * API, sirve las imágenes locales y monta un router por dominio bajo /api.
 * Para sumar un dominio nuevo: crear `routes/<dominio>.ts` y montarlo aquí.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import { FRONTEND_URL } from './config';
import { trackApiUsage } from './middleware/apiUsage';
import { generalLimiter } from './middleware/rateLimit';
import { UPLOADS_DIR } from './services/images';
import authRoutes from './routes/auth';
import plateRoutes from './routes/plates';
import albumRoutes from './routes/album';
import inviteRoutes from './routes/invites';
import notificationRoutes from './routes/notifications';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import healthRoutes from './routes/health';

export const app = express();

// Security & Middleware
app.use(helmet({
  // Issue #11: las imágenes del álbum se sirven desde el backend
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
// El body se limita a 10 MB: suficiente para una foto de 5 MB en base64
// (~6.8 MB) y bastante menos que los 25 MB previos, que facilitaban agotar
// memoria. La validación fina de tamaño de imagen vive en albumService (#10).
app.use(express.json({ limit: '10mb' }));

// Límite de tasa general por IP (las rutas sensibles suman uno más estricto)
app.use('/api', generalLimiter);
app.use('/api', trackApiUsage);

// Issue #11: servir archivos estáticos con caché de larga duración.
// Las imágenes son inmutables (nombre con hash aleatorio), por lo que se
// cachean agresivamente para no volver a descargarlas en cada visita.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '365d',
  immutable: true,
  fallthrough: true,
}));

app.use('/api', authRoutes);
app.use('/api', plateRoutes);
app.use('/api', albumRoutes);
app.use('/api', notificationRoutes);
app.use('/api', userRoutes);
app.use('/api', inviteRoutes);
app.use('/api', adminRoutes);
app.use('/api', healthRoutes);
