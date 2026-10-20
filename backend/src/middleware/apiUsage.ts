/**
 * Issue #41: contador de consumo de la API en memoria para el dashboard de
 * administración. Clave "YYYY-MM-DD|ruta"; se purga solo lo que supera los
 * 7 días de antigüedad para acotar la memoria.
 */
import { Request, Response, NextFunction } from 'express';

interface UsageEntry {
  requests: number;
  errors: number;
  route: string;
  day: string;
}

const apiUsage: Record<string, UsageEntry> = {};
const USAGE_RETENTION_DAYS = 7;

export function trackApiUsage(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    try {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      // Ruta completa sin query string (independiente de dónde esté montado
      // cada router, que modifica req.url/req.path durante el ruteo)
      const route = req.originalUrl.split('?')[0];
      const key = `${day}|${route}`;
      const entry = apiUsage[key] || (apiUsage[key] = { requests: 0, errors: 0, route, day });
      entry.requests += 1;
      if (res.statusCode >= 400) entry.errors += 1;

      const cutoff = new Date(now.getTime() - USAGE_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
      for (const k of Object.keys(apiUsage)) {
        if (apiUsage[k].day < cutoff) delete apiUsage[k];
      }
    } catch {
      /* el tracking de consumo nunca debe romper la respuesta */
    }
  });
  next();
}

/** Consumo agrupado por endpoint (últimos 7 días), ordenado por pedidos. */
export function getApiUsageSummary() {
  const byRoute: Record<string, { route: string; requests: number; errors: number; byDay: Record<string, number> }> = {};
  for (const entry of Object.values(apiUsage)) {
    const agg = byRoute[entry.route] || (byRoute[entry.route] = { route: entry.route, requests: 0, errors: 0, byDay: {} });
    agg.requests += entry.requests;
    agg.errors += entry.errors;
    agg.byDay[entry.day] = (agg.byDay[entry.day] || 0) + entry.requests;
  }
  return Object.values(byRoute).sort((a, b) => b.requests - a.requests);
}
