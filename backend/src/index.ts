/**
 * Punto de entrada del backend (Express + TypeScript + Prisma).
 *
 * Estructura de src/:
 *   - config.ts            Variables de entorno.
 *   - db.ts                PrismaClient compartido.
 *   - app.ts               App Express: middlewares globales + routers.
 *   - middleware/          Autenticación JWT / admin (#41) y consumo de API.
 *   - routes/              Un router por dominio (auth, plates, album,
 *                          invites, notifications, users, admin, health).
 *   - services/            Lógica de dominio reutilizable (álbum, avisos,
 *                          bajas de cuenta, ALPR, imágenes local/Cloudinary).
 *   - utils/               Extracción de patentes (plateExtractor).
 *
 * Documentación completa en README.md y docs/.
 */
import { PORT } from './config';
import { app } from './app';

app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend conectado a PostgreSQL iniciado en puerto ${PORT}`);
});
