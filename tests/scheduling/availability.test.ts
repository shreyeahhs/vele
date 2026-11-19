import { describe, expect, it } from "vitest";
import { analyzeWindow, dayOverviews, findAvailableSlots, type EngineEvent } from "@/scheduling";
import { LONDON, NEW_YORK, bareRules, day, ev, hm, rules, span, t } from "./fixtures";

// Thursday 24 September 2026 (BST, UTC+1). "Now" is the Monday before.
const NOW = t("2026-09-21T08:00");
const THU = "2026-09-24";

function search(
  events: EngineEvent[],
  opts: Parameters<typeof findAvailableSlots>[0]["options"] & { durationMin?: number; range?: { start: number; end: number }; r?: ReturnType<typeof rules> } = {},
) {
  const { durationMin = 30, range = day(THU), r = rules(), ...options } = opts;
  return findAvailableSlots({ range, durationMin, now: NOW, timezone: LONDON, events, rules: r, options: { maxResults: 20, ...options } });
}

describe("single meeting", () => {
  it("offers time around one meeting inside working hours only", () => {
    const res = search([ev(`${THU}T10:00`, `${THU}T11:00`)], { r: bareRules(), maxResults: 50 });
    expect(res.slots.length).toBeGreaterThan(0);
    for (const s of res.slots) {
      expect(s.start).toBeGreaterThanOrEqual(t(`${THU}T09:00`));
      expect(s.end).toBeLessThanOrEqual(t(`${THU}T17:00`));
      expect(s.end <= t(`${THU}T10:00`) || s.start >= t(`${THU}T11:00`)).toBe(true);
      expect(s.status).toBe("available");
    }
    expect(res.freeWindows.map((w) => span(w))).toEqual(["09:00–10:00", "11:00–17:00"]);
  });
});

describe("multiple meetings and the worked example from the brief", () => {
  // 09:30–10:00 stand-up, 11:00–12:00 research, 14:00–14:30 project, 16:00–17:00 team meeting.
  const thursday = [
    ev(`${THU}T09:30`, `${THU}T10:00`, { title: "Team stand-up" }),
    ev(`${THU}T11:00`, `${THU}T12:00`, { title: "Research meeting" }),
    ev(`${THU}T14:00`, `${THU}T14:30`, { title: "Project call" }),
    ev(`${THU}T16:00`, `${THU}T17:00`, { title: "Team meeting" }),
  ];

  it("finds exactly two 45-minute windows between 13:00 and 17:00 once buffers apply", () => {
    const res = search(thursday, { durationMin: 45, timeOfDay: { start: "13:00", end: "17:00" }, r: rules({ lunch: null }) });
    expect(res.freeWindows.map((w) => span(w))).toEqual(["13:00–13:50", "14:40–15:50"]);
    expect(res.slots[0] && span(res.slots[0])).toBe("13:00–13:45");
    // One option inside the second window (14:45 or 15:00 are both valid picks).
    expect(res.slots.filter((s) => s.start >= t(`${THU}T14:40`) && s.end <= t(`${THU}T15:50`))).toHaveLength(1);
    expect(res.slots.every((s) => s.status === "available")).toBe(true);
    // Every slot keeps 10 minutes (max of before/after buffers) from neighbours.
    for (const s of res.slots) {
      for (const e of thursday) {
        const clear = s.end <= e.start - 10 * 60_000 || s.start >= e.end + 10 * 60_000;
        expect(clear).toBe(true);
      }
    }
  });

  it("reports gaps that only exist before buffers", () => {
    // 12:00–14:00 has room for 45 minutes on paper but lunch is off; 10:00–11:00 is 60 min raw, 40 after buffers.
    const res = search(thursday, { durationMin: 45, r: rules({ lunch: null }), timeOfDay: { start: "09:00", end: "12:00" } });
    expect(res.slots).toHaveLength(0);
    expect(res.excluded.find((x) => x.code === "gap_too_short")?.count).toBe(1);
  });

  it("describes open time for the day", () => {
    const [overview] = dayOverviews({ dates: [THU], timezone: LONDON, events: thursday, rules: rules({ lunch: null }), now: NOW });
    expect(overview.openTime.map((w) => span(w))).toEqual(["09:00–09:30", "10:00–11:00", "12:00–14:00", "14:30–16:00"]);
    expect(overview.meetingCount).toBe(4);
  });
});

