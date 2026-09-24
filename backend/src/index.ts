import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createWorker } from 'tesseract.js';
import { extractPlate } from './utils/plateExtractor';
import { recognizePlateALPR } from './services/alprService';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_patentes_2026_change_me';

// Middleware: exige un JWT válido (Authorization: Bearer <token>) para
// interactuar con el álbum (cargar / eliminar fotos) - Issue #6
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Debes iniciar sesión para interactuar con el álbum.' });
  }
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión nuevamente.' });
  }
}

// Security & Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));

// Helper: Seed Default User and Album if none exist
async function getOrCreateDefaultAlbum() {
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'coleccionista@patentes.ar',
        name: 'Coleccionista de Patentes',
        authProvider: 'google',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      },
    });
  }

  let album = await prisma.album.findFirst({
    where: { ownerId: user.id },
    include: { stickers: true },
  });

  if (!album) {
    album = await prisma.album.create({
      data: {
        title: 'Álbum Familiar de Patentes',
        ownerId: user.id,
      },
      include: { stickers: true },
    });

    // Seed 3 iniciales para demostración en PostgreSQL
    await prisma.sticker.createMany({
      data: [
        {
          albumId: album.id,
          slotNumber: 42,
          rawPlate: 'AB 042 CD',
          imageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60',
          uploadedByUserId: user.id,
        },
        {
          albumId: album.id,
          slotNumber: 123,
          rawPlate: 'ABC 123',
          imageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=500&auto=format&fit=crop&q=60',
          uploadedByUserId: user.id,
        },
        {
          albumId: album.id,
          slotNumber: 999,
          rawPlate: 'AF 999 ZZZ',
          imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=500&auto=format&fit=crop&q=60',
          uploadedByUserId: user.id,
        }
      ],
      skipDuplicates: true,
    });
  }

  return { user, album };
}

// -------------------------------------------------------------
// ENDPOINTS DE AUTENTICACIÓN
// -------------------------------------------------------------
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, name, avatarUrl, idToken, authProvider } = req.body;
    let userEmail = email;
    let userName = name;
    let userAvatar = avatarUrl;

    // Si viene idToken de Google OAuth, extraer información de usuario del token
    if (idToken) {
      try {
        const decoded: any = jwt.decode(idToken);
        if (decoded && decoded.email) {
          userEmail = decoded.email;
          userName = decoded.name || decoded.given_name || userEmail.split('@')[0];
          userAvatar = decoded.picture || avatarUrl;
        }
      } catch (err) {
        console.warn('Error al decodificar idToken de Google:', err);
      }
    }

    if (!userEmail) {
      return res.status(400).json({ error: 'Se requiere un email válido para iniciar sesión' });
    }

    let user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          name: userName || userEmail.split('@')[0],
          authProvider: authProvider || 'google',
          avatarUrl: userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        },
      });

      await prisma.album.create({
        data: {
          title: `Álbum de ${user.name}`,
          ownerId: user.id,
        },
      });
    } else if (userName && user.name !== userName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { 
          name: userName, 
          avatarUrl: userAvatar || user.avatarUrl 
        },
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user });
  } catch (error) {
    console.error('Error en auth login:', error);
    return res.status(500).json({ error: 'Error al autenticar' });
  }
});

// -------------------------------------------------------------
// RECONOCIMIENTO DE PATENTES CON ALPR / TESSERACT OCR
// -------------------------------------------------------------
app.post('/api/plates/ocr', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Se requiere la imagen en base64 para el OCR' });
    }

    const alprResult = await recognizePlateALPR(imageBase64);
    return res.json(alprResult);
  } catch (error) {
    console.error('Error en procesamiento OCR / ALPR:', error);
    return res.status(500).json({ error: 'Error al procesar la imagen con OCR/ALPR' });
  }
});

