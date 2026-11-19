import { appendFileSync, mkdirSync } from "node:fs";
import { DateTime } from "luxon";
import { beforeAll, describe, expect, it } from "vitest";
import { runAgent } from "@/server/ai/agent";
import { GeminiProvider } from "@/server/ai/gemini";
import { db } from "@/server/db";
import { createEvent, listEvents } from "@/server/services/events";
import { createUser, resetDb } from "../integration/helpers";

/**
 * Live checks against the real Gemini API (opt-in: `LIVE_AI=1 pnpm test tests/live`).
 * They verify the wiring (function calling, thought signatures, schemas) and
 * the behaviours that matter most: grounded answers, confirmation before
 * inviting anyone, no invented email addresses.
 */
const KEYS = (process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const live = Boolean(process.env.LIVE_AI && KEYS.length);
const ZONE = "Europe/London";
const NOW = DateTime.fromISO("2026-09-18T10:30", { zone: ZONE }).toJSDate();
const at = (s: string) => DateTime.fromISO(s, { zone: ZONE }).toJSDate();

describe.skipIf(!live)("Gemini agent (live)", () => {
  let userId: string;
  const provider = () => new GeminiProvider(KEYS, process.env.GEMINI_MODEL || "gemini-3.8-flash");
  const ask = async (text: string, conversationId?: string) => {
    const out = await runAgent({ userId, text, channel: "WEB", conversationId, provider: provider(), now: NOW });
    mkdirSync("test-results", { recursive: true });
    appendFileSync("test-results/live-gemini.log", `\n> ${text}\n${out.text}\n[tools: ${out.ui.trace.map((t) => `${t.tool}${t.ok ? "" : "!"}`).join(", ")}]\n`);
    return out;
  };

  beforeAll(async () => {
    await resetDb();
    userId = (await createUser()).id;
    // Thursday 24 September, the brief's example day.
    for (const [title, s, e] of [
      ["Team stand-up", "09:30", "10:00"],
      ["Research meeting", "11:00", "12:00"],
      ["Project call", "14:00", "14:30"],
      ["Team meeting", "16:00", "17:00"],
    ]) {
      await createEvent(userId, { title, start: at(`2026-09-24T${s}`), end: at(`2026-09-24T${e}`), source: "MANUAL" }, "user");
    }
  }, 60_000);

  it("describes a day from the calendar", async () => {
    const out = await ask("What does my Thursday look like?");
    expect(out.text).toContain("09:30");
    expect(out.text).toMatch(/Research meeting/);
    expect(out.ui.trace.some((t) => t.tool === "get_schedule")).toBe(true);
  }, 90_000);

  it("finds a 45-minute slot using the engine, not guesswork", async () => {
    const out = await ask("Can I fit a 45 minute meeting with someone between 1 and 5 on Thursday?");
    expect(out.ui.trace.some((t) => t.tool === "find_available_slots" || t.tool === "check_availability")).toBe(true);
    expect(out.text).toMatch(/13:00/);
  }, 90_000);

  it("creates the lunch-with-mom event", async () => {
    const out = await ask("vele set a meeting from 1-3 this saturday for lunch with mom");
    const events = await listEvents(userId, { start: at("2026-09-19T00:00"), end: at("2026-09-20T00:00") });
    expect(events).toHaveLength(1);
    expect(DateTime.fromISO(events[0].start, { zone: ZONE }).toFormat("HH:mm")).toBe("13:00");
    expect(DateTime.fromISO(events[0].end, { zone: ZONE }).toFormat("HH:mm")).toBe("15:00");
    expect(out.text.toLowerCase()).toMatch(/lunch/);
  }, 90_000);

  it("asks for an email address instead of inventing one, and confirms before inviting", async () => {
    const first = await ask("Book a 30 minute meeting with Sarah at 3pm on Monday");
    expect(first.text.toLowerCase()).toMatch(/email/);
    expect(await db.eventAttendee.count({ where: { userId } })).toBe(0);
    const second = await ask("sarah@example.com", first.conversationId);
    expect(second.ui.actions.length + (second.text.toLowerCase().includes("confirm") ? 1 : 0)).toBeGreaterThan(0);
    expect(await db.eventAttendee.count({ where: { userId } })).toBe(0);
    const third = await ask("Yes", first.conversationId);
    expect(await db.eventAttendee.count({ where: { userId, email: "sarah@example.com" } })).toBe(1);
    expect(third.text.toLowerCase()).toMatch(/logged|development/);
  }, 180_000);
});
