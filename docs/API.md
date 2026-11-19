# HTTP API

Every endpoint lives under `/api` and speaks JSON. It serves Vele's own front end; there is no public API key scheme. Authenticated endpoints use the session cookie set by sign-in.

## Conventions

- **Times** are ISO 8601 instants with an offset (`2026-09-21T09:30:00.000Z`). Ranges are half-open `[start, end)`. Local wall-clock values (working hours, `HH:mm`) are in the user's profile time zone.
- **Errors** return a non-2xx status with `{ "error": { "code": string, "message": string, "details"?: object } }`. The message is safe to show to people. Codes include `validation` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` and `slot_unavailable` (409), `rate_limited` (429), `not_configured` (501), `ai_unavailable` (503), and `internal` (500).
- **Mutations** (POST, PUT, PATCH, DELETE) from a browser must be same-origin. Webhooks and `/api/cron` are exempt and authenticate by signature or bearer secret.
- **Rate limits** return 429 with `rate_limited`. Assistant chat allows 30 messages per minute per user, event changes 120 per minute per user, public slot lookups 60 per minute per IP, public bookings 5 per 10 minutes per IP, and booking management 20 per 10 minutes per IP.
- Responses are `Cache-Control: private, no-store`.

In the tables, **Auth** is `user` (signed in), `admin`, `public`, or a named secret.

## Account and settings

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `*` | `/api/auth/*` | public | Better Auth: `sign-up/email`, `sign-in/email`, `sign-in/magic-link`, `magic-link/verify`, `sign-out`, `get-session` |
| GET | `/api/me` | user | `{ user, bookingHandle, hasVideoLink, features }` |
| PATCH | `/api/me` | user | `{ name?, timezone?, onboarded?: true }` |
| GET | `/api/preferences` | user | `{ preferences }`: working hours, focus and blocked windows, lunch, buffers, limits, notice, slot interval, default calendar, video link |
| PUT | `/api/preferences` | user | Any subset of the preferences fields; returns the updated `{ preferences }` |
| GET | `/api/memory` | user | `{ memory: [{ key, statement, value, source, updatedAt }] }` |
| DELETE | `/api/memory?key=` | user | Forget one remembered preference (the rule it set stays until changed) |
| GET | `/api/contacts` | user | People you have met, invited or been booked by |
| GET | `/api/account/export` | user | Everything stored about you, as a JSON download |
| DELETE | `/api/account` | user | Body `{ "confirm": "delete my account" }`. Deletes the account and all its data |

## Calendars and events

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/calendars` | user | `{ calendars: [{ id, name, color, position, isDefault, isVisible, includeInAvailability, isPersonal }] }` |
| POST | `/api/calendars` | user | `{ name, isPersonal?, color? }` |
| PATCH | `/api/calendars/:id` | user | `{ name?, color?, isVisible?, includeInAvailability?, isPersonal? }`. `color` is a palette ink (`var(--ink-0)` … `var(--ink-6)`) or `#rrggbb` |
| DELETE | `/api/calendars/:id` | user | Only non-default calendars with no events |
| GET | `/api/events?start=&end=` | user | Events overlapping the range (at most two months), recurring series expanded |
| POST | `/api/events` | user | Create; see below. Returns `{ event, invitations }` |
| GET | `/api/events/:id` | user | One event or occurrence |
| PATCH | `/api/events/:id` | user | Any create field, plus `scope: "occurrence" \| "series"` and `notify` |
| DELETE | `/api/events/:id?scope=&notify=&reason=` | user | Cancel; guests are notified unless `notify=false` |
| GET | `/api/search?q=&when=` | user | `{ events, people, bookings }`, trigram-matched |
| GET | `/api/overview` | user | Everything the Today page needs: next event, today's events and open time, week summary, conflicts, pending confirmations, upcoming bookings |
| GET | `/api/insights?start=&end=` | user | Meeting, focus and free minutes per day, back-to-back runs, observations |
| GET | `/api/conflicts?start=&end=` | user | Overlaps and rule breaches with severity |

Event body (`POST /api/events`):

```json
{
  "title": "Lunch with Mom",
  "calendarId": "…",
  "start": "2026-09-19T12:00:00.000Z",
  "end": "2026-09-19T14:00:00.000Z",
  "isAllDay": false,
  "location": null,
  "description": null,
  "meetingUrl": "https://teams.microsoft.com/l/meetup-join/…",
  "attendees": [{ "email": "sarah@example.com", "name": "Sarah" }],
  "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
  "kind": "EVENT",
  "showAs": "BUSY",
  "sendInvitations": true
}
```

`kind` is `EVENT`, `FOCUS`, `BLOCKED` or `OUT_OF_OFFICE`. Event ids of recurring occurrences are composite (series id plus the occurrence start); pass them back unchanged. `invitations` lists `{ email, status: "sent" | "logged" | "failed" }`.

## Availability

`POST /api/availability` (user) runs the scheduling engine, the same one the assistant and booking pages use.

```json
{ "mode": "find", "start": "…", "end": "…", "durationMin": 30,
  "purpose": "meeting", "timeOfDay": { "start": "13:00", "end": "17:00" }, "includeFlagged": false, "maxResults": 5 }
```

This returns slots with `status` (`available`, or `flagged` for out-of-hours fallbacks) and `reasons`, the free windows, what was excluded and why, and the rules applied. With `{ "mode": "check", "start", "end" }` it answers whether a specific window is free and what is in the way. A search may cover at most 31 days.

## Assistant

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/assistant/chat` | user | Body `{ message, conversationId? }`. Responds with a `text/event-stream` |
| GET | `/api/assistant/conversations` | user | `{ conversations: [{ id, title, channel, lastMessageAt }] }` |
| GET | `/api/assistant/conversations/:id` | user | `{ id, title, channel, messages: [{ id, role, text, ui }] }` |
| DELETE | `/api/assistant/conversations/:id` | user | Delete a conversation and its messages |
| POST | `/api/actions/:id` | user | Body `{ decision: "confirm" \| "decline" }` for a pencilled-in change. Confirm returns `{ action, eventId, message, invitations }` |

Stream events (`data: {json}` lines):

| `type` | Fields | Meaning |
| --- | --- | --- |
| `start` | `conversationId`, `offline` | The turn began; `offline` means basic mode |
| `status` | `message` | Progress worth showing ("Waiting 12s for Gemini's rate limit…") |
| `text` | `delta` | Reply text as it streams |
| `tool` | `name`, `summary`, `ok` | A step of the working |
| `ui` | `ui` | The turn's structured UI so far: `proposals`, `actions`, `created`, `trace`, `changed` |
| `done` | `messageId`, `text`, `ui` | Final stored message |
| `error` | `message` | The turn failed and nothing was changed |

## Booking (owner)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/booking/settings` | user | `{ profile: { handle, displayName, headline, welcomeMessage, visibility, url }, meetingTypes }` |
| PATCH | `/api/booking/settings` | user | `{ handle?, displayName?, headline?, welcomeMessage?, visibility? }` (`PUBLIC`, `UNLISTED`, `PRIVATE`) |
| POST | `/api/booking/types` | user | Create a meeting type: `{ title, slug?, description?, durationMin, locationType, locationValue?, bufferBeforeMin?, bufferAfterMin?, minimumNoticeMin?, maxAdvanceDays?, maxPerDay?, slotIntervalMin?, availabilityOverride?, conflictCalendarIds?, destinationCalendarId?, visibility, isActive }` |
| PATCH / DELETE | `/api/booking/types/:id` | user | Update any field / delete |
| POST | `/api/booking/links` | user | `{ meetingTypeId, singleUse?, label?, expiresInDays? }` returns a private link `{ url }`, shown once |
| GET | `/api/bookings?filter=upcoming\|past\|cancelled` | user | `{ bookings }` |
| POST | `/api/bookings/:id/cancel` | user | `{ reason? }`. Cancels and emails the invitee; returns `{ emailStatus }` |

## Booking (public)

None of these return anything about the host's events.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/public/book/:handle` | public | Host name, headline, welcome and public meeting types |
| GET | `/api/public/book/:handle/:slug?invite=` | public | One meeting type (private types need `invite`) |
| GET | `/api/public/book/:handle/:slug/slots?from=&to=&invite=` | public | `{ hostTimezone, durationMin, slots: [iso…] }`, at most 42 days per call |
| POST | `/api/public/book/:handle/:slug/book` | public | `{ start, name, email, message?, timezone, invite? }`. Re-validated on the server; `409 slot_unavailable` if taken. Returns `{ bookingId, start, end, title, hostName, confirmationEmail, manageUrl, meetingUrl, location, hostTimezone }` |
| GET | `/api/public/booking/:token` | manage token | The booking, and whether it can still be changed |
| GET | `/api/public/booking/:token/slots?from=&to=` | manage token | Times it can move to |
| POST | `/api/public/booking/:token/reschedule` | manage token | `{ start }` |
| POST | `/api/public/booking/:token/cancel` | manage token | `{ reason? }` |

## Messaging

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/messaging/link` | user | `{ provider: "TELEGRAM" \| "WHATSAPP" }` returns `{ code, expiresInMinutes, telegramUrl, instructions }` |
| GET | `/api/messaging/identities` | user | Which providers are configured, and linked chats (phone numbers masked) |
| DELETE | `/api/messaging/identities?id=` | user | Unlink a chat |
| POST | `/api/webhooks/telegram` | `X-Telegram-Bot-Api-Secret-Token` | Telegram updates |
| GET | `/api/webhooks/whatsapp` | verify token | Meta subscription handshake |
| POST | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` | WhatsApp messages |

## Operations

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | public | `{ status, database, latencyMs }`; 503 when the database is unreachable |
| GET / POST | `/api/cron` | `Bearer CRON_SECRET` | Runs maintenance and returns what it did |
| GET | `/api/admin/overview` | admin | Accounts, assistant usage, deliveries, bookings and messaging, as aggregates |
| GET | `/api/dev/login` | development only | Signs in as the demo account; 404 in production |
| GET | `/api/dev/outbox` | user, development | Emails the console provider logged for you |
