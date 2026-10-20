/**
 * Health check (/api/health): estado del servicio y conexión a la BD.
 */
import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      status: 'online',
      database: 'connected (PostgreSQL)',
      usersInDb: userCount,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

export default router;
