FROM node:20-alpine

WORKDIR /app

# Instalar dependencias necesarias para Prisma y OpenSSL
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]