describe("overlapping meetings", () => {
  it("treats overlapping events as one busy block", () => {
    const res = search([ev(`${THU}T10:00`, `${THU}T11:00`), ev(`${THU}T10:30`, `${THU}T12:00`)], { r: bareRules(), maxResults: 50 });
    for (const s of res.slots) expect(s.end <= t(`${THU}T10:00`) || s.start >= t(`${THU}T12:00`)).toBe(true);
  });
});

describe("back-to-back meetings", () => {
  it("never places a meeting between back-to-back meetings and labels adjacency", () => {
    const events = [ev(`${THU}T10:00`, `${THU}T11:00`), ev(`${THU}T11:00`, `${THU}T12:00`)];
    const res = search(events, { r: bareRules(), maxResults: 50 });
    expect(res.slots.every((s) => s.end <= t(`${THU}T10:00`) || s.start >= t(`${THU}T12:00`))).toBe(true);
    const right = res.slots.find((s) => hm(s.start) === "12:00");
    expect(right?.reasons.map((r) => r.code)).toContain("follows_meeting");
  });
});

describe("buffers", () => {
  it("keeps the user busy until 15:10 after a 14:00–15:00 meeting with a 10-minute after buffer", () => {
    const res = search([ev(`${THU}T14:00`, `${THU}T15:00`)], {
      r: bareRules({ bufferAfterMin: 10, bufferBeforeMin: 0 }),
      timeOfDay: { start: "14:00", end: "17:00" },
      slotIntervalMin: 5,
    });
    expect(hm(res.freeWindows[0].start)).toBe("15:10");
    expect(Math.min(...res.slots.map((s) => s.start))).toBeGreaterThanOrEqual(t(`${THU}T15:10`));
    const exact = search([ev(`${THU}T14:00`, `${THU}T15:00`)], {
      r: bareRules({ bufferAfterMin: 10, bufferBeforeMin: 0 }),
      timeOfDay: { start: "15:00", end: "15:40" },
      slotIntervalMin: 5,
    });
    expect(exact.slots.map((s) => span(s))).toEqual(["15:10–15:40"]);
  });

  it("respects the new meeting's own after-buffer before the next meeting", () => {
    const r = bareRules({ bufferBeforeMin: 5, bufferAfterMin: 10 });
    const res = search([ev(`${THU}T14:00`, `${THU}T15:00`)], { r, timeOfDay: { start: "13:00", end: "14:00" }, slotIntervalMin: 5 });
    // 30 min meeting must end by 13:50 (its 10-minute after buffer), not 13:55.
    expect(res.freeWindows.map((w) => span(w))).toEqual(["13:00–13:50"]);
  });

  it("per-meeting-type buffers override the new meeting's buffers", () => {
    const res = search([ev(`${THU}T14:00`, `${THU}T15:00`)], {
      r: bareRules({ bufferBeforeMin: 0, bufferAfterMin: 0 }),
      bufferAfterMin: 30,
      timeOfDay: { start: "12:00", end: "14:00" },
    });
    expect(res.freeWindows.map((w) => span(w))).toEqual(["12:00–13:30"]);
  });

  it("flags a window that sits inside a buffer", () => {
    const a = analyzeWindow({
      window: { start: t(`${THU}T15:00`), end: t(`${THU}T15:30`) },
      now: NOW,
      timezone: LONDON,
      events: [ev(`${THU}T14:00`, `${THU}T15:00`)],
      rules: rules(),
    });
    expect(a.clearOfEvents).toBe(true);
    expect(a.available).toBe(false);
    expect(a.bufferIssues[0]).toMatchObject({ side: "before", gapMin: 0 });
  });
});

describe("lunch", () => {
  it("flags lunch-time slots for the owner and hides them on booking pages", () => {
    const owner = search([], { r: rules(), timeOfDay: { start: "12:00", end: "14:00" }, includeFlagged: true });
    const lunchSlot = owner.slots.find((s) => hm(s.start) === "12:30");
    expect(lunchSlot?.status).toBe("flagged");
    expect(lunchSlot?.reasons.map((r) => r.code)).toContain("during_lunch");

    const booking = search([], { r: rules({ minimumNoticeMin: 0 }), mode: "booking", timeOfDay: { start: "12:00", end: "14:00" }, maxResults: 50 });
    expect(booking.slots.every((s) => s.end <= t(`${THU}T12:30`) || s.start >= t(`${THU}T13:30`))).toBe(true);
  });

  it("ignores lunch for personal plans (lunch with mom is lunch)", () => {
    const res = search([], { r: rules(), purpose: "personal", timeOfDay: { start: "12:30", end: "13:30" }, durationMin: 60 });
    expect(res.slots.map((s) => span(s))).toEqual(["12:30–13:30"]);
    expect(res.slots[0].status).toBe("available");
  });
});

