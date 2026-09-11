# syntax=docker/dockerfile:1

# Production image for the BezaMint web app.
#
# The app builds as a Next.js standalone server. Tracing for that bundle starts
# at the monorepo root (see `outputFileTracingRoot` in apps/web/next.config.js),
# so the standalone directory mirrors the repository layout and carries the
# traced packages it needs inside its own `node_modules/.pnpm` store. That is why
# the runtime stage copies from `.next/standalone` instead of installing
# dependencies again: the image ships only the files the server actually loads.
#
# Build:  docker build -t bezamint-web .
# Run:    docker run --rm -p 3000:3000 --env-file apps/web/.env.local bezamint-web

# ── Base ─────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
# `packageManager` in package.json pins the pnpm version; corepack is how the
# build resolves it. The prompt is disabled because there is no terminal here.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
# alpine ships BusyBox `sh` only, and the app's build script runs a bash helper
# (scripts/prebuild-check.sh) before `next build`. bash stays in the builder and
# never reaches the runtime image.
RUN apk add --no-cache bash
WORKDIR /repo

# Manifests are copied before the sources so that the dependency layer is only
# invalidated by a dependency change, not by every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @bezamint/web build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user: the server needs no write access to its own
# files, so a compromised process should not own the application directory.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

WORKDIR /app
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

WORKDIR /app/apps/web
USER nextjs
EXPOSE 3000

# Liveness only. `/api/health` answers 503 when the Soroban RPC or the IPFS
# gateway is unreachable, which is a readiness signal — restarting the
# container because a dependency is briefly down would only make things worse.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health/live" || exit 1

CMD ["node", "server.js"]