// Endpoint de prueba de Regex
app.post('/api/plates/parse', (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Se requiere el parámetro "text"' });
    }

    const result = extractPlate(text);
    return res.json(result);
  } catch (error) {
    console.error('Error al procesar la patente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// -------------------------------------------------------------
// OPERACIONES DE ÁLBUM & FIGURITAS EN POSTGRESQL
// -------------------------------------------------------------
app.get('/api/album', async (req: Request, res: Response) => {
  try {
    const { album } = await getOrCreateDefaultAlbum();
    
    const dbStickers = await prisma.sticker.findMany({
      where: { albumId: album.id },
      include: { uploadedBy: true },
    });

    const stickersMap: Record<number, any> = {};
    dbStickers.forEach((s) => {
      stickersMap[s.slotNumber] = {
        slotNumber: s.slotNumber,
        rawPlate: s.rawPlate,
        imageUrl: s.imageUrl,
        capturedAt: s.capturedAt.toISOString(),
        capturedBy: s.uploadedBy.name,
      };
    });

    const totalSlots = 1000;
    const collectedCount = dbStickers.length;

    return res.json({
      id: album.id,
      title: album.title,
      totalSlots,
      collectedCount,
      progressPercentage: ((collectedCount / totalSlots) * 100).toFixed(1),
      stickers: stickersMap,
    });
  } catch (error) {
    console.error('Error al obtener álbum desde DB:', error);
    return res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

app.post('/api/album/stickers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { plateText, imageUrl } = req.body;
    if (!plateText) {
      return res.status(400).json({ error: 'Se requiere el texto de la patente' });
    }

    const plateResult = extractPlate(plateText);
    if (!plateResult.isValid || plateResult.slotNumber === null) {
      return res.status(422).json({
        error: 'No se pudo extraer una patente válida de 3 dígitos (ej: AAA 000 o AA 000 AA).',
        plateResult,
      });
    }

    const { user, album } = await getOrCreateDefaultAlbum();
    const slot = plateResult.slotNumber;

    // Verificar unicidad en PostgreSQL DB
    const existingSticker = await prisma.sticker.findUnique({
      where: {
        albumId_slotNumber: {
          albumId: album.id,
          slotNumber: slot,
        },
      },
    });

    if (existingSticker) {
      return res.status(409).json({
        error: `El casillero #${plateResult.formattedSlot} ya tiene una figurita pegada en la base de datos PostgreSQL.`,
        existingSticker,
      });
    }

    // Insertar figurita en PostgreSQL
    const newSticker = await prisma.sticker.create({
      data: {
        albumId: album.id,
        slotNumber: slot,
        rawPlate: plateResult.formattedPlate,
        imageUrl: imageUrl || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500&auto=format&fit=crop&q=60',
        uploadedByUserId: user.id,
      },
      include: { uploadedBy: true },
    });

    return res.status(201).json({
      message: `¡Figurita #${plateResult.formattedSlot} guardada en PostgreSQL con éxito!`,
      sticker: {
        slotNumber: newSticker.slotNumber,
        rawPlate: newSticker.rawPlate,
        imageUrl: newSticker.imageUrl,
        capturedAt: newSticker.capturedAt.toISOString(),
        capturedBy: newSticker.uploadedBy.name,
      },
      plateResult,
    });
  } catch (error) {
    console.error('Error al guardar figurita en DB:', error);
    return res.status(500).json({ error: 'Error al escribir en PostgreSQL' });
  }
});

app.delete('/api/album/stickers/:slotNumber', requireAuth, async (req: Request, res: Response) => {
  try {
    const slotNumber = parseInt(req.params.slotNumber, 10);
    if (isNaN(slotNumber)) {
      return res.status(400).json({ error: 'Número de casillero inválido' });
    }

    const { album } = await getOrCreateDefaultAlbum();

    const existingSticker = await prisma.sticker.findUnique({
      where: {
        albumId_slotNumber: {
          albumId: album.id,
          slotNumber,
        },
      },
    });

    if (!existingSticker) {
      return res.status(404).json({ error: `No se encontró la figurita en el casillero #${slotNumber}` });
    }

    await prisma.sticker.delete({
      where: {
        albumId_slotNumber: {
          albumId: album.id,
          slotNumber,
        },
      },
    });

    return res.json({ message: `Figurita #${slotNumber} eliminada con éxito.` });
  } catch (error) {
    console.error('Error al eliminar figurita:', error);
    return res.status(500).json({ error: 'Error al eliminar figurita de PostgreSQL' });
  }
});

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend conectado a PostgreSQL iniciado en puerto ${PORT}`);
});
