# 3set-white web image: Next.js standalone + Prisma migrate deploy entrypoint.
# Base image pinned to Node 24 LTS on bookworm-slim — never node:latest.
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Standalone server (traced by Next at build time).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Migration tooling: schema + history + v7 config + full modules (prisma CLI, dotenv).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma7.config.ts ./
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
# Prod migrations run forward only (T-02-02): deploy, never dev.
ENTRYPOINT ["sh", "-c", "npx prisma migrate deploy && exec node server.js"]
