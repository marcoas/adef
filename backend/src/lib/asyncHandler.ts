/**
 * Envoltorio para handlers async de Express.
 *
 * Reemplaza el bloque try/catch repetido en cada ruta: ante cualquier error
 * no controlado lo loguea con `logMessage` y responde 500 `{ error }`.
 */
import { Request, Response, RequestHandler } from 'express';

export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<unknown> | unknown,
  messages: { log: string; error: string },
): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(messages.log, error);
      if (!res.headersSent) res.status(500).json({ error: messages.error });
    }
  };
}
