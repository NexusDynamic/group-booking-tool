# Group Booking Tool

A small, self-hosted web app for researchers who run group experiments and need
a way to publish session slots and take participant signups without an email
integration or account system. One researcher, one SQLite file, ICS feeds as
the only outbound channel.

See `CLAUDE.md` for the product vision and design decisions.

## Features

- Define experiments with required participant-info fields and inclusion/exclusion criteria.
- Create session slots either one-off or as recurrence templates (weekly, etc.) that you "generate" into concrete sessions.
- Participants book a session without an account; they get a self-manage URL containing an opaque token (cancel / update from that link).
- Participants can also submit a **standing availability** (recurring time-slot preference with a date window) or a **multi-session pick list**, which sit in a queue for the researcher to triage.
- Dashboard, session grid, and per-session detail pages highlight below-minimum, full, and at-capacity state.
- Two ICS feeds per experiment: a **public** one whose event titles show live `(n/cap)` counts, and a **researcher** one that also includes reminder events defined per rule (e.g. "email participants 1 day before" or "consider cancelling — still below minimum").
- Mark attendance (attended / no-show); a future booking from the same email on the same experiment can be automatically blocked.

## Running locally

```sh
pnpm install
cp .env.example .env
# edit .env: set ORIGIN, BETTER_AUTH_SECRET, CLINIC_TZ, ADMIN_EMAIL, ADMIN_PASSWORD
pnpm db:push           # apply the schema to the SQLite file in DATABASE_URL
pnpm seed:admin        # creates the single admin user, then locks signup
pnpm dev
```

Visit `http://localhost:5173/login` and sign in with the admin credentials.

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

### Backups

`DATABASE_URL` is a single SQLite file. Back it up. There is no other state.

## Testing

```sh
pnpm test                      # unit + browser tests
pnpm test:unit -- --run        # unit only
pnpm check                     # svelte-check + typescript
pnpm lint
```

## Stack

- SvelteKit 2 + Svelte 5 (runes mode), Tailwind v4
- SQLite via `better-sqlite3` and `drizzle-orm` (schema in `src/lib/server/db/schema.ts`)
- `better-auth` for the single admin user; signup locks automatically after the first user
- `ics` and `rrule` for feed generation and recurrence expansion
- Vitest (server + browser environments) and Playwright

## Security notes

- All mutating public routes go through an in-memory token-bucket rate limit keyed by client IP.
- Participant self-manage tokens are 256-bit URL-safe random strings; only their SHA-256 hash is stored in the database.
- Public routes are served with a strict CSP (no inline scripts) via a response hook in `src/hooks.server.ts`.
- ICS feed URLs are unguessable tokens. Treat the researcher URL like a password; rotate from the admin UI if leaked.
- There is no email integration, so there is no password-reset flow — if you lose the admin password, delete the user row and re-run `pnpm seed:admin`.
