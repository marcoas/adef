/**
 * Instancia única de PrismaClient compartida por todo el backend.
 */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
