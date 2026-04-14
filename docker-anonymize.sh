#!/bin/sh
# Entrypoint for the anonymize service.
# Writes the crontab, then hands off to crond (foreground, logs to stderr).
set -e

mkdir -p /etc/crontabs
echo "0 2 * * * cd /app && node --import tsx src/lib/server/run-anonymize.ts >> /proc/1/fd/1 2>&1" \
  > /etc/crontabs/root

echo "[anonymize] Cron scheduled — daily at 02:00 UTC."
exec crond -f -d 8
