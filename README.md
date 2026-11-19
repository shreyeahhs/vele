<div align="center">

# Vele

**A personal calendar with an AI scheduling assistant that pencils things in, and books nothing until you say yes.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL 16+](https://img.shields.io/badge/PostgreSQL-16%2B-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-8e75b2?logo=googlegemini&logoColor=white)](https://ai.google.dev)
[![Node 22+](https://img.shields.io/badge/Node-22%2B-5fa04e?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Vele's Today view: the next booking, the rest of the day, the week at a glance, and the assistant in the margin](docs/screenshots/today.png)

</div>

---

Vele is a self-hosted calendar for one person, built so that many people can each run their own account. You keep events in it directly, or tell the assistant in plain words: *"Lunch with Mom from 1–3 this Saturday"*, *"find me an hour for deep work this week"*.

A **deterministic scheduling engine** works out when you are actually free, using your working hours, buffers, lunch, focus time and limits. The assistant only explains and orchestrates; it never invents a free slot. Anything that involves other people, clashes with your calendar, repeats, moves or cancels is **written in pencil** and waits for your confirmation.

**Booking links** let other people pick a time that already works for you, with double-booking prevented by the database itself.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Using Vele](#using-vele)
- [Configuration](#configuration)
- [Optional integrations](#optional-integrations)
- [Deploying to production](#deploying-to-production)
- [Development](#development)
- [Project structure](#project-structure)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

| | |
| --- | --- |
| **Calendar** | Day, 3-day, week, month and list views. Several calendars, each in its own ink. Recurring events that stay correct across daylight-saving changes. Focus and unavailable time. Search across events, people and bookings (<kbd>⌘</kbd> <kbd>K</kbd>). |
| **Assistant** | Ask what's on, find time, add, move and cancel events, and set preferences such as "no meetings before 10". Powered by Google Gemini; without an API key it falls back to a built-in rule-based mode. |
| **Pencil before ink** | Guests, clashes, repeats, moves and cancellations are held as proposals until you press **Add to calendar** or reply "yes". The confirmation rules are enforced on the server, not in the prompt. |
| **Scheduling engine** | Pure TypeScript with no I/O (`src/scheduling`). Working hours, buffers, lunch, focus time, notice, daily limits and time zones, with a reason for every option it offers and every time it rejects. |
| **Today** | Your next booking (with a **Join** button for Teams, Meet and Zoom links), the rest of the day, open gaps, clashes, pending confirmations and a weekly summary. |
| **Booking links** | Public or unlisted meeting types, one-time private links, detection of the visitor's time zone, and reschedule and cancel links for the person who booked. A PostgreSQL exclusion constraint means two people can never take the same slot. |
| **Email** | Invitations and booking confirmations with `.ics` attachments, sent through Brevo or Resend, or logged to a development outbox. |
| **Messaging** | Talk to Vele from Telegram. WhatsApp Business Cloud API support is included. The same confirmation rules apply everywhere. |
| **Privacy** | Full JSON export and one-click account deletion. The audit log records actions, never calendar content, and stores IP addresses only as hashes. |

> Vele deliberately does **not** sync with Google, Microsoft or other calendars, and does not create Teams, Meet or Zoom meetings. Paste your own meeting-room link once in Settings and Vele attaches it whenever you ask for a video call.

## Quick start

### Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 22 or newer | |
| [pnpm](https://pnpm.io) | 10 or newer | `npm install -g pnpm`, or `corepack enable` |
| [PostgreSQL](https://www.postgresql.org/download/) | 16 or newer | Must allow the `btree_gist` and `pg_trgm` extensions (standard in every PostgreSQL distribution) |

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/vele.git
cd vele
pnpm install
```

### 2. Create your environment file

```bash
pnpm setup
```

This copies `.env.example` to `.env` and fills in fresh random secrets (`AUTH_SECRET`, `CRON_SECRET` and the webhook tokens). It never overwrites a value you have already set. Everything else is optional and can be added later.

### 3. Start a database

Pick one option.

**Option A: the bundled local cluster (simplest if PostgreSQL is installed)**

```bash
pnpm db:start
```

This creates a private PostgreSQL cluster in `./.data/postgres`, listening only on `127.0.0.1:5434`, with the `vele` and `vele_test` databases. It uses the PostgreSQL binaries already on your machine and never touches any other PostgreSQL server. If it can't find them, set `PG_BIN` to the folder containing `pg_ctl`.

**Option B: Docker**

```bash
docker run -d --name vele-db -p 5434:5432 \
  -e POSTGRES_USER=vele -e POSTGRES_PASSWORD=vele -e POSTGRES_DB=vele \
  postgres:16
docker exec vele-db createdb -U vele vele_test
```

Then set these in `.env`:

```dotenv
DATABASE_URL=postgresql://vele:vele@127.0.0.1:5434/vele
TEST_DATABASE_URL=postgresql://vele:vele@127.0.0.1:5434/vele_test
```

**Option C: any PostgreSQL 16+ server.** Point `DATABASE_URL` (and `TEST_DATABASE_URL` if you will run the tests) at it. The database role needs permission to create the `btree_gist` and `pg_trgm` extensions.

### 4. Create the tables

```bash
pnpm db:deploy
```

### 5. (Optional) Load the demo diary

```bash
pnpm db:seed
```

This creates a demo account, `demo@vele.local` with the password `vele-demo-password`, and fills it with a clearly labelled sample week. The seed refuses to run in production.

### 6. Run it

```bash
pnpm dev
```

Open **http://localhost:3000** and create an account, or sign in to the demo account.

The assistant starts in **basic mode**. To switch on the full Gemini assistant, add a free key from [Google AI Studio](https://aistudio.google.com/apikey) to `.env` as `GEMINI_API_KEYS` and restart.

## Using Vele

### Today

Today is the home screen: your next booking with how long until it starts, the rest of the day, the open time left, a week summary, anything waiting for your confirmation, and recent bookings made through your links. The assistant sits in the margin on every page and can be pinned or hidden.

![Today in dark mode, with a pencilled proposal waiting for a yes](docs/screenshots/today-dark.png)

Light and dark themes follow your system by default; you can override this per device in **Settings → Profile → Appearance**.

### The calendar

Switch between day, 3-day, week, month and list views with the buttons or the keyboard (<kbd>D</kbd>, <kbd>X</kbd>, <kbd>W</kbd>, <kbd>M</kbd>, <kbd>L</kbd>). Drag across empty time to create an event, or press <kbd>C</kbd>. Click any event for details, to edit it, or to join its video call. Each calendar (Work, Personal, or any you add) has its own ink, and you can hide a calendar or exclude it from availability in **Settings → Calendars**.

![The week view with work and personal calendars](docs/screenshots/calendar-week.png)

### Asking Vele

Write to Vele the way you would write to a person. Some things to try:

- *What do I have tomorrow?*
- *Can I fit 30 minutes with Sarah after 2 today?*
- *Find me an hour for deep work this week*
- *Lunch with Mom from 1–3 this Saturday*
- *Move my 3pm to 4*
- *Remember I don't take calls on Fridays*

When you ask for time, the scheduling engine returns real options and Vele pencils them onto your week, each with the reasons behind it. Pick one by clicking it, or tell Vele which one you want.

![Vele offering four options for an hour of deep work, each with its reasons](docs/screenshots/assistant-find.png)

A private event that fits cleanly is added straight away. Anything that clashes, involves guests, repeats, or moves or cancels something is held **in marker** until you confirm. Vele states exactly how it read your words ("Read 4 as 16:00") and what is in the way.

![A request that overlaps another event, held in marker until it is confirmed](docs/screenshots/assistant-pencil.png)

> These two screenshots show **basic mode**, the rule-based assistant that runs when no Gemini key is set. With a key, the same tools, engine and confirmation rules are driven by Gemini, which understands far more varied requests and replies conversationally.

### Booking links

**Bookings** is where you set up your public booking page and its meeting types (duration, buffers, notice, daily limits, location, and visibility: public, unlisted or private). It also lists everyone who has booked with you. Copy a link to share it, or create a one-time private link for a single person.

![The Bookings page: your booking link, meeting types and upcoming bookings](docs/screenshots/bookings.png)

People who open your link see only times that genuinely work, computed by the same engine, and never anything about your other events. Times are shown in the visitor's own time zone.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/booking-pick-time.png" alt="A visitor picking a day and time"></td>
    <td width="50%"><img src="docs/screenshots/booking-details.png" alt="A visitor entering their details"></td>
  </tr>
  <tr>
    <td align="center"><sub>1. Pick a time</sub></td>
    <td align="center"><sub>2. Add your details</sub></td>
  </tr>
</table>

The chosen slot is re-checked on the server inside a locked transaction, the event appears on your calendar, and both sides get a confirmation email with a calendar invite. The visitor gets a private link to reschedule or cancel without signing in.

![Booking confirmed, with Add to my calendar and a change-or-cancel link](docs/screenshots/booking-confirmed.png)

The booking pages are designed for phones first, since most people open them from an email or a chat message:

<p align="center"><img src="docs/screenshots/mobile-booking.png" alt="The booking page on a phone" width="320"></p>

### Settings

| Section | What you set |
| --- | --- |
| **Profile** | Name, time zone, light or dark appearance |
| **Availability** | Working hours per day (with split shifts), lunch, focus time, buffers, minimum notice, daily meeting limits, preferred hours |
| **Calendars** | Add, rename and recolour calendars; whether each is shown and whether it counts as busy |
| **Assistant** | Your personal meeting-room link, and the preferences Vele has remembered (each can be forgotten) |
| **Messaging** | Connect Telegram or WhatsApp |
| **Privacy & data** | Download everything as JSON, or delete your account |

![Availability settings: working hours, lunch and focus time](docs/screenshots/settings-availability.png)

### Keyboard shortcuts

Single-key shortcuts work whenever you are not typing in a field. Press <kbd>?</kbd> in the app for the full list.

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| <kbd>⌘</kbd> <kbd>K</kbd> | Command palette | <kbd>T</kbd> | Jump to today |
| <kbd>/</kbd> | Search | <kbd>D</kbd> / <kbd>X</kbd> / <kbd>W</kbd> / <kbd>M</kbd> / <kbd>L</kbd> | Day, 3-day, week, month, list |
| <kbd>C</kbd> | Create an event | <kbd>J</kbd> / <kbd>K</kbd> or <kbd>←</kbd> / <kbd>→</kbd> | Next / previous period |
| <kbd>A</kbd> | Ask Vele | <kbd>G</kbd> | Go to Today |

## Configuration

All configuration is through environment variables. [`.env.example`](.env.example) documents every one; the important ones are:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | 32+ random bytes; `pnpm setup` generates it |
| `NEXT_PUBLIC_APP_URL` | Yes | The public origin, used for links in emails and on booking pages |
| `CRON_SECRET` | In production | Protects `/api/cron` |
| `GEMINI_API_KEYS` | No | One or more Gemini API keys, comma-separated. Keys are rotated, and a rate-limited, overloaded or silent key is skipped for the next one |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.8-flash` |
| `EMAIL_PROVIDER` | No | `console` (default; nothing is sent), `brevo` or `resend` |
| `EMAIL_API_KEY`, `EMAIL_FROM` | With email | Provider API key, and a sender address the provider has verified |
| `ADMIN_EMAILS` | No | Accounts that get the admin role (and `/admin`) on sign-up |
| `TELEGRAM_*`, `WHATSAPP_*` | No | Messaging channels |
| `NEXT_PUBLIC_APP_NAME` | No | The product name; also set in `src/config/brand.ts` |

Every optional feature degrades honestly: if something isn't configured, the app says it is unavailable rather than pretending to work.

## Optional integrations

Full step-by-step instructions for each are in **[docs/SETUP.md](docs/SETUP.md)**.

- **Gemini.** Create a key at [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEYS`. Free-tier keys have small per-minute and per-day quotas, and some models (such as `gemini-3.1-pro-preview`) need billing enabled. If Google reports that a model is overloaded, Vele says so and changes nothing; it never quietly switches to a weaker model.
- **Email.** Set `EMAIL_PROVIDER=brevo` or `resend`, plus `EMAIL_API_KEY` and a verified `EMAIL_FROM`. With Brevo, also make sure your server's IP address is on Brevo's authorised list. Failed sends are retried automatically for up to two days.
- **Telegram.** Create a bot with [@BotFather](https://t.me/BotFather), set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`, deploy over HTTPS, then run `pnpm telegram:webhook https://your-domain`. Link your account in **Settings → Messaging**.
- **WhatsApp.** Uses the WhatsApp Business Cloud API from Meta for Developers. See [docs/SETUP.md](docs/SETUP.md#5-whatsapp-business-cloud-api).

## Deploying to production

Vele is a standard Next.js app: one Node process plus PostgreSQL.

```bash
pnpm install --frozen-lockfile
pnpm build          # also runs prisma generate
pnpm db:deploy      # against the production DATABASE_URL
pnpm start
```

Before going live:

- Set `NEXT_PUBLIC_APP_URL` to your public `https://` origin. Secure cookies and HSTS turn on automatically.
- Use long, random values for `AUTH_SECRET` and `CRON_SECRET` that differ from development.
- Back up PostgreSQL. Everything Vele stores is in that one database.
- On serverless hosts such as Vercel, use a pooled `DATABASE_URL` and schedule `POST /api/cron` every 10 minutes with `Authorization: Bearer <CRON_SECRET>`. On a normal server, this maintenance runs inside the process.
- Point your uptime monitor at `GET /api/health`, which returns 200 when the database answers and 503 when it doesn't.

## Development

### Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Development server (Turbopack) on port 3000 |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm typecheck` | TypeScript checks |
| `pnpm lint` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Engine unit tests and database integration tests |
| `pnpm db:start` / `db:stop` / `db:status` | Project-local PostgreSQL cluster |
| `pnpm db:migrate` | Create a new migration during development |
| `pnpm db:deploy` | Apply migrations |
| `pnpm db:seed` | Create the demo account and sample week |
| `pnpm db:studio` | Browse the database with Prisma Studio |
| `pnpm telegram:webhook <url>` | Register the Telegram webhook for a deployment |

### Tests

```bash
# once: create the tables in the test database
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy
# PowerShell: $env:DATABASE_URL=$env:TEST_DATABASE_URL; pnpm db:deploy

pnpm test
```

The suite covers the scheduling engine (time zones, daylight saving, recurrence, buffers, limits), booking concurrency and the database's double-booking guard, the assistant's confirmation rules and tenant isolation, and request validation. Integration tests **reset** `TEST_DATABASE_URL`, so never point it at real data. Email is forced to the console provider and AI keys are cleared during tests.

Optional live checks against Gemini (these use your quota):

```bash
LIVE_AI=1 pnpm vitest run tests/live
```

## Project structure

```
src/
  app/            Routes: (app) signed-in pages, (auth) sign-in and onboarding,
                  book/ and booking/ public pages, api/ route handlers
  components/     UI: app shell, calendar views, assistant, booking flow, settings, primitives
  scheduling/     The deterministic scheduling engine: pure functions, fully unit-tested
  server/         Auth, database, services, AI agent and tools, email, messaging
  lib/            Environment, errors, API route helper, rate limiting, crypto, formatting
prisma/           Schema, migrations, seed
tests/            scheduling/ (unit), integration/ (real database), live/ (opt-in Gemini)
docs/             ARCHITECTURE.md, SETUP.md, API.md, screenshots/
```

Further reading:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together, and why
- [docs/SETUP.md](docs/SETUP.md): every integration, deployment, troubleshooting
- [docs/API.md](docs/API.md): the HTTP endpoints
- [SECURITY.md](SECURITY.md): threat model and controls
- [DESIGN.md](DESIGN.md): the "Ink & Pencil" design system

**Built with** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix UI, TanStack Query, PostgreSQL with Prisma 7, Better Auth, the Google Gen AI SDK, Luxon, rrule and Vitest.

## Security and privacy

- Every row belongs to a user, and every query is scoped by that user's ID. Tests check that one account can never read or change another's data.
- State-changing requests must come from the same origin. All input is validated, errors never expose internals, and public endpoints are rate-limited.
- Booking-management and private links are random tokens stored only as hashes.
- The assistant sees only the slice of your calendar that a question needs. It cannot confirm changes on its own; confirmation is checked on the server.
- You can export or permanently delete everything from **Settings → Privacy & data**.

See [SECURITY.md](SECURITY.md) for the full threat model. To report a vulnerability, please open a private security advisory on GitHub rather than a public issue.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `pnpm db:start` can't find PostgreSQL | Install PostgreSQL 16+, or set `PG_BIN` to the folder containing `pg_ctl`. Or use Docker (Option B above). |
| Migrations fail on `CREATE EXTENSION` | The database role needs permission to create `btree_gist` and `pg_trgm`. |
| "Basic mode: no AI key set" | Add `GEMINI_API_KEYS` to `.env` and restart the server. |
| "Gemini is overloaded right now" | Google's servers are busy for that model. Try again shortly, or set `GEMINI_MODEL` to another model your key can use. |
| "Every configured Gemini key is rate limited" | You've hit the free-tier quota. Wait a minute (or until the daily reset), add more keys, or enable billing. |
| Emails say "logged" instead of "sent" | `EMAIL_PROVIDER` is `console`, or `EMAIL_API_KEY` is missing. |
| Brevo returns 401 "unrecognised IP address" | Add your server's IP in Brevo under **Security → Authorised IPs**. |

More in [docs/SETUP.md](docs/SETUP.md#troubleshooting).

## Contributing

Issues and pull requests are welcome. Before opening a pull request, please run:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Keep the scheduling engine free of I/O, add tests for any behaviour you change, and follow the conventions in [DESIGN.md](DESIGN.md) for UI work.

## License

Vele is released under the [MIT License](LICENSE). You are free to use, modify and distribute it, including commercially, as long as the copyright notice and licence text are kept.
