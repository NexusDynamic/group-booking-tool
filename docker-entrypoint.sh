#!/bin/sh
set -e

# Create the database directory if it doesn't already exist.
# Works for both absolute paths (/data/booking.db) and relative names (local.db).
DB_DIR=$(dirname "$DATABASE_URL")
if [ "$DB_DIR" != "." ]; then
  mkdir -p "$DB_DIR"
fi

# Apply the current schema to the database (idempotent — safe on every start).
# --force suppresses interactive confirmation prompts so the container starts
# unattended. Back up your database before upgrading to a new image version.
echo "[entrypoint] Applying database schema..."
node_modules/.bin/drizzle-kit push --config drizzle.config.ts --force

# Seed the initial admin account when credentials are provided.
# The seed script is a no-op once any user row exists, so it is safe to leave
# the variables set on subsequent restarts.
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "[entrypoint] Seeding admin account..."
  node_modules/.bin/tsx src/lib/server/seed-admin.ts
fi

echo "[entrypoint] Starting Group Booking Tool on port ${PORT:-3000}..."
exec node build/index.js
