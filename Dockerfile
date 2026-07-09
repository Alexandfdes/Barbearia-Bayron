# Estágio 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Estágio 2: Produção (Node.js — Astro standalone com @astrojs/node)
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Volume para o banco SQLite persistente
VOLUME ["/data"]
EXPOSE 4321

# Roda as migrations, sobe o daemon de backup (diário às 03:00) e inicia o servidor
CMD ["sh", "-c", "node scripts/startup.mjs && (node scripts/backup-daemon.mjs &) && node dist/server/entry.mjs"]
