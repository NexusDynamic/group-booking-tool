#!/bin/sh
set -e

# Create the database directory if it doesn't already exist.
# Works for both absolute paths (/data/booking.db) and relative names (local.db).
DB_DIR=$(dirname "$DATABASE_URL")
if [ "$DB_DIR" != "." ]; then
  mkdir -p "$DB_DIR" 2>/dev/null || true
fi

# The container runs as an unprivileged user. Fail early, with the fix, if the
# database location (typically a bind-mounted host directory) is not writable
# — SQLite also needs to create its -wal / -shm files next to the database.
for target in "$DB_DIR" "$DATABASE_URL" "$DATABASE_URL-wal" "$DATABASE_URL-shm"; do
  if [ -e "$target" ] && [ ! -w "$target" ]; then
    echo "[entrypoint] ERROR: $target is not writable by uid $(id -u) (gid $(id -g))." >&2
    echo "[entrypoint] The container no longer runs as root. On the host, run:" >&2
    echo "[entrypoint]   sudo chown -R $(id -u):$(id -g) ./data" >&2
    exit 1
  fi
done
if [ ! -d "$DB_DIR" ]; then
  echo "[entrypoint] ERROR: database directory $DB_DIR does not exist and could not be created." >&2
  exit 1
fi

# Apply the current schema to the database (idempotent — safe on every start).
# --force suppresses interactive confirmation prompts so the container starts
# unattended. Back up your database before upgrading to a new image version.
echo "[entrypoint] Applying database schema..."
node_modules/.bin/drizzle-kit push --config drizzle.config.ts --force

# Fix any sessions incorrectly left in 'confirmed' status after participant
# cancellations (idempotent — no-op once data is clean).
echo "[entrypoint] Fixing session statuses..."
node_modules/.bin/tsx src/lib/server/fix-session-statuses.ts

# Seed the initial admin account when credentials are provided.
# The seed script is a no-op once any user row exists, so it is safe to leave
# the variables set on subsequent restarts.
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] Seeding admin account..."
  node_modules/.bin/tsx src/lib/server/seed-admin.ts
fi

echo "[entrypoint] Starting Group Booking Tool on port ${PORT:-3000}..."
exec node build/index.js
