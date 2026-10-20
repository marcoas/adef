# =============================================================
# Backend del Álbum de Patentes: Dockerfile multi-stage
#
# Targets:
#   dev         Desarrollo con recarga en caliente (ts-node-dev). Es el que
#               usa docker-compose.yml, que monta ./backend en /app.
#   build       Compila TypeScript (tsc) y genera el cliente Prisma. Tiene
#               todas las dependencias (incluida la CLI de Prisma).
#   migrate     Paso de pre-deploy: `prisma migrate deploy` y termina. Se
#               ejecuta UNA vez por despliegue, no en cada arranque.
#   production  Imagen final: solo dependencias de producción + dist/ y el
#               cliente Prisma ya generado. Es el ÚLTIMO stage, así que un
#               `docker build` sin --target construye este.
#
# Multi-arquitectura (x86_64 y ARM64 / Oracle A1): no hay binarios fijados.
# `prisma generate` y `npm ci` corren dentro del build, en la arquitectura de
# destino, y descargan el motor de Prisma (linux-musl[-arm64]-openssl-3.0.x)
# y el binario de sharp (@img/sharp-linuxmusl-*) que correspondan.
# =============================================================

# ---------- base: Node 20 sobre Alpine + OpenSSL ----------
FROM node:20-alpine AS base
WORKDIR /app
# Prisma necesita OpenSSL en tiempo de ejecución para elegir y cargar su motor
# de consultas en Alpine (musl); libc6-compat cubre binarios que esperan glibc.
RUN apk add --no-cache openssl libc6-compat

# ---------- dev: recarga en caliente (docker-compose.yml) ----------
FROM base AS dev
COPY package*.json ./
COPY prisma ./prisma/
# `npm install` (y no `npm ci`) para conservar el comportamiento previo en
# desarrollo; el postinstall de @prisma/client genera el cliente.
RUN npm install
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------- build: compilación de producción ----------
FROM base AS build
COPY package*.json ./
COPY prisma ./prisma/
# Dependencias completas (tsc y la CLI de prisma son devDependencies)
RUN npm ci
COPY . .
# tsc -> dist/ + prisma generate -> node_modules/.prisma
RUN npm run build

# ---------- migrate: pre-deploy (prisma migrate deploy) ----------
FROM build AS migrate
ENV NODE_ENV=production
CMD ["npm", "run", "migrate:deploy"]

# ---------- prod-deps: solo dependencias de producción ----------
FROM base AS prod-deps
COPY package*.json ./
# --ignore-scripts: el postinstall de @prisma/client intentaría generar el
# cliente sin la CLI; el cliente generado se copia desde el stage build.
# sharp 0.33 no lo necesita: su binario viene en @img/sharp-linuxmusl-*.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---------- production: imagen final ----------
FROM base AS production
ENV NODE_ENV=production \
    PORT=4000
# tini como PID 1: node no atiende SIGTERM siendo PID 1 y `docker stop`
# esperaría 10 s para matarlo; tini reenvía la señal y recoge procesos.
RUN apk add --no-cache tini
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
# Cliente Prisma generado (código + motor nativo de esta arquitectura)
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
# Carpeta de fotos del proveedor "local" (dist/uploads): debe ser escribible
# por el usuario sin privilegios; en Docker Compose se monta un volumen acá.
RUN mkdir -p dist/uploads/thumbs && chown -R node:node dist/uploads
USER node
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
# Equivale a `npm start` (node dist/index.js), pero sin npm de por medio:
# la señal llega directo a node y se ahorran ~30 MB de RAM.
CMD ["node", "dist/index.js"]
