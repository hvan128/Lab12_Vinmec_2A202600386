# ============================================================
# Vinmec AI Agent — Production Dockerfile (Lab 12 compliant)
# Multi-stage, non-root, target size < 300 MB
# ============================================================

# ─── Stage 1: deps ──────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --prefer-offline --no-audit --progress=false

# ─── Stage 2: builder ───────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Placeholder env vars — only used at build time to let Next.js collect page data
# without crashing on module-level Prisma init. Real values injected at runtime.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    OPENAI_API_KEY="sk-build-placeholder" \
    SKIP_ENV_VALIDATION=1

RUN npx prisma generate
RUN npm run build

# ─── Stage 3: runtime ───────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache libc6-compat openssl wget tini

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Prisma runtime files (engines + generated client). CLI + migrate tooling lives in the
# separate "migrate" stage below — keeps this runtime image lean.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# tini handles SIGTERM → forward to node → Next.js graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]


# ─── Stage 4: migrate (separate image with full node_modules) ────
# Dùng cho `docker compose run migrate` — chứa đầy đủ prisma + deps.
# Tách image để main app giữ < 500 MB.
FROM node:20-alpine AS migrate
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# lib/data/*.json used by prisma/seed.ts (departments, doctors, users, ...).
COPY --from=builder /app/lib ./lib
ENV NODE_ENV=production
# Default command: apply schema migrations THEN seed data (idempotent upserts).
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node node_modules/prisma/build/index.js db seed"]
