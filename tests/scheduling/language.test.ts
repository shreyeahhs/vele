import { describe, expect, it } from "vitest";
import { parseDuration, resolveTimeExpression } from "@/scheduling";
import { LONDON, t } from "./fixtures";

// Friday 18 September 2026, 10:30 in London.
const NOW = t("2026-09-18T10:30");
const ctx = { now: NOW, timezone: LONDON, workingHours: { start: "09:00", end: "17:00" }, lunch: { start: "12:30", end: "13:30" } };
const r = (text: string, now = NOW) => resolveTimeExpression(text, { ...ctx, now });

describe("days", () => {
  it.each([
    ["what do I have today", ["2026-09-18"]],
    ["what do I have tomorrow", ["2026-09-19"]],
    ["tmrw", ["2026-09-19"]],
    ["the day after tomorrow", ["2026-09-20"]],
    ["on Tuesday", ["2026-09-22"]],
    ["this weekend", ["2026-09-19", "2026-09-20"]],
    ["next week", ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]],
    ["sometime next week", ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]],
    ["in 3 days", ["2026-09-21"]],
    ["on 2 October", ["2026-10-02"]],
    ["25/09", ["2026-09-25"]],
  ])("%s", (text, dates) => {
    expect(r(text).dates).toEqual(dates);
  });

  it("'Friday' on a Friday means today", () => {
    expect(r("what's on friday").dates).toEqual(["2026-09-18"]);
  });

  it("'next Friday' is the Friday of next week and says so", () => {
    const res = r("next friday", t("2026-09-15T09:00")); // a Tuesday
    expect(res.dates).toEqual(["2026-09-25"]);
    expect(res.assumptions.join(" ")).toContain("this Friday");
  });

  it("'this weekend' on a Sunday is just today", () => {
    expect(r("this weekend", t("2026-09-20T09:00")).dates).toEqual(["2026-09-20"]);
  });

  it("'later this week' starts tomorrow", () => {
    expect(r("later this week").dates).toEqual(["2026-09-19", "2026-09-20"]);
  });
});

describe("times", () => {
  it("resolves the lunch-with-mom example: 1-3 this saturday", () => {
    const res = r("vele set a meeting from 1-3 this saturday for lunch with mom");
    expect(res.dates).toEqual(["2026-09-19"]);
    expect(res.timeWindow).toEqual({ start: "13:00", end: "15:00" });
    expect(res.startLocal).toBe("2026-09-19T13:00");
    expect(res.endLocal).toBe("2026-09-19T15:00");
    expect(res.assumptions.join(" ")).toContain("13:00");
  });

  it.each([
    ["tomorrow afternoon", { start: "12:00", end: "17:00" }],
    ["tomorrow morning", { start: "08:00", end: "12:00" }],
    ["tomorrow after lunch", { start: "13:30", end: "17:00" }],
    ["between 2 and 5 tomorrow", { start: "14:00", end: "17:00" }],
    ["tomorrow 10am-12", { start: "10:00", end: "12:00" }],
    ["tomorrow 11-1", { start: "11:00", end: "13:00" }],
    ["1-3pm tomorrow", { start: "13:00", end: "15:00" }],
    ["sometime after 3pm on thursday", { start: "15:00", end: "17:00" }],
    ["before 3 tomorrow", { start: "09:00", end: "15:00" }],
    ["tomorrow evening", { start: "17:00", end: "21:00" }],
  ])("%s", (text, window) => {
    expect(r(text).timeWindow).toEqual(window);
  });

  it.each([
    ["am I free at 3 tomorrow", "15:00"],
    ["can I have lunch with someone at 1 tomorrow", "13:00"],
    ["tomorrow at 9", "09:00"],
    ["tomorrow at 15:30", "15:30"],
    ["half 3 tomorrow", "15:30"],
    ["quarter past 2 tomorrow", "14:15"],
    ["tomorrow at noon", "12:00"],
    ["book a meeting with Sarah at 3pm tomorrow", "15:00"],
  ])("%s", (text, time) => {
    expect(r(text).exactTime).toBe(time);
  });

  it("moves a passed time today to tomorrow and says so", () => {
    const res = r("am I free at 9");
    expect(res.dates).toEqual(["2026-09-19"]);
    expect(res.assumptions.join(" ")).toContain("has passed");
  });

  it("keeps a future time today", () => {
    expect(r("am I free at 4").dates).toEqual(["2026-09-18"]);
  });

  it("returns instants in UTC for the user's zone", () => {
    const res = r("tomorrow at 15:00");
    expect(new Date(res.start).toISOString()).toBe("2026-09-19T14:00:00.000Z");
  });

  it("works across the clock change", () => {
    const res = r("monday at 9", t("2026-10-24T12:00"));
    expect(res.dates).toEqual(["2026-10-26"]);
    expect(new Date(res.start).toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("marks unrecognised phrases as unmatched", () => {
    expect(r("hello there").matched).toBe(false);
  });
});

describe("durations", () => {
  it.each([
    ["a 30 minute meeting", 30],
    ["45 min", 45],
    ["half an hour", 30],
    ["an hour", 60],
    ["an hour and a half", 90],
    ["1.5 hours", 90],
    ["1h30", 90],
    ["2 hours", 120],
    ["90 minutes", 90],
    ["30-minute slot", 30],
  ])("%s → %i", (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it("returns null when there is no duration", () => {
    expect(parseDuration("tomorrow at 3")).toBeNull();
  });
});
