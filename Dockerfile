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
# Build-time values only satisfy lib/env.ts while Next collects the app graph.
# Runtime secrets are supplied by the server-side .env in Compose.
# Public bot username is baked into the client bundle at build time
# (NEXT_PUBLIC_* are inlined by Next). Overridable via build-arg; the server
# .env supplies BOT_PUBLIC_USERNAME through compose build.args.
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=threeSet_bot
ENV BOT_TOKEN=build-placeholder \
    BOT_TEST_TOKEN=build-placeholder \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SESSION_SECRET=build-placeholder-session-secret-32ch \
    WEBHOOK_SECRET=build-placeholder \
    ARTEMIDA_API_KEY=build-placeholder \
    PLATEGA_MERCHANT_ID=build-placeholder \
    PLATEGA_SECRET=build-placeholder \
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
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
# Prisma 7's generated client is outside node_modules and may be missed by
# Next standalone tracing; copy it explicitly for the runtime import.
COPY --from=builder /app/generated ./generated
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
# Prod migrations run forward only (T-02-02): deploy, never dev.
ENTRYPOINT ["sh", "-c", "npx prisma migrate deploy && exec node server.js"]
