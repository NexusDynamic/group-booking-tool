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

## tools and franeworks

- SvelteKit 2 + Svelte 5, Tailwind v4
- SQLite via `better-sqlite3` and `drizzle-orm` (schema in `src/lib/server/db/schema.ts`)
- `better-auth` for admin user
- `ics` and `rrule` for feed generation and recurrence expansion
- Vitest (server + browser environments) and Playwright

## endpoint details

- All mutating public routes go through an in-memory token-bucket rate limit keyed by client IP.
- Participant self-manage tokens are 256-bit URL-safe random strings; only their SHA-256 hash is stored in the database.
- Public routes are served with a strict CSP (nonce-based)
- ICS feed URLs use tokens, as such, should never be shared
- There is no email integration, if you lose the admin password, you can delete the user row and re-run `pnpm seed:admin`.
