![Build Status](https://img.shields.io/github/actions/workflow/status/NexusDynamic/group-booking-tool/ci.yml)

# Group Booking Tool

A small, self-hosted web app for researchers who run group experiments and need
a way to publish session slots and register participant signups. One SQLite file, ICS feeds for participants and researchers (including custom reminder events)

## Features

- Define experiments with required participant-info fields and inclusion/exclusion criteria.
- Create session slots either one-off or as recurrence templates (weekly, etc.) that you "generate" into concrete sessions.
- Participants book a session without an account; they get a self-manage URL containing an opaque token (cancel / update from that link).
- Participants can also submit a preference for multiple sessions, and the researcher can assign them to a session
- Dashboard, session grid, and per-session detail pages highlight below-minimum, full, and at-capacity state.
- Three ICS feeds per experiment: a **experiment** feed whose event titles show live `(n/cap)` counts, and a **researcher** feed that also includes reminder events defined per rule (e.g. "email participants 1 day before" or "consider cancelling — still below minimum"), and a participant feed that shows the status of the session (e.g. confirmed, cancelled, etc.).
- Mark attendance (attended / no-show); a future booking from the same email on the same experiment can be automatically blocked if you don't want to allow participants to attend multiple times.

## Running locally

```sh
pnpm install
cp .env.example .env
# edit .env: set ORIGIN, BETTER_AUTH_SECRET, CLINIC_TZ, ADMIN_EMAIL, ADMIN_PASSWORD
pnpm db:push           # apply the schema to the SQLite file in DATABASE_URL
pnpm seed:admin        # creates the single admin user, then locks signup
pnpm dev
```

**note:** `BASE_PATH` does not automatically apply when you run the dev server, if you want to specify
a subdirectory for local testing, you can run the `pnpm dev` command with the environment variable set:

```sh
BASE_PATH=/booking pnpm dev
```

Visit `https://localhost:5173/login` and sign in with the admin credentials.

## Building for production

The project uses `@sveltejs/adapter-node`, so `pnpm build` produces a Node
server under `build/`. Typical deployment:

```sh
pnpm build
NODE_ENV=production node build
```

Put it behind a reverse proxy that terminates TLS and sets `X-Forwarded-For`
(used for public rate-limiting). The app reads all configuration from
environment variables at runtime — see `.env.example` for the full list.

### Docker

A `docker-compose.yml` is provided. Copy `.env.example` to `.env`, fill in the
values (set `ORIGIN` to your public URL, e.g. `https://booking.example.org`),
then:

```sh
docker compose up -d          # standalone, port 3000 bound to 127.0.0.1
```

The first start applies the schema and seeds the admin account automatically if
`ADMIN_EMAIL` / `ADMIN_PASSWORD` are set. The SQLite file lives in `./data/`.

An nginx reverse-proxy service is included as an optional Compose profile (see
[Nginx via Docker](#nginx-via-docker) below). If you already run nginx on the
host, skip the profile and proxy directly to `127.0.0.1:3000` instead.

### Nginx on the host

If you already run nginx on the host (e.g. managing multiple sites on a VPS),
proxy directly to `127.0.0.1:3000`. Assuming TLS certificates are already in
place (e.g. from certbot):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name booking.example.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name booking.example.org;

    ssl_certificate     /etc/letsencrypt/live/booking.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/booking.example.org/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `ORIGIN=https://booking.example.org` in `.env` so better-auth scopes its
cookies correctly and ICS feed URLs are rendered with the right base.

### Nginx via Docker

To also run nginx as a container alongside the app:

```sh
# Edit nginx/nginx.conf — replace booking.example.org with your domain.
docker compose --profile proxy up -d
```

Certificates are expected at `/etc/letsencrypt` on the host (mounted read-only
into the nginx container). For HTTP-only local testing, swap in
`nginx/nginx-insecure.conf` via the volumes mount in `docker-compose.yml`.

### Backups

`DATABASE_URL` is a single SQLite file. Back it up. There is no other state.

### Data retention / GDPR anonymisation

The app ships a `pnpm anonymize` script that anonymises participant data that
has passed its retention window (90 days by default, or `DATA_RETENTION_DAYS`
from `.env`). With Docker Compose the included `anonymize` service runs it
automatically at 02:00 UTC every night — no extra setup required.

If you are **not** using Docker Compose, add a system cron entry on the host
(run `crontab -e` or drop a file in `/etc/cron.d/`):

```
# Run the anonymisation sweep daily at 02:00; adjust the path to match your
# installation directory.
0 2 * * * cd /path/to/group-booking-tool && pnpm anonymize >> /var/log/group-booking-anonymize.log 2>&1
```

The script loads `DATABASE_URL` and `DATA_RETENTION_DAYS` from `.env`
automatically, so no extra environment setup is needed beyond what is already
in your `.env` file.

## Testing

```sh
pnpm test                      # unit + browser tests
pnpm test:unit -- --run        # unit only
pnpm check                     # svelte-check + typescript
pnpm lint
```

## tools and franeworks

- SvelteKit 2 + Svelte 5, Tailwind v4
- SQLite via `better-sqlite3` and `drizzle-orm` (schema in `src/lib/server/db/schema.ts`)
- `better-auth` for admin user
- `ics` and `rrule` for feed generation and recurrence expansion
- Vitest (server + browser environments) and Playwright

## endpoint details

- All mutating public routes go through an in-memory token-bucket rate limit keyed by client IP. Set `TRUSTED_PROXY=cloudflare` if the deployment is behind Cloudflare — without it, clients can spoof `X-Forwarded-For` to bypass the limit.
- Participant self-manage tokens are 256-bit URL-safe random strings; only their SHA-256 hash is stored in the database.
- Public routes are served with a strict CSP (nonce-based)
- ICS feed URLs use tokens, as such, should never be shared
- There is no email integration, if you lose the admin password, you can delete the user row and re-run `pnpm seed:admin`.
