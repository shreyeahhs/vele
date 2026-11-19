import { DateTime } from "luxon";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { runAgent } from "@/server/ai/agent";
import { OfflineProvider, extractTitle } from "@/server/ai/offline";
import { runTool, type ToolContext } from "@/server/ai/tools";
import type { AIProvider } from "@/server/ai/types";
import { db } from "@/server/db";
import { createEvent, listEvents } from "@/server/services/events";
import { getPreferences } from "@/server/services/preferences";
import { calendarsOf, createUser, resetDb } from "./helpers";

const ZONE = "Europe/London";
// Friday 18 September 2026, 10:30 in London.
const NOW = DateTime.fromISO("2026-09-18T10:30", { zone: ZONE }).toJSDate();
const provider = new OfflineProvider();
const local = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toFormat("ccc dd LLL HH:mm");

async function ask(userId: string, text: string, conversationId?: string) {
  return runAgent({ userId, text, channel: "WEB", conversationId, provider, now: NOW });
}

async function ctxFor(userId: string, latestUserText: string): Promise<ToolContext> {
  return {
    userId,
    conversationId: null,
    channel: "WEB",
    timezone: ZONE,
    now: NOW,
    latestUserText,
    latestUserAt: new Date(),
    recentUserTexts: [latestUserText],
    prefs: await getPreferences(userId),
    ui: { trace: [], proposals: [], actions: [], created: [], changed: false },
  };
}

beforeEach(resetDb);

describe("assistant (offline provider, real tools and database)", () => {
  it("handles 'vele set a meeting from 1-3 this saturday for lunch with mom'", async () => {
    const user = await createUser();
    const out = await ask(user.id, "vele set a meeting from 1-3 this saturday for lunch with mom");
    const events = await listEvents(user.id, { start: new Date("2026-09-19T00:00:00Z"), end: new Date("2026-09-20T00:00:00Z") });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Lunch with mom");
    expect(events[0].calendarName).toBe("Personal");
    expect(local(events[0].start)).toBe("Sat 19 Sep 13:00");
    expect(local(events[0].end)).toBe("Sat 19 Sep 15:00");
    expect(events[0].source).toBe("ASSISTANT");
    expect(out.text).toContain("Added “Lunch with mom”");
    expect(out.ui.created).toHaveLength(1);
    // A personal plan on a Saturday is not flagged or held for confirmation.
    expect(out.ui.actions).toHaveLength(0);
  });

  it("understands the app's own example 'Lunch with Mom from 1–3 this Saturday' (no verb, en dash)", async () => {
    const user = await createUser();
    const out = await ask(user.id, "Lunch with Mom from 1–3 this Saturday");
    const events = await listEvents(user.id, { start: new Date("2026-09-19T00:00:00Z"), end: new Date("2026-09-20T00:00:00Z") });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Lunch with Mom");
    expect(events[0].calendarName).toBe("Personal");
    expect(local(events[0].start)).toBe("Sat 19 Sep 13:00");
    expect(local(events[0].end)).toBe("Sat 19 Sep 15:00");
    expect(out.ui.created).toHaveLength(1);
  });

  it("keeps one hold when the same change is asked for in two conversations", async () => {
    const user = await createUser();
    await createEvent(user.id, { title: "All-hands", start: new Date("2026-09-21T15:00:00Z"), end: new Date("2026-09-21T16:00:00Z"), source: "MANUAL" }, "user");
    const first = await ask(user.id, "Coffee with Sam from 4-5 on Monday");
    const second = await ask(user.id, "Coffee with Sam from 4-5 on Monday");
    expect(first.ui.actions).toHaveLength(1);
    expect(second.ui.actions).toHaveLength(1);
    const pending = await db.pendingAction.findMany({ where: { userId: user.id, status: "PENDING" } });
    expect(pending.map((p) => p.id)).toEqual([second.ui.actions[0].id]);
  });

  it("still treats a question with a time as a question, not a booking", async () => {
    const user = await createUser();
    await ask(user.id, "Am I free from 1-3 this Saturday?");
    const events = await listEvents(user.id, { start: new Date("2026-09-19T00:00:00Z"), end: new Date("2026-09-20T00:00:00Z") });
    expect(events).toHaveLength(0);
  });

  // A Sunday "this week" search covers only today, so the model searches again
  // for the days after. Both sets have to stay pencilled and selectable.
  it("keeps options from every slot search in the same turn", async () => {
    const user = await createUser();
    const sundayMorning = DateTime.fromISO("2026-09-20T09:00", { zone: ZONE }).toJSDate();
    const ctx = { ...(await ctxFor(user.id, "book a 5 hour gaming session this week")), now: sundayMorning };

    type Found = { options: Array<{ option: string; date: string }> };
    const today = (await runTool("find_available_slots", { when: "this week", duration_minutes: 300, purpose: "personal" }, ctx)).result as Found;
    const after = (await runTool("find_available_slots", { when: "next 5 days", duration_minutes: 300, purpose: "personal" }, ctx)).result as Found;

    expect(today.options.length).toBeGreaterThan(0);
    expect(after.options.length).toBeGreaterThan(0);
    // Every option the model was given is selectable and on the calendar...
    const labels = ctx.ui.proposals.map((p) => p.label);
    for (const o of [...today.options, ...after.options]) expect(labels).toContain(o.option);
    // ...including Sunday's, which the second search would previously have wiped.
    expect(ctx.ui.proposals.length).toBe(new Set(labels).size);
    expect(ctx.ui.proposals.some((p) => DateTime.fromISO(p.start, { zone: ZONE }).weekday === 7)).toBe(true);
    expect(ctx.ui.proposals.length).toBeLessThanOrEqual(12);
  });

  it("answers schedule questions from the calendar", async () => {
    const user = await createUser();
    await ask(user.id, "set a meeting from 1-3 this saturday for lunch with mom");
    const out = await ask(user.id, "what do I have this saturday?");
    expect(out.text).toContain("13:00–15:00 Lunch with mom");
  });

  it("pencils in a meeting with a guest, then books it only after 'yes'", async () => {
    const user = await createUser();
    const first = await ask(user.id, "book a meeting tomorrow at 3pm with sarah@example.com for project review");
    expect(first.ui.actions).toHaveLength(1);
    expect(first.text).toContain("Confirm?");
    expect(await db.calendarEvent.count({ where: { userId: user.id } })).toBe(0);

    const second = await ask(user.id, "yes", first.conversationId);
    const events = await db.calendarEvent.findMany({ where: { userId: user.id }, include: { attendees: true } });
    expect(events).toHaveLength(1);
    expect(events[0].attendees.map((a) => a.email)).toEqual(["sarah@example.com"]);
    // Honest about delivery: the console provider logs, it does not send.
    expect(second.text).toContain("logged in development mode");
    const note = await db.notification.findFirst({ where: { userId: user.id, type: "invitation" } });
    expect(note?.status).toBe("LOGGED");
  });

  it("finds slots with the engine and labels them", async () => {
    const user = await createUser();
    const out = await ask(user.id, "find me 45 minutes on thursday afternoon");
    expect(out.ui.proposals.length).toBeGreaterThan(0);
    for (const p of out.ui.proposals) {
      const s = DateTime.fromISO(p.start, { zone: ZONE });
      expect(s.weekday).toBe(4);
      expect(s.hour).toBeGreaterThanOrEqual(12);
    }
    expect(out.text).toMatch(/^I found \d option/);
  });
});

