# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-specified: Next.js (App Router) + TypeScript + React + Tailwind CSS + shadcn/ui-style owned components + Lucide + TanStack Query + Motion, PostgreSQL + Prisma. Auth delegated: Better Auth (email + password and magic link, database sessions in our own tables); Auth.js v5 was considered but is still in beta. AI provider: Google Gemini (user's choice) behind an `AIProvider` abstraction. No separate worker or Redis: post-response work runs with Next.js `after()`, periodic work through a secured cron endpoint.

## Users

Primary user (V1): one person in a busy administrative role, for example at a university research centre. They juggle work meetings, personal plans (for example "lunch with mom on Saturday") and people who need time with them. Vele is their calendar: they log meetings by chatting with the assistant (web or messaging) or by hand. There is deliberately no Google, Outlook, Teams or Meet integration.

Secondary audience: people booking time with the user through a public or unlisted scheduling link, usually opened on a phone from an email or WhatsApp message. They are external, arrive with no context, and should see availability only, never event details.

Future: many independent users (multi-tenant SaaS); an operator/admin who monitors system health.

## Product Purpose

An assistant that actually manages your calendar. The user should not have to manage the calendar by hand: they ask in natural language ("what does my Thursday look like", "can I fit 45 minutes with Sarah after 3", "vele set a meeting from 1-3 this saturday for lunch with mom") and the assistant answers or acts on a single unified schedule. Success means the user stops opening multiple calendars to answer "when am I free", and stops sending lists of times to people.

## Positioning

The differentiator is the scheduling agent, not the calendar UI. The language model interprets and orchestrates, but never decides availability: a deterministic, tested scheduling engine computes every free slot from real events, working hours, buffers, blocked and focus time. The assistant can only claim what a tool actually returned, and only confirms an action after the backend completed it.

## Operating Context

- The assistant is addressed by name, "Vele" (brand name is configurable; see `src/config/brand.ts`).
- Calendar source: Vele's own calendars (Work, Personal, and any the user adds). Events come from chat, manual entry, and bookings. A pasted Teams/Meet/Zoom link is recognised and shown with a Join button; Vele does not create meetings in those services.
- Interfaces: web app (desktop-first, strong mobile), public booking pages, and a messaging channel (Telegram working; WhatsApp Business Cloud API prepared). All interfaces share one agent.
- Timezone: user in Europe/London (BST/GMT changes matter); attendees may be anywhere. Timestamps stored in UTC and displayed in the user's configured zone.

## Capabilities and Constraints

- One event model, stored in PostgreSQL; recurring series expanded in the event's own time zone.
- Deterministic scheduling engine: working hours, buffers, lunch, blocked time, focus time, minimum notice, max advance, max meetings per day, max consecutive meetings, preferred hours, with explained slot scoring (criteria, never "best").
- Destructive or outward actions (cancel, delete, move, invite others) require explicit confirmation; creating a private personal event does not.
- Never invent meetings, availability, attendees or email addresses.
- Booking: meeting types, public/unlisted/private links, server-side re-validation plus database-level double-booking protection, confirmation/cancellation/reschedule emails.
- Security: hashed one-time tokens, tenant isolation by `userId`, audit log, data minimisation toward the AI model.
- Undecided: production hosting target, final product name, custom domain.

## Brand Commitments

- Name in use: "Vele" (the user addresses the assistant by this name). It must stay configurable in one place.
- Voice: conversational but precise; describes, never judges productivity; states constraints instead of claiming a slot is "best".
- References the user named for feel (not to copy): Linear, Raycast, Cron, Superhuman, Notion, modern Apple software. Calm, premium, professional, minimal, slightly futuristic, AI-native. Avoid rainbow calendars, heavy gradients, glassmorphism, excess shadows, generic SaaS dashboard look.

## Evidence on Hand

No real customers, testimonials, metrics or logos exist. Do not fabricate any. Demo calendar data used for development and screenshots must be labelled as sample data.

## Product Principles

1. The engine calculates, the agent orchestrates, providers talk to the outside world, the database is the source of truth.
2. Show constraints, let the user decide.
3. Nothing is confirmed until the backend says so.
4. Minimum data, maximum isolation: send the model only the window the question needs; every row belongs to a user.
5. One brain, many surfaces: web chat, messaging and future channels call the same agent.

## Accessibility & Inclusion

Keyboard-first operation (command palette, single-key shortcuts that never fire inside inputs), WCAG AA contrast in both themes, reduced-motion respected, public booking page fully usable on small phones and with screen readers.
