/**
 * Scheduling engine types.
 *
 * The engine is pure: no I/O, no clock reads, no randomness. Every instant is an
 * epoch-millisecond number in UTC; every wall-clock value ("HH:mm", dates) is
 * interpreted in an explicit IANA time zone passed by the caller. The same
 * input always produces the same output, which is what lets the assistant
 * rely on it and what the test suite pins down.
 */

/** Epoch milliseconds (UTC). */
export type Instant = number;

export interface Interval {
  start: Instant;
  end: Instant;
}

/** Local wall-clock time "HH:mm" (24h). */
export type LocalTime = string;

/** Local calendar date "YYYY-MM-DD". */
export type LocalDate = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WeeklyWindow {
  day: IsoWeekday;
  start: LocalTime;
  end: LocalTime;
  label?: string;
}

export type EngineEventStatus = "confirmed" | "tentative" | "cancelled";
export type EngineShowAs = "busy" | "tentative" | "free" | "oof" | "workingElsewhere";
export type EngineEventKind = "event" | "focus" | "blocked" | "oof";
export type SelfResponse = "accepted" | "declined" | "tentative" | "needsAction" | null;

/** A calendar event reduced to what scheduling needs. Titles are optional and only echoed back in conflicts. */
export interface EngineEvent {
  id: string;
  calendarId: string;
  start: Instant;
  end: Instant;
  isAllDay: boolean;
  status: EngineEventStatus;
  showAs: EngineShowAs;
  kind: EngineEventKind;
  selfResponse?: SelfResponse;
  iCalUid?: string | null;
  /** True when the event has attendees, a meeting link, or came from a booking. */
  isMeeting?: boolean;
  /** False when the event's calendar is excluded from availability. */
  countsForAvailability?: boolean;
  title?: string;
}

export interface SchedulingRules {
  workingHours: WeeklyWindow[];
  blocked: WeeklyWindow[];
  focus: WeeklyWindow[];
  lunch: { start: LocalTime; end: LocalTime } | null;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** Applies to booking pages; the owner can always schedule from "now". */
  minimumNoticeMin: number;
  /** Applies to booking pages. */
  maxAdvanceDays: number;
  maxMeetingsPerDay: number | null;
  maxConsecutiveMeetings: number | null;
  preferredStart: LocalTime | null;
  preferredEnd: LocalTime | null;
  noMeetingsBefore: LocalTime | null;
  noMeetingsAfter: LocalTime | null;
  /** Preferred ISO weekdays; empty = no preference. */
  preferredDays: IsoWeekday[];
  slotIntervalMin: number;
  treatTentativeAsBusy: boolean;
}

/**
 * - `owner`: the user asking about their own time. Soft rules (working hours,
 *   focus, lunch, preferences) flag a slot instead of hiding it.
 * - `booking`: an external visitor on a booking page. Every rule is hard.
 */
export type SchedulingMode = "owner" | "booking";

/**
 * - `meeting`: time with other people; working hours, lunch and focus matter.
 * - `personal`: the user's own plans ("lunch with mom on Saturday"); only real
 *   clashes and buffers matter.
 */
export type SlotPurpose = "meeting" | "personal";

export interface SlotSearchOptions {
  mode?: SchedulingMode;
  purpose?: SlotPurpose;
  /** Restrict each day to this local time-of-day window (e.g. "afternoon", "after 3"). */
  timeOfDay?: { start: LocalTime; end: LocalTime } | null;
  daysOfWeek?: IsoWeekday[] | null;
  /** Upper bound on returned slots (default 8). */
  maxResults?: number;
  /** Owner mode: include slots that break a soft rule, flagged, even when unflagged ones exist. */
  includeFlagged?: boolean;
  slotIntervalMin?: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  /** Hours considered for personal plans / out-of-hours suggestions (default 07:00–22:00). */
  wakingHours?: { start: LocalTime; end: LocalTime };
  /** Event ids to ignore (e.g. the meeting being moved). */
  ignoreEventIds?: string[];
  /**
   * Return every acceptable aligned start (a booking page grid) instead of a
   * spread of non-overlapping options (what the assistant presents).
   */
  exhaustive?: boolean;
}

export interface SlotSearchInput {
  range: Interval;
  durationMin: number;
  now: Instant;
  timezone: string;
  events: EngineEvent[];
  rules: SchedulingRules;
  options?: SlotSearchOptions;
}

export type ReasonEffect = "positive" | "negative" | "neutral";

export interface SlotReason {
  code: SlotReasonCode;
  label: string;
  effect: ReasonEffect;
}

export type SlotReasonCode =
  | "no_adjacent_meetings"
  | "follows_meeting"
  | "precedes_meeting"
  | "between_meetings"
  | "gap_after_previous"
  | "gap_before_next"
  | "leaves_short_gap"
  | "keeps_block_free"
  | "within_preferred_hours"
  | "outside_preferred_hours"
  | "preferred_day"
  | "outside_working_hours"
  | "non_working_day"
  | "during_lunch"
  | "during_focus_time"
  | "during_blocked_time"
  | "during_out_of_office"
  | "before_earliest_meeting_time"
  | "after_latest_meeting_time"
  | "day_meeting_cap_reached"
  | "creates_long_meeting_chain"
  | "busy_day"
  | "light_day"
  | "near_tentative_event";

export interface AvailableSlot {
  start: Instant;
  end: Instant;
  /** Only for ordering. Never presented as "best"; the reasons are what the user sees. */
  score: number;
  /** `flagged`: free on the calendar but breaks one of the user's soft rules. */
  status: "available" | "flagged";
  reasons: SlotReason[];
  /** Local date of the slot. */
  date: LocalDate;
}

export interface FreeWindow {
  start: Instant;
  end: Instant;
  date: LocalDate;
  minutes: number;
}

export interface ExclusionNote {
  code: "gap_too_short" | "outside_working_hours" | "lunch" | "focus" | "blocked" | "minimum_notice" | "day_cap" | "past";
  label: string;
  count: number;
}

export interface SlotSearchResult {
  /** Chronological. */
  slots: AvailableSlot[];
  /** Slot indexes ordered by score (least disruptive first by the stated criteria). */
  rankedIndexes: number[];
  /** Maximal free windows long enough for the duration, after buffers. */
  freeWindows: FreeWindow[];
  totalCandidates: number;
  excluded: ExclusionNote[];
  constraintsApplied: string[];
}

export type ConflictType = "overlap" | "double_booking" | "insufficient_buffer" | "outside_working_hours" | "during_blocked_time";

export interface Conflict {
  type: ConflictType;
  eventIds: string[];
  start: Instant;
  end: Instant;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface WindowAnalysis {
  /** True when the whole window is clear of busy time (buffers included). */
  available: boolean;
  /** True when the window is clear of events, ignoring buffers. */
  clearOfEvents: boolean;
  conflicts: Array<{ eventId: string; title?: string; start: Instant; end: Instant; tentative: boolean }>;
  bufferIssues: Array<{ eventId: string; title?: string; side: "before" | "after"; gapMin: number }>;
  flags: SlotReason[];
  /** Free sub-windows inside the requested window (buffers applied). */
  freeWithin: FreeWindow[];
}