describe("blocked and focus time", () => {
  const r = bareRules({ blocked: [{ day: 5, start: "12:00", end: "17:00" }], focus: [{ day: 4, start: "09:00", end: "11:00" }] });

  it("keeps Friday afternoons free", () => {
    const fri = "2026-09-25";
    const res = search([], { r, range: day(fri), maxResults: 50 });
    expect(res.slots.every((s) => s.end <= t(`${fri}T12:00`))).toBe(true);
    expect(res.excluded.find((x) => x.code === "blocked")?.count).toBeGreaterThan(0);
  });

  it("does not offer focus time unless nothing else fits", () => {
    const res = search([], { r, maxResults: 50 });
    expect(res.slots.every((s) => s.start >= t(`${THU}T11:00`))).toBe(true);
    const onlyFocus = search([ev(`${THU}T11:00`, `${THU}T17:00`)], { r });
    expect(onlyFocus.slots.length).toBeGreaterThan(0);
    expect(onlyFocus.slots.every((s) => s.status === "flagged" && s.reasons.some((x) => x.code === "during_focus_time"))).toBe(true);
  });

  it("treats out-of-office events as hard blocks for meetings", () => {
    const res = search([ev(`${THU}T00:00`, `${THU}T23:59`, { kind: "oof", showAs: "oof", isMeeting: false })], { r });
    expect(res.slots).toHaveLength(0);
  });
});

describe("weekends and working hours", () => {
  it("offers nothing on a Saturday for meetings unless flagged ones are requested", () => {
    const sat = "2026-09-26";
    const res = search([], { r: bareRules(), range: day(sat) });
    // Nothing unflagged exists, so flagged options are returned and say why.
    expect(res.slots.every((s) => s.status === "flagged")).toBe(true);
    expect(res.slots[0].reasons.map((r) => r.code)).toContain("non_working_day");
    const booking = search([], { r: bareRules({ minimumNoticeMin: 0 }), range: day(sat), mode: "booking" });
    expect(booking.slots).toHaveLength(0);
  });

  it("allows personal plans on the weekend without flags", () => {
    const sat = "2026-09-26";
    const res = search([], { r: rules(), range: day(sat), purpose: "personal", timeOfDay: { start: "13:00", end: "15:00" }, durationMin: 120 });
    expect(res.slots.map((s) => span(s))).toEqual(["13:00–15:00"]);
    expect(res.slots[0].status).toBe("available");
  });

  it("flags slots outside working hours for the owner", () => {
    const res = search([], { r: bareRules(), timeOfDay: { start: "17:00", end: "18:00" } });
    expect(res.slots[0].status).toBe("flagged");
    expect(res.slots[0].reasons.map((r) => r.code)).toContain("outside_working_hours");
  });

  it("uses Friday's shorter hours", () => {
    const fri = "2026-09-25";
    const res = search([], { r: bareRules(), range: day(fri), mode: "booking", maxResults: 50, durationMin: 60 });
    expect(Math.max(...res.slots.map((s) => s.end))).toBe(t(`${fri}T16:00`));
  });
});

