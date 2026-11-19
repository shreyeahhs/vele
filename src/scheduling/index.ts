/**
 * Vele's scheduling engine. Pure and deterministic: the assistant interprets
 * requests, this module calculates. Nothing here reads the clock, the
 * database or the network.
 */
export * from "./types";
export { findAvailableSlots, analyzeWindow, dayOverviews, type DayOverview, type AnalyzeWindowInput } from "./availability";
export { detectConflicts } from "./conflicts";
export { computeInsights, describeInsights, type ScheduleInsights, type DayLoad, type BackToBackChain } from "./insights";
export { expandRecurrence, describeRecurrence, type RecurringMaster, type Occurrence } from "./recurrence";
export { resolveTimeExpression, parseDuration, normalisePhrase, weekdayName, type ResolvedTime, type ResolveContext } from "./language";
export { classifyEvent, dedupeEvents, buildBusyModel, bufferPadding } from "./busy";
export { describeWorkingHours } from "./context";
export { mergeIntervals, subtractIntervals, intersectIntervals, overlaps } from "./intervals";
export * from "./time";
export { expandWeeklyWindows, workingWindowsOn, isWorkingDay } from "./windows";
export { DEFAULT_RULES } from "./defaults";
