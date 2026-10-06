#!/bin/sh
# Entrypoint for the anonymize service: runs the GDPR anonymisation sweep
# once a day at 02:00 UTC.
#
# A plain sleep loop rather than crond, because busybox crond has to run as
# root and this container runs as the unprivileged `node` user.
set -e

RUN_AT=7200 # seconds after midnight UTC (02:00)

# Stop promptly on `docker stop` instead of waiting out the sleep.
trap 'exit 0' TERM INT

echo "[anonymize] Scheduled — daily at 02:00 UTC."

while true; do
  now=$(date -u +%s)
  wait_s=$(( (RUN_AT - now % 86400 + 86400) % 86400 ))
  [ "$wait_s" -eq 0 ] && wait_s=86400
  sleep "$wait_s" &
  wait $!

  # A failed sweep is logged and retried the next day.
  node --import tsx src/lib/server/run-anonymize.ts || echo "[anonymize] Sweep failed (exit $?)."
done
