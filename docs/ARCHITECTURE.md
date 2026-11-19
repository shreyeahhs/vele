# Architecture

Vele is one Next.js application backed by one PostgreSQL database. Three ideas shape it:

1. **The calendar is native.** Events live in Vele's own tables. There is no sync with external calendars, so there are no sync bugs, and every time is computed from one source of truth.
2. **Arithmetic belongs to code, language to the model.** A deterministic engine decides what is free. The language model interprets requests and explains results; it never computes availability or invents events.
3. **Pencil before ink.** Changes that affect other people or cannot easily be undone are stored as pending actions and only run after the user confirms.

```
Browser (React 19, TanStack Query)          Telegram / WhatsApp
        │  fetch + SSE                              │ webhooks
        ▼                                           ▼
  Next.js route handlers  ── src/lib/api.ts (auth, origin check, validation, rate limit, errors)
        │
        ├── services (src/server/services): events, bookings, availability, preferences, memory, …
        │        │
        │        └── scheduling engine (src/scheduling): pure functions, no I/O
        ├── AI agent (src/server/ai): provider-neutral loop, tools, pending actions
        ├── email (src/server/email): provider abstraction, ICS, notification log
        └── messaging (src/server/messaging): Telegram, WhatsApp, account linking
        │
        ▼
  PostgreSQL (Prisma 7, driver adapter pg): constraints do the last line of defence
```

## Request path

Every API route is built with `route()` (`src/lib/api.ts`). It:

- resolves the session (Better Auth, database sessions) and rejects unauthenticated calls unless the route is public;
- rejects cross-site state-changing requests (`Sec-Fetch-Site` or `Origin` must match the app, on top of `SameSite=Lax` cookies);
- validates query and body with Zod and returns field errors as `400 validation`;
- applies a PostgreSQL-backed fixed-window rate limit where configured (per user or per hashed IP);
- turns `AppError`s into `{ error: { code, message } }` with the right status, and logs anything unexpected without leaking internals.

Pages under `src/app/(app)` call `requirePageUser()` in their layout, which redirects to sign-in or onboarding. `src/proxy.ts` sets a per-request CSP nonce.

## Data model

`prisma/schema.prisma` holds all tables. Main groups:

