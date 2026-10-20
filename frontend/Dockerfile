# =============================================================
# Frontend del Álbum de Patentes: Dockerfile multi-stage
#
# Targets:
#   dev         `next dev` con recarga (lo usa docker-compose.yml).
#   build       `next build` con las variables NEXT_PUBLIC_* como build args
#               (Next.js las incrusta en el bundle al compilar).
#   production  `next start` con dependencias de producción. Último stage:
#               es el que se construye sin --target (docker-compose.prod.yml).
#
# En Vercel no se usa este archivo: Vercel compila `frontend/` directamente.
# =============================================================

# ---------- base ----------
FROM node:20-alpine AS base
WORKDIR /app

# ---------- dev: recarga en caliente ----------
FROM base AS dev
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- build: compilación de producción ----------
FROM base AS build
# Se leen en tiempo de build: cambiarlas requiere reconstruir la imagen
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_DEFAULT_LOCALE=es
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
# Sin package-lock.json en frontend/: npm install resuelve las versiones
RUN npm install
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- production: next start ----------
FROM base AS production
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.mjs ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