describe("time zones and daylight saving", () => {
  it("evaluates working hours in the user's zone, not the server's", () => {
    // New York user, 09:00–17:00 local = 14:00–22:00 UTC in September (EDT).
    const nyDay = { start: t(`${THU}T00:00`, NEW_YORK), end: t(`2026-09-25T00:00`, NEW_YORK) };
    const res = findAvailableSlots({ range: nyDay, durationMin: 60, now: NOW, timezone: NEW_YORK, events: [], rules: bareRules(), options: { mode: "booking", maxResults: 50 } });
    expect(hm(res.slots[0].start, NEW_YORK)).toBe("09:00");
    expect(new Date(res.slots[0].start).toISOString()).toBe("2026-09-24T13:00:00.000Z");
  });

  it("keeps 09:00 local across the October clock change", () => {
    // UK clocks go back on Sunday 25 October 2026.
    const before = findAvailableSlots({
      range: day("2026-10-23"),
      durationMin: 60,
      now: NOW,
      timezone: LONDON,
      events: [],
      rules: bareRules(),
      options: { mode: "booking", maxResults: 1 },
    });
    const after = findAvailableSlots({
      range: day("2026-10-26"),
      durationMin: 60,
      now: NOW,
      timezone: LONDON,
      events: [],
      rules: bareRules(),
      options: { mode: "booking", maxResults: 1 },
    });
    expect(hm(before.slots[0].start)).toBe("09:00");
    expect(hm(after.slots[0].start)).toBe("09:00");
    expect(new Date(before.slots[0].start).toISOString()).toBe("2026-10-23T08:00:00.000Z");
    expect(new Date(after.slots[0].start).toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("computes the correct day length on the 25-hour day", () => {
    const d = day("2026-10-25");
    expect((d.end - d.start) / 3_600_000).toBe(25);
    const res = findAvailableSlots({
      range: d,
      durationMin: 60,
      now: NOW,
      timezone: LONDON,
      events: [],
      rules: bareRules(),
      options: { purpose: "personal", timeOfDay: { start: "00:00", end: "03:00" }, wakingHours: { start: "00:00", end: "24:00" }, slotIntervalMin: 60, maxResults: 10 },
    });
    // 00:00, 01:00 (BST), 01:00 (GMT), 02:00 wall times exist on this night.
    expect(res.freeWindows[0].minutes).toBe(240);
  });
});

describe("all-day events", () => {
  it("does not block time for a free all-day event (e.g. a birthday)", () => {
    const allDay = ev(`${THU}T00:00`, `2026-09-25T00:00`, { isAllDay: true, showAs: "free", isMeeting: false });
    expect(search([allDay], { r: bareRules() }).slots[0].status).toBe("available");
  });

  it("blocks time for an out-of-office all-day event", () => {
    const allDay = ev(`${THU}T00:00`, `2026-09-25T00:00`, { isAllDay: true, showAs: "oof", kind: "oof", isMeeting: false });
    expect(search([allDay], { r: bareRules() }).slots).toHaveLength(0);
  });
});

describe("multiple calendars", () => {
  it("ignores events on calendars excluded from availability", () => {
    const excluded = ev(`${THU}T09:00`, `${THU}T17:00`, { calendarId: "cal-family", countsForAvailability: false });
    const res = search([excluded], { r: bareRules() });
    expect(res.slots.length).toBeGreaterThan(0);
  });

  it("merges busy time from Google and Microsoft calendars", () => {
    const events = [ev(`${THU}T09:00`, `${THU}T12:00`, { calendarId: "google-work" }), ev(`${THU}T12:00`, `${THU}T17:00`, { calendarId: "microsoft-uni" })];
    const res = search(events, { r: bareRules() });
    expect(res.freeWindows).toHaveLength(0);
    // Only out-of-hours options remain, and each says so.
    expect(res.slots.every((s) => s.status === "flagged" && s.reasons.some((r) => r.code === "outside_working_hours"))).toBe(true);
  });

  it("counts a meeting present on two calendars (same iCalUID) once", () => {
    const events = [
      ev(`${THU}T10:00`, `${THU}T11:00`, { calendarId: "google", iCalUid: "abc@x" }),
      ev(`${THU}T10:00`, `${THU}T11:00`, { calendarId: "microsoft", iCalUid: "abc@x" }),
    ];
    const [o] = dayOverviews({ dates: [THU], timezone: LONDON, events, rules: bareRules(), now: NOW });
    expect(o.meetingCount).toBe(1);
  });
});

describe("responses and tentative events", () => {
  it("ignores declined and cancelled events", () => {
    const events = [ev(`${THU}T09:00`, `${THU}T13:00`, { selfResponse: "declined" }), ev(`${THU}T13:00`, `${THU}T17:00`, { status: "cancelled" })];
    expect(search(events, { r: bareRules() }).freeWindows.map((w) => span(w))).toEqual(["09:00–17:00"]);
  });

  it("treats tentative events as busy by default and free when configured", () => {
    const tentative = [ev(`${THU}T09:00`, `${THU}T17:00`, { showAs: "tentative" })];
    expect(search(tentative, { r: bareRules() }).freeWindows).toHaveLength(0);
    const relaxed = search(tentative, { r: bareRules({ treatTentativeAsBusy: false }) });
    expect(relaxed.slots.length).toBeGreaterThan(0);
  });
});

describe("minimum notice and advance limits (booking pages)", () => {
  it("never offers a slot inside the minimum notice period", () => {
    const now = t(`${THU}T10:07`);
    const res = findAvailableSlots({
      range: day(THU),
      durationMin: 30,
      now,
      timezone: LONDON,
      events: [],
      rules: bareRules({ minimumNoticeMin: 120 }),
      options: { mode: "booking", maxResults: 50 },
    });
    expect(Math.min(...res.slots.map((s) => s.start))).toBe(t(`${THU}T12:15`));
  });

  it("returns nothing beyond the maximum advance window", () => {
    const far = day("2027-03-01");
    const res = findAvailableSlots({ range: far, durationMin: 30, now: NOW, timezone: LONDON, events: [], rules: bareRules({ maxAdvanceDays: 30 }), options: { mode: "booking" } });
    expect(res.slots).toHaveLength(0);
  });

  it("the owner can still use the next few minutes", () => {
    const now = t(`${THU}T10:07`);
    const res = findAvailableSlots({
      range: day(THU),
      durationMin: 30,
      now,
      timezone: LONDON,
      events: [],
      rules: bareRules({ minimumNoticeMin: 120 }),
      options: { maxResults: 50 },
    });
    expect(hm(Math.min(...res.slots.map((s) => s.start)))).toBe("10:15");
  });
});

describe("daily limits", () => {
  it("flags days that already hit the meeting cap", () => {
    const events = [ev(`${THU}T09:00`, `${THU}T09:30`), ev(`${THU}T10:00`, `${THU}T10:30`)];
    const res = search(events, { r: bareRules({ maxMeetingsPerDay: 2 }) });
    expect(res.slots.every((s) => s.status === "flagged" && s.reasons.some((r) => r.code === "day_meeting_cap_reached"))).toBe(true);
  });

  it("flags slots that would create a long chain of meetings", () => {
    const events = [ev(`${THU}T09:00`, `${THU}T10:00`), ev(`${THU}T10:00`, `${THU}T11:00`)];
    const res = search(events, { r: bareRules({ maxConsecutiveMeetings: 2 }), timeOfDay: { start: "11:00", end: "12:00" }, includeFlagged: true });
    const chained = res.slots.find((s) => hm(s.start) === "11:00");
    expect(chained?.reasons.map((r) => r.code)).toContain("creates_long_meeting_chain");
  });
});

describe("scoring is explained, never a bare verdict", () => {
  it("gives every slot at least one reason and prefers slots away from other meetings", () => {
    const events = [ev(`${THU}T10:00`, `${THU}T11:00`)];
    const res = search(events, { r: bareRules(), maxResults: 50 });
    expect(res.slots.every((s) => s.reasons.length > 0)).toBe(true);
    const best = res.slots[res.rankedIndexes[0]];
    expect(best.reasons.map((r) => r.code)).toContain("no_adjacent_meetings");
  });

  it("is deterministic", () => {
    const events = [ev(`${THU}T10:00`, `${THU}T11:00`, { id: "x" }), ev(`${THU}T14:00`, `${THU}T15:00`, { id: "y" })];
    const a = search(events, {});
    const b = search(events, {});
    expect(a).toEqual(b);
  });
});

describe("window analysis", () => {
  it("answers 'am I free between 2 and 4' with conflicts and free sub-windows", () => {
    const events = [ev(`${THU}T14:30`, `${THU}T15:00`, { title: "Project call" })];
    const a = analyzeWindow({ window: { start: t(`${THU}T14:00`), end: t(`${THU}T16:00`) }, now: NOW, timezone: LONDON, events, rules: bareRules() });
    expect(a.available).toBe(false);
    expect(a.conflicts.map((c) => c.title)).toEqual(["Project call"]);
    expect(a.freeWithin.map((w) => span(w))).toEqual(["14:00–14:30", "15:00–16:00"]);
  });

  it("ignores the event being moved", () => {
    const moving = ev(`${THU}T14:00`, `${THU}T15:00`, { id: "moving" });
    const a = analyzeWindow({
      window: { start: t(`${THU}T14:00`), end: t(`${THU}T15:00`) },
      now: NOW,
      timezone: LONDON,
      events: [moving],
      rules: bareRules(),
      ignoreEventIds: ["moving"],
    });
    expect(a.available).toBe(true);
  });
});
describe("slot reasons", () => {
  it("does not repeat a gap note when the short-gap warning already says it", () => {
    const res = search([ev(`${THU}T13:30`, `${THU}T14:30`)], { durationMin: 60, r: rules({ lunch: null }), timeOfDay: { start: "14:30", end: "17:00" }, exhaustive: true });
    const at1500 = res.slots.find((s) => hm(s.start) === "15:00");
    expect(at1500).toBeDefined();
    const codes = at1500!.reasons.map((r) => r.code);
    expect(codes).toContain("leaves_short_gap");
    expect(codes).not.toContain("gap_after_previous");
  });
});