describe("tool guard rails", () => {
  it("refuses an email address the user never gave", async () => {
    const user = await createUser();
    const ctx = await ctxFor(user.id, "book a meeting with Sarah tomorrow at 3");
    const res = await runTool("create_event", { title: "Meeting with Sarah", when: "tomorrow at 3", attendees: [{ email: "sarah@guessed.com", name: "Sarah" }] }, ctx);
    expect(res.ok).toBe(false);
    expect((res.result as { error: string }).error).toBe("email_not_provided");
    expect(await db.calendarEvent.count({ where: { userId: user.id } })).toBe(0);
  });

  it("will not confirm a proposal without an explicit yes in the latest message", async () => {
    const user = await createUser();
    const ctx = await ctxFor(user.id, "move it to 4 please sarah@example.com");
    const created = await runTool("create_event", { title: "Review", when: "tomorrow at 15:00", attendees: [{ email: "sarah@example.com" }] }, ctx);
    expect((created.result as { status: string }).status).toBe("needs_confirmation");
    const confirm = await runTool("confirm_pending_action", {}, { ...ctx, latestUserText: "hmm, maybe", latestUserAt: new Date(Date.now() + 1000) });
    expect((confirm.result as { error: string }).error).toBe("not_confirmed");
    // Same-turn self-confirmation is impossible: the proposal is newer than the message.
    const sameTurn = await runTool("confirm_pending_action", {}, { ...ctx, latestUserText: "yes", latestUserAt: new Date(0) });
    expect((sameTurn.result as { error: string }).error).toBe("not_confirmed");
    expect(await db.calendarEvent.count({ where: { userId: user.id } })).toBe(0);
  });

  it("always requires confirmation to cancel", async () => {
    const user = await createUser();
    const ctx = await ctxFor(user.id, "add dentist tomorrow at 9");
    const made = await runTool("create_event", { title: "Dentist", when: "tomorrow at 9", calendar: "Personal", duration_minutes: 30 }, ctx);
    const eventId = (made.result as { event: { event_id: string } }).event.event_id;
    const cancel = await runTool("cancel_event", { event_id: eventId }, ctx);
    expect((cancel.result as { status: string }).status).toBe("needs_confirmation");
    expect(await db.calendarEvent.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rejects malformed arguments before running anything", async () => {
    const user = await createUser();
    const res = await runTool("find_available_slots", { when: "tomorrow", duration_minutes: "an hour" }, await ctxFor(user.id, "x"));
    expect(res.ok).toBe(false);
    expect((res.result as { error: string }).error).toBe("invalid_arguments");
  });

  it("saves a preference as a real scheduling rule", async () => {
    const user = await createUser();
    const res = await runTool(
      "remember_preference",
      { statement: "Keep Friday afternoons free", type: "keep_time_free", days: ["fri"], start: "12:00", end: "17:00" },
      await ctxFor(user.id, "Keep Friday afternoons free"),
    );
    expect(res.ok).toBe(true);
    const prefs = await getPreferences(user.id);
    expect(prefs.blocked).toEqual([{ day: 5, start: "12:00", end: "17:00", label: "Kept free" }]);
  });
});

describe("tenant isolation", () => {
  it("never lets one user read or change another user's events", async () => {
    const a = await createUser("A");
    const b = await createUser("B");
    const { work } = await calendarsOf(a.id);
    const ctxA = await ctxFor(a.id, "add standup tomorrow at 9");
    const made = await runTool("create_event", { title: "Standup", when: "tomorrow at 9", calendar: work.name }, ctxA);
    const id = (made.result as { event: { event_id: string } }).event.event_id;

    const ctxB = await ctxFor(b.id, "cancel it");
    const read = await runTool("get_event", { event_id: id }, ctxB);
    expect((read.result as { error: string }).error).toBe("not_found");
    const cancel = await runTool("cancel_event", { event_id: id }, ctxB);
    expect((cancel.result as { error: string }).error).toBe("not_found");
    const search = await runTool("search_events", { query: "Standup" }, ctxB);
    expect((search.result as { results: unknown[] }).results).toHaveLength(0);
    expect(await listEvents(b.id, { start: new Date("2026-09-01"), end: new Date("2026-10-01") })).toHaveLength(0);
  });
});

describe("title extraction (offline)", () => {
  it.each([
    ["vele set a meeting from 1-3 this saturday for lunch with mom", "Lunch with mom"],
    ["book a meeting with Sarah tomorrow at 3", "Meeting with Sarah"],
    ["add dentist tomorrow at 9", "Dentist"],
  ])("%s", (text, title) => {
    expect(extractTitle(text)).toBe(title);
  });
});

describe("assistant when the model fails mid-turn", () => {
  it("reports what the tools already did instead of implying nothing happened", async () => {
    const user = await createUser();
    let calls = 0;
    const flaky: AIProvider = {
      id: "scripted",
      model: "scripted",
      async generate() {
        calls++;
        if (calls === 1) {
          return {
            text: "",
            toolCalls: [{ id: "c1", name: "create_event", args: { title: "Lunch with Dad", date: "2026-09-27", start_time: "13:00", end_time: "15:00" }, providerId: false }],
            raw: null,
            finish: "tool_calls",
            usage: { input: 0, output: 0, thoughts: 0 },
          };
        }
        throw new AppError("rate_limited", "Today's free Gemini quota for this key is used up.");
      },
    };
    const out = await runAgent({ userId: user.id, text: "set lunch with dad from 1-3 next sunday", channel: "WEB", provider: flaky, now: NOW });
    const events = await listEvents(user.id, { start: new Date("2026-09-27T00:00:00Z"), end: new Date("2026-09-28T00:00:00Z") });
    expect(events.map((e) => e.title)).toEqual(["Lunch with Dad"]);
    expect(out.text).toContain("Added “Lunch with Dad”");
    expect(out.text).toContain("I couldn't finish my reply: Today's free Gemini quota");
    expect(out.ui.created).toHaveLength(1);
  });
});
