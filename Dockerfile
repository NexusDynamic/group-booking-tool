# ---------- build stage ----------
FROM node:24-alpine AS builder

# pnpm's version comes from the `packageManager` field in package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@latest && corepack enable

# Native addon build tools — required when better-sqlite3 has no prebuilt
# binary for the current Node version on Alpine (musl libc).
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# BASE_URL is baked into the SvelteKit build (kit.paths.base).
# Pass --build-arg BASE_URL=/your/prefix when building, or via docker-compose.
ARG BASE_URL=""
ENV BASE_URL=$BASE_URL

# ORIGIN is baked into the SvelteKit build too (paths.origin, used for CSRF
# checks behind a reverse proxy). It is still read at runtime by better-auth.
ARG ORIGIN=""
ENV ORIGIN=$ORIGIN

# Vite/SvelteKit build does not execute drizzle.config.ts, but $app/env/private
# is satisfied at runtime by adapter-node. Provide a placeholder so any
# accidental import-time check doesn't abort the build.
ENV DATABASE_URL=/tmp/build-placeholder.db
RUN pnpm build


# ---------- runtime stage ----------
FROM node:24-alpine AS runtime

WORKDIR /app

# Copy the complete module tree from the builder so that:
#   - better-sqlite3 native bindings (compiled for linux/alpine) are present
#   - drizzle-kit / drizzle-orm / better-auth / tsx are available for the
#     entrypoint's schema-push and admin-seed steps
COPY --from=builder /app/node_modules ./node_modules

# Built SvelteKit / adapter-node server
COPY --from=builder /app/build ./build

# Files needed by the entrypoint (schema push + admin seed)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY drizzle.config.ts ./
COPY src/lib/server ./src/lib/server

# Startup scripts
COPY docker-entrypoint.sh docker-anonymize.sh ./
RUN chmod +x docker-entrypoint.sh docker-anonymize.sh

ENV NODE_ENV=production
# Default port — overridden at runtime by PORT in docker-compose.yml (APP_PORT).
ENV PORT=3000

# Carry BASE_URL into the runtime image so the healthcheck can reference it.
ARG BASE_URL=""
ENV BASE_URL=$BASE_URL

ENTRYPOINT ["./docker-entrypoint.sh"]
