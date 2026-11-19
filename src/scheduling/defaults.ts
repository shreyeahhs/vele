import type { IsoWeekday, SchedulingRules } from "./types";

const weekdays: IsoWeekday[] = [1, 2, 3, 4, 5];

/** Defaults for a new account: Mon–Thu 09:00–17:00, Fri 09:00–16:00, lunch 12:30–13:30. */
export const DEFAULT_RULES: SchedulingRules = {
  workingHours: weekdays.map((day) => ({ day, start: "09:00", end: day === 5 ? "16:00" : "17:00" })),
  blocked: [],
  focus: [],
  lunch: { start: "12:30", end: "13:30" },
  bufferBeforeMin: 5,
  bufferAfterMin: 10,
  minimumNoticeMin: 120,
  maxAdvanceDays: 60,
  maxMeetingsPerDay: null,
  maxConsecutiveMeetings: null,
  preferredStart: null,
  preferredEnd: null,
  noMeetingsBefore: null,
  noMeetingsAfter: null,
  preferredDays: [],
  slotIntervalMin: 15,
  treatTentativeAsBusy: true,
};
