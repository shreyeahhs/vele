import { describe, expect, it } from "vitest";
import { computeInsights, detectConflicts, describeRecurrence, expandRecurrence, findAvailableSlots } from "@/scheduling";
import { LONDON, bareRules, day, ev, hm, rules, t } from "./fixtures";

describe("recurring events", () => {
  const master = {
    start: t("2026-10-19T10:00"),
    end: t("2026-10-19T11:00"),
    timezone: LONDON,
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
  };

  it("keeps a weekly 10:00 meeting at 10:00 local across the October clock change", () => {
    const occ = expandRecurrence(master, { start: t("2026-10-18T00:00"), end: t("2026-11-03T00:00") });
    expect(occ.map((o) => hm(o.start))).toEqual(["10:00", "10:00", "10:00"]);
    expect(occ.map((o) => new Date(o.start).toISOString())).toEqual([
      "2026-10-19T09:00:00.000Z", // BST
      "2026-10-26T10:00:00.000Z", // GMT
      "2026-11-02T10:00:00.000Z",
    ]);
  });

  it("applies EXDATE (with TZID) and skips modified instances", () => {
    const withEx = { ...master, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=Europe/London:20261026T100000"] };
    const occ = expandRecurrence(withEx, { start: t("2026-10-18T00:00"), end: t("2026-11-03T00:00") }, [t("2026-11-02T10:00")]);
    expect(occ.map((o) => o.start)).toEqual([t("2026-10-19T10:00")]);
  });

  it("honours COUNT and UNTIL", () => {
    const count = expandRecurrence({ ...master, recurrence: ["RRULE:FREQ=DAILY;COUNT=3"] }, { start: t("2026-10-01T00:00"), end: t("2026-12-01T00:00") });
    expect(count).toHaveLength(3);
    const until = expandRecurrence({ ...master, recurrence: ["RRULE:FREQ=DAILY;UNTIL=20261021T235959Z"] }, { start: t("2026-10-01T00:00"), end: t("2026-12-01T00:00") });
    expect(until.map((o) => hm(o.start))).toEqual(["10:00", "10:00", "10:00"]);
  });

  it("expands all-day series by local date", () => {
    const allDay = {
      start: t("2026-10-19T00:00"),
      end: t("2026-10-20T00:00"),
      timezone: LONDON,
      isAllDay: true,
      startDate: "2026-10-19",
      endDate: "2026-10-20",
      recurrence: ["RRULE:FREQ=WEEKLY;COUNT=2"],
    };
    const occ = expandRecurrence(allDay, { start: t("2026-10-01T00:00"), end: t("2026-11-30T00:00") });
    expect(occ.map((o) => o.date)).toEqual(["2026-10-19", "2026-10-26"]);
    // The 26th is a normal 24-hour day in GMT.
    expect((occ[1].end - occ[1].start) / 3_600_000).toBe(24);
  });

  it("blocks availability for each occurrence once expanded", () => {
    const occ = expandRecurrence(master, day("2026-10-26"));
    const events = occ.map((o, i) => ev("2026-10-26T00:00", "2026-10-26T00:01", { id: `r${i}`, start: o.start, end: o.end }));
    const res = findAvailableSlots({
      range: day("2026-10-26"),
      durationMin: 60,
      now: t("2026-10-01T00:00"),
      timezone: LONDON,
      events,
      rules: bareRules(),
      options: { mode: "booking", maxResults: 50 },
    });
    expect(res.slots.every((s) => s.end <= t("2026-10-26T10:00") || s.start >= t("2026-10-26T11:00"))).toBe(true);
  });

  it("describes rules in words", () => {
    expect(describeRecurrence(["RRULE:FREQ=WEEKLY;BYDAY=MO"])).toBe("Every week on Monday");
  });
});

describe("conflict detection", () => {
  const range = day("2026-09-24");

  it("reports simultaneous events from different calendars as a double booking", () => {
    const conflicts = detectConflicts({
      events: [
        ev("2026-09-24T10:00", "2026-09-24T10:30", { calendarId: "outlook", title: "Team Meeting" }),
        ev("2026-09-24T10:15", "2026-09-24T11:00", { calendarId: "google", title: "Project Call" }),
      ],
      rules: bareRules(),
      timezone: LONDON,
      range,
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ type: "double_booking", severity: "high" });
    expect(hm(conflicts[0].start)).toBe("10:15");
    expect(hm(conflicts[0].end)).toBe("10:30");
    expect(conflicts[0].message).toContain("Team Meeting");
  });

  it("reports same-calendar overlap as an overlap", () => {
    const conflicts = detectConflicts({
      events: [ev("2026-09-24T10:00", "2026-09-24T11:00"), ev("2026-09-24T10:30", "2026-09-24T11:30")],
      rules: bareRules(),
      timezone: LONDON,
      range,
    });
    expect(conflicts.map((c) => c.type)).toEqual(["overlap"]);
  });

  it("does not report the same meeting on two calendars", () => {
    const conflicts = detectConflicts({
      events: [
        ev("2026-09-24T10:00", "2026-09-24T11:00", { calendarId: "outlook", iCalUid: "same" }),
        ev("2026-09-24T10:00", "2026-09-24T11:00", { calendarId: "google", iCalUid: "same" }),
      ],
      rules: bareRules(),
      timezone: LONDON,
      range,
    });
    expect(conflicts).toHaveLength(0);
  });

  it("reports insufficient buffers and out-of-hours meetings, but not personal plans", () => {
    const conflicts = detectConflicts({
      events: [
        ev("2026-09-24T10:00", "2026-09-24T11:00"),
        ev("2026-09-24T11:00", "2026-09-24T11:30"),
        ev("2026-09-24T18:00", "2026-09-24T19:00", { title: "Late call" }),
        ev("2026-09-24T19:30", "2026-09-24T21:00", { title: "Dinner", isMeeting: false }),
      ],
      rules: rules({ bufferAfterMin: 10 }),
      timezone: LONDON,
      range,
    });
    expect(conflicts.map((c) => c.type).sort()).toEqual(["insufficient_buffer", "outside_working_hours"]);
  });

  it("ignores declined invitations", () => {
    const conflicts = detectConflicts({
      events: [ev("2026-09-24T10:00", "2026-09-24T11:00"), ev("2026-09-24T10:00", "2026-09-24T11:00", { selfResponse: "declined" })],
      rules: bareRules(),
      timezone: LONDON,
      range,
    });
    expect(conflicts).toHaveLength(0);
  });
});

describe("insights", () => {
  it("describes a week without judging it", () => {
    const week = { start: t("2026-09-21T00:00"), end: t("2026-09-28T00:00") };
    const insights = computeInsights({
      events: [
        ev("2026-09-24T09:00", "2026-09-24T10:00"),
        ev("2026-09-24T10:00", "2026-09-24T11:00"),
        ev("2026-09-24T11:00", "2026-09-24T12:00"),
        ev("2026-09-24T12:00", "2026-09-24T12:30"),
        ev("2026-09-22T14:00", "2026-09-22T15:00"),
        ev("2026-09-23T09:00", "2026-09-23T10:00", { kind: "focus", isMeeting: false }),
      ],
      rules: rules(),
      timezone: LONDON,
      range: week,
    });
    expect(insights.meetingCount).toBe(5);
    expect(insights.meetingMinutes).toBe(270);
    expect(insights.backToBack).toHaveLength(1);
    expect(insights.backToBack[0]).toMatchObject({ date: "2026-09-24", count: 4 });
    expect(insights.busiestDay?.date).toBe("2026-09-24");
    expect(insights.observations.join(" ")).toContain("4 back-to-back meetings on Thursday");
    // Descriptive only: no value judgements.
    expect(insights.observations.join(" ")).not.toMatch(/too many|should|productive|bad|good/i);
  });
});
