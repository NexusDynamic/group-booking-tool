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

**note:** `BASE_URL` does not automatically apply when you run the dev server, if you want to specify
a subdirectory for local testing, you can run the `pnpm dev` command with the environment variable set:

```sh
BASE_URL=/booking pnpm dev
```

Visit `https://localhost:5173/login` and sign in with the admin credentials.

## Building for production

The project uses `@sveltejs/adapter-node`, so `pnpm build` produces a Node
server under `build/`. Typical deployment:

```sh
pnpm build
NODE_ENV=production node build
```

Put it behind a reverse proxy that terminates TLS and sets `X-Forwarded-For`,
and set `TRUSTED_PROXY=proxy` so the rate limiter keys on the real client IP
(without it every request appears to come from the proxy). The app reads all configuration from
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

#### Running as a non-root user

The app and anonymize containers run unprivileged, with all Linux capabilities
dropped. The only thing they write is the database directory, so `./data` on
the host must be owned by the uid the containers run as.

That uid is `APP_UID` / `APP_GID` in `.env`, defaulting to `1000:1000`. On many
hosts uid 1000 is the first human account, so the files would show up as
belonging to that person. To avoid that, create a dedicated service account
and use its ids instead:

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin booking
id booking                             # note the uid= and gid= values
```

```sh
# .env
APP_UID=<uid>
APP_GID=<gid>
```

```sh
mkdir -p data
sudo chown -R booking:booking data
```

Only the numeric ids matter to Docker; the account just gives them a name on
the host. If `./data` isn't writable the app container exits at startup with a
message saying which uid needs access. If you set `LOG_FILE`, point it
somewhere under `/data` as well.

**Upgrading an instance that used to run as root** — the existing database
files are owned by root, so fix the ownership once while the stack is down:

```sh
docker compose down
sudo cp -a data data.bak               # backup, including any -wal / -shm files
sudo chown -R <uid>:<gid> data         # the APP_UID / APP_GID from .env
docker compose build
docker compose up -d
docker compose logs -f app             # should reach "Starting Group Booking Tool"
```

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
cookies correctly and ICS feed URLs are rendered with the right base. `ORIGIN`
is also baked into the build (SvelteKit's `paths.origin`, used for CSRF checks),
so rebuild after changing it.

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

### Webhooks (Power Automate etc.)

Set `WEBHOOK_URL` to have the app POST a JSON event whenever something happens
that you may want to act on. A Microsoft Power Automate flow starting with
**When an HTTP request is received** works well (that trigger may need a
Premium licence); the URL it gives you already contains a secret `sig=`
parameter, so treat it like a password.

| Event                  | When                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `booking.created`      | A participant books, or you assign a waiting preference (`booking.source` is `public` / `admin`) |
| `booking.cancelled`    | A participant cancels from their link                                                            |
| `preference.created`   | Someone submits availability and is waiting to be assigned                                       |
| `preference.withdrawn` | A participant withdraws a pending preference                                                     |
| `session.cancelled`    | You cancel a session in the admin (`session.booked` says how many people need telling)           |

Each change sends exactly one event. Thresholds it crossed are listed in
`session.milestones`:

| Milestone         | Meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| `minimum_reached` | The booking brought the session to its minimum — it will run |
| `full`            | The booking filled the last seat — confirm with participants |
| `below_minimum`   | The cancellation dropped the session below its minimum       |
| `no_longer_full`  | The cancellation freed a seat on a full session              |

Payload shape (fields present depend on the event):

```json
{
	"event": "booking.created",
	"occurredAt": "2026-10-16T08:00:00.000Z",
	"summary": "New booking · Fun Experiment · lør. 17. okt. 10.00 (3/6, minimum reached)",
	"experiment": { "id": "…", "name": "Fun Experiment", "slug": "fun", "adminUrl": "https://…" },
	"session": {
		"id": "…",
		"startsAt": "…",
		"endsAt": "…",
		"startsAtLocal": "17. okt. 2026 10.00",
		"when": "lør. 17. okt. 10.00",
		"location": "Lab 1",
		"booked": 3,
		"minParticipants": 3,
		"capacity": 6,
		"seats": "3/6",
		"state": "ok",
		"status": "confirmed",
		"waiting": 1,
		"milestones": ["minimum_reached"],
		"adminUrl": "https://…"
	},
	"booking": { "id": "…", "source": "public" },
	"preference": {
		"id": "…",
		"kind": "recurring",
		"pendingCount": 2,
		"pattern": "mandag 09:00–10:00, 1. jun. 2026 – 30. jun. 2026",
		"windowStart": "…",
		"windowEnd": "…",
		"sessions": [{ "id": "…", "when": "…", "seats": "2/6", "state": "below_minimum", "…": "…" }],
		"moreCount": 0
	},
	"upcoming": [{ "id": "…", "when": "…", "seats": "3/6", "state": "ok", "waiting": 1, "…": "…" }],
	"participant": { "name": "…", "email": "…", "manageUrl": "https://…" },
	"adaptiveCard": { "type": "AdaptiveCard", "version": "1.4", "…": "…" }
}
```

- `state` is `below_minimum`, `ok` (minimum met) or `full`. `waiting` is the
  number of pending availability submissions that match that session, so you
  can see which thin sessions could be filled from the queue.
- `upcoming` holds the next 5 open sessions of the experiment, with counts
  taken right after the change.
- `preference.sessions` holds the upcoming open sessions a submission covers
  (the chosen sessions, or those matching the recurring pattern and date range;
  at most 10, with the rest counted in `moreCount`). `pattern` is only set for
  recurring submissions.
- `affectedParticipants` (`session.cancelled` only, and only with
  `WEBHOOK_INCLUDE_PII=true`) lists the name and email of everyone still
  booked on the cancelled session, so a flow can notify them.
- `adaptiveCard` is a ready-made Microsoft Teams card showing all of the
  above. `summary` is the same information as one line of plain text.

**Posting to Teams:** after the trigger, add _Parse JSON_ (generate the schema
from a test event; mark `session`, `booking`, `preference` and `participant`
as optional, since not every event has them), then **Post card in a chat or
channel** with the _Adaptive Card_ field set to the expression
`string(body('Parse_JSON')?['adaptiveCard'])`. The layout lives in the app
(`src/lib/server/webhook-card.ts`), so it can change without editing the flow.

`participant` is only sent when `WEBHOOK_INCLUDE_PII=true`, and only then does
the card show name and email. With it on, a flow can email the participant
their `manageUrl` from your own Outlook account (so they can't lose their
link); the `/privacy` page then states that details are forwarded, and you
should mention it in each experiment's privacy notice. URLs (and the card's
buttons) are absolute only when `ORIGIN` is set.

Delivery is fire-and-forget: events are sent in the background after the
change has been saved, with a 10 s timeout and no retries. An unreachable or
failing endpoint is only logged (`webhook unreachable` / `webhook rejected`)
and never affects a booking.

The **Account** page has a **Send test webhook** button. It sends a
`webhook.test` event with example values in the same shape as real events,
including a sample card. Paste it into Power Automate's _Parse JSON_ →
_Generate from sample_.

## Testing

```sh
pnpm exec playwright install
pnpm test                      # unit + browser tests
pnpm test:unit                 # unit only
pnpm check                     # svelte-check + typescript
pnpm lint
```

## tools and frameworks

- SvelteKit 3 + Svelte 5, Tailwind v4
- SQLite via `better-sqlite3` and `drizzle-orm` (schema in `src/lib/server/db/schema.ts`)
- `better-auth` for admin user
- `ics` and `rrule` for feed generation and recurrence expansion
- Vitest (server + browser environments) and Playwright

## endpoint details

- All mutating public routes, and sign-in, go through an in-memory token-bucket rate limit keyed by client IP. Forwarding headers are only trusted when `TRUSTED_PROXY` is set: `proxy` (your own reverse proxy; right-most `X-Forwarded-For` value) or `cloudflare` (`CF-Connecting-IP`). Unset, the socket address is used.
- Every route under `(admin)` — page loads and form actions — requires a signed-in session, enforced in `src/hooks.server.ts`.
- Participant self-manage tokens are 256-bit URL-safe random strings; only their SHA-256 hash is stored in the database.
- Public routes are served with a strict CSP (nonce-based)
- ICS feed URLs use tokens, as such, should never be shared
- There is no email integration, if you lose the admin password, you can delete the user row and re-run `pnpm seed:admin`.