- **Identity**: `User` (with time zone, locale, role, onboarding), `Session`, `auth_accounts`, `Verification`.
- **Calendar**: `Calendar` (name, ink, visibility, whether it counts toward availability, personal), `CalendarEvent` (times in UTC plus the event's time zone, all-day dates, `kind` EVENT/FOCUS/BLOCKED/OUT_OF_OFFICE, `showAs`, RRULE lines for recurring masters, `seriesId` + `originalStartTime` for changed occurrences, `source` MANUAL/ASSISTANT/BOOKING, `iCalUid` + `sequence` for invitations), `EventAttendee`, `Contact`.
- **Rules**: `SchedulingPreferences`, `AvailabilityRule` (weekly working, focus and blocked windows), `UserPreference` (what the assistant remembers, with the user's own words).
- **Booking**: `BookingProfile` (handle), `MeetingType`, `BookingInvite` (private links, token hashes only), `Booking` (manage-token hash).
- **Assistant**: `Conversation`, `ConversationMessage` (text plus the structured UI of the turn), `PendingAction`, `AiRun` (model, tokens, latency, tool calls, no message content).
- **Operations**: `Notification` (every email with its delivery status), `MessagingIdentity`, `MessagingLinkCode`, `AuditLog` (actions and identifiers, hashed IPs), `RateLimitBucket`.

Every row that belongs to a person carries `userId`, and every service query filters by it. That is the multi-tenant boundary.

Database-level guarantees (see the migrations):

- `bookings_no_overlap`: an `EXCLUDE USING gist` constraint on `(userId, tstzrange(start, end))` for confirmed bookings. Two concurrent bookings of the same slot cannot both commit.
- Check constraints on time ranges, and trigram GIN indexes for search.

## Recurrence and time zones

Recurring events store RRULE lines on a master event. `expandRecurrence` (in the engine) expands them in the event's own wall-clock time zone, so "every Monday 09:30" stays at 09:30 across daylight-saving changes. Edited or cancelled occurrences are separate rows linked by `seriesId` and `originalStartTime`, and they override the generated instance.

All instants are UTC in the database and on the wire (ISO strings with offsets). Everything shown to the user is formatted in the profile's time zone, never the browser's; booking pages use the visitor's zone.

## The scheduling engine (`src/scheduling`)

Pure TypeScript: inputs in, results out, no clock or database access (the caller passes `now`). It is the only place availability is decided, and the web UI, the booking pages and the assistant all call it.

- `findAvailableSlots` builds free windows from working hours minus busy events. Buffers are applied as `max(existing, candidate)` padding. Lunch, focus, blocked windows, minimum notice, maximum advance, daily limits and back-to-back limits come next. Candidates are stepped on the slot interval, scored, and returned with **reasons** ("No adjacent meetings", "Leaves a 20 min gap before the next meeting"). The engine also reports what it excluded and why ("gap_too_short", "outside working hours").
- Two tiers. In `owner` mode, when nothing fits inside working hours, it can return clearly flagged out-of-hours options. In `booking` mode it never does.
- Purposes: `meeting` versus `personal` (personal plans ignore working hours).
- `analyzeWindow` / `detectConflicts` / `computeInsights` / `dayOverviews` answer "am I free", "what clashes" and "how busy am I" with the same rules.
- `resolveTimeExpression` turns phrases like "from 1-3 this saturday" into exact ranges in the user's zone, with the assumptions it made ("Read '1' as 13:00"). `chrono-node` handles the parsing and deterministic rules handle the ambiguity.

The engine never uses the word "best"; it states facts and lets the person choose.

## The assistant (`src/server/ai`)

- **Provider-neutral.** `AIProvider` has one method, `generate`. `GeminiProvider` uses `@google/genai` with streaming, function declarations built from Zod schemas, and thought signatures replayed within a turn. `OfflineProvider` is a rule-based stand-in used when there is no key. It drives the same tools, which is also how the integration tests exercise the whole agent without a network.
- **Loop** (`agent.ts`): the system prompt plus a short per-turn context (now, zone, calendars, rules, any pending action), then up to a fixed number of model/tool iterations. Tool arguments are validated with Zod, and tool errors go back to the model as structured results it must report honestly. Text streams to the browser over SSE as `start`, `status`, `text`, `tool`, `ui`, `done` and `error` events.
- **Tools** (`tools.ts`): read the schedule, check and find availability, search events, look up contacts, create, update and cancel events, confirm or discard pending actions, remember preferences, generate booking links, and give insights and conflicts. Each tool records a one-line trace (the "Show working" list) and contributes to the turn's UI: proposals pencilled onto the calendar, pending action cards, created-event receipts with Undo.
- **Safety rules in code, not only in the prompt:**
  - A new event with no guests, no clash and no repeat is created immediately (with Undo). Anything with guests, a clash, a repeat, a move or a cancellation becomes a `PendingAction` with a readback, and runs only when the user presses the button or sends an affirmative reply after the proposal (`actions.ts`). Pending actions expire after 30 minutes.
  - Attendee addresses must already be in the user's contacts or appear in something the user typed. Anything else is rejected before any email is sent.
  - Delivery status (`sent`, `logged`, `failed`) flows from the email layer to the tool result and into the reply.
  - If the model fails mid-turn, the reply lists what the tools already did.
- **Memory**: `remember_preference` maps statements onto real rule changes ("no meetings before 10" sets `noMeetingsBefore`) and stores the user's own wording so Settings can show it and forget it.
- **Records**: every turn writes an `AiRun` (model, token counts including thinking tokens, latency, tool names and outcomes) for the admin view. Message content is not copied there.

## Booking pages

Public routes (`/api/public/...`) never return event data, only bookable start times. Creating a booking:

1. Re-validates the chosen start with the engine in `booking` mode (the page's slot list is never trusted), inside a transaction holding a per-user advisory lock.
2. Inserts the booking and its calendar event. The exclusion constraint makes a double booking impossible even if two requests pass step 1 at the same moment; the loser gets `409 slot_unavailable`.
3. Sends confirmations with an `.ics` attachment to both sides, and returns a manage link. Its token is stored only as a hash.

Rescheduling runs the same check, ignoring the booking's own event. Private links are single-use tokens (hashed) scoped to one meeting type, with optional expiry.

## Email (`src/server/email`)

`sendEmail` picks Brevo, Resend or the console provider, records a `Notification` row before sending, and updates it with the outcome. Invitations carry hand-built iCalendar (`METHOD:REQUEST`/`CANCEL`, `SEQUENCE`, `RECURRENCE-ID` for single occurrences, `TZID` for recurring series), so Outlook, Gmail and Apple Calendar all update the right event. Failed sends are retried by maintenance.

## Messaging (`src/server/messaging`)

A `MessagingProvider` interface with Telegram and WhatsApp implementations verifies the webhook (secret header, or HMAC signature), parses messages and sends replies. A chat is linked to an account with a one-time six-character code from Settings. The webhook acknowledges immediately and processes the message with `after()`, dropping duplicate deliveries by message id. Messages then go through the same `runAgent` as the web. Confirmation works by replying "yes" after a proposal, because chat apps have no buttons.

## Background work

`src/instrumentation.ts` starts a 10-minute maintenance loop in long-running servers: expire pending actions, retry failed emails, prune rate-limit buckets, verification tokens, link codes, old conversations and AI run logs. `/api/cron` runs the same job for serverless hosts, protected by `CRON_SECRET`.

## Front end

- `src/app/(app)` holds the signed-in pages (Today, Calendar, Assistant, Bookings, Settings, Admin) inside `AppShell`: sidebar or bottom navigation, the command palette (⌘K), keyboard shortcuts, the event dialog, and the Vele margin beside Today and Calendar on wide screens.
- State: TanStack Query for server data. Small React contexts hold the user's zone, UI dialogs, the assistant conversation (SSE), and the "pencil" layer: the proposals and freshly inked events the calendar draws.
- Browser-only values (clock, media queries, device zone, saved theme) are read through `useSyncExternalStore` (`src/hooks/use-client.ts`), so server and client renders agree.
- The visual system is documented in `DESIGN.md`.

## Testing

- `tests/scheduling`: the engine, including the worked examples from the brief, DST, recurrence, conflicts and insights.
- `tests/integration`: the agent with the offline provider against a real database (create, confirm, clash, invitations, memory, mid-turn failure), and bookings (concurrency via the exclusion constraint, notice, limits, reschedule, cancel, private links).
- `tests/live`: opt-in checks against Gemini with real requests.
