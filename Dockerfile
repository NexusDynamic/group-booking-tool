# ---------- build stage ----------
FROM node:22-alpine AS builder

RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# BASE_PATH is baked into the SvelteKit build (kit.paths.base).
# Pass --build-arg BASE_PATH=/your/prefix when building, or via docker-compose.
ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH

# Vite/SvelteKit build does not execute drizzle.config.ts, but $env/dynamic/private
# is satisfied at runtime by adapter-node. Provide a placeholder so any
# accidental import-time check doesn't abort the build.
ENV DATABASE_URL=/tmp/build-placeholder.db
RUN pnpm build


# ---------- runtime stage ----------
FROM node:22-alpine AS runtime

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

# Carry BASE_PATH into the runtime image so the healthcheck can reference it.
ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH

ENTRYPOINT ["./docker-entrypoint.sh"]
