# Security

Vele holds a person's calendar: who they meet, where, and when. It lets strangers book time through public links, and it lets a language model act on the calendar. This document lists what we defend against and how.

## Reporting a vulnerability

Please do not open a public issue. Email the maintainer (see `brand.supportEmail` in `src/config/brand.ts`) with steps to reproduce. We aim to acknowledge within three working days.

## Assets and threats

| Asset | Threats considered |
| --- | --- |
| Calendar contents, contacts, conversations | Access by other users or anonymous visitors; leakage through booking pages, logs, errors or the AI provider |
| Accounts | Credential stuffing, session theft, CSRF |
| The ability to send email in the user's name | Spam through invitations; invitations to addresses the user never gave |
| Calendar integrity | Double bookings, the assistant acting without consent, prompt injection through event text or chat messages |
| Webhooks | Forged Telegram or WhatsApp messages acting on an account |

## Controls

### Authentication and sessions

- Better Auth with email and password (minimum 10 characters, hashed with scrypt by the library) or one-time magic links (15-minute expiry).
- Database-backed sessions in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` when served over HTTPS. Sessions last 30 days and refresh daily.
- Roles: `user` and `admin`. Admin comes only from `ADMIN_EMAILS` at sign-up. Admin views show aggregates and identifiers, never calendar content.
- Banned users are treated as signed out.

### Authorization and tenancy

- Every service query is scoped by the signed-in user's id; ids from the client are never trusted on their own.
- Public booking endpoints return bookable start times only, never events, titles or busy blocks. Personal calendars never expose titles to anyone else.
- Booking manage links (256-bit) and private booking links (144-bit) are random tokens, and the database stores only their SHA-256 hashes. Messaging link codes are short (six characters) but hashed, single-use, valid for 15 minutes and usable only from the chat app they were issued for.

### Requests

- Every API route validates its query and body with Zod and caps lengths and ranges (for example, at most two months of events per request).
- State-changing requests must come from the app itself (`Sec-Fetch-Site: same-origin` or a matching `Origin`), in addition to `SameSite` cookies.
- Rate limits are kept in PostgreSQL, keyed per user or per hashed IP: assistant chat, mutations, public slot lookups, bookings (5 per 10 minutes per IP) and booking management.
- Responses under `/api` are `Cache-Control: private, no-store`.

### Browser

- Content Security Policy with a per-request nonce and `strict-dynamic` for scripts, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'`, and images limited to the app and `data:`/`blob:`. Styles allow inline attributes, which the calendar layout needs.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and HSTS in production. Booking pages that carry tokens set `referrer: no-referrer`.
- User content is rendered as text. The assistant's replies go through a small formatter that emits only paragraphs, lists and bold text; no HTML is interpreted. Calendar colours are validated against the ink palette or a hex pattern before they reach inline styles.
- The development outbox renders logged emails in a sandboxed iframe with scripts disabled.

### The assistant

- The model can only act through server-side tools. Every tool validates its arguments and re-checks ownership, and every write goes through the same services as the UI.
- Consent is enforced by the server, not the prompt. Adding guests, clashes, repeats, moves and cancellations create a pending action. It runs only when the user presses the button, or when the user sends an affirmative message after the proposal was shown. Pending actions expire after 30 minutes.
- Email addresses are never guessed. An attendee must be a known contact or appear in text the user typed, so an instruction smuggled into an event description cannot make Vele invite a stranger.
- Availability comes from the deterministic engine, and the model is told to offer only times a tool returned.
- What leaves the server: the user's message, recent conversation, and the calendar details the tools return for that request go to Google's Gemini API. Without a key, nothing is sent.
- `AiRun` records model, token counts, latency and tool names, not message content.

### Email

- Invitations go only to addresses the user supplied, from the configured verified sender, with the account holder as reply-to.
- Every email is recorded with its delivery status, and the UI reports "sent", "logged" or "failed" as recorded.

### Webhooks

- Telegram: requests must carry the secret registered with `setWebhook` (`X-Telegram-Bot-Api-Secret-Token`), compared in constant time.
- WhatsApp: requests must carry a valid `X-Hub-Signature-256` HMAC-SHA256 of the raw body with the app secret; the subscription handshake checks the verify token.
- A chat can act on an account only after the account holder links it with a one-time code from Settings. Duplicate deliveries are dropped.
- `/api/cron` requires `Authorization: Bearer $CRON_SECRET` (constant-time comparison).

### Data integrity

- An exclusion constraint in PostgreSQL makes overlapping confirmed bookings impossible, and a per-user advisory lock with a server-side availability re-check guards the booking path.
- Invitations use stable `iCalUid`s and increasing `SEQUENCE` numbers, so calendar clients update events instead of duplicating them.

### Logging and privacy

- Structured logs redact keys that commonly hold secrets or content (tokens, passwords, cookies, titles, descriptions, emails, message text).
- The audit log records actions and identifiers with IP addresses hashed (a SHA-256 keyed with the app secret). Session rows, managed by Better Auth, keep the IP address and user agent of each sign-in.
- Users can export all their data as JSON and delete their account. Deletion cascades to everything they own.
- Secrets live only in environment variables. `.env*` files are git-ignored, except `.env.example`.

## Known limitations

- No two-factor authentication yet. Magic links rely on the security of the user's inbox.
- Rate limits use a fixed window, not a sliding one. That is enough to blunt abuse, but it is not a WAF.
- Prompt injection cannot be ruled out entirely. The controls above limit what a manipulated model could do: it cannot invite unknown addresses, and anything consequential waits for the user.
- WhatsApp replies are limited by Meta's 24-hour messaging window.
