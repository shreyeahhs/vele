import "server-only";
import { z } from "zod";
import type { AvailabilityKind } from "@/generated/prisma/client";
import { errors } from "@/lib/errors";
import { DEFAULT_RULES, isValidTimeZone, type IsoWeekday, type SchedulingRules, type WeeklyWindow } from "@/scheduling";
import { db } from "../db";
import { audit } from "./audit";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use HH:mm");

export const windowSchema = z.object({ day: z.number().int().min(1).max(7), start: HHMM, end: HHMM });

export const preferencesSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone").optional(),
  workingHours: z.array(windowSchema).max(21).optional(),
  blocked: z
    .array(windowSchema.extend({ label: z.string().max(60).optional() }))
    .max(30)
    .optional(),
  focus: z
    .array(windowSchema.extend({ label: z.string().max(60).optional() }))
    .max(30)
    .optional(),
  bufferBeforeMin: z.number().int().min(0).max(120).optional(),
  bufferAfterMin: z.number().int().min(0).max(120).optional(),
  minimumNoticeMin: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 14)
    .optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  maxMeetingsPerDay: z.number().int().min(1).max(30).nullable().optional(),
  maxConsecutiveMeetings: z.number().int().min(1).max(12).nullable().optional(),
  defaultDurationMin: z.number().int().min(5).max(480).optional(),
  slotIntervalMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).optional(),
  lunch: z.object({ start: HHMM, end: HHMM }).nullable().optional(),
  preferredStart: HHMM.nullable().optional(),
  preferredEnd: HHMM.nullable().optional(),
  noMeetingsBefore: HHMM.nullable().optional(),
  noMeetingsAfter: HHMM.nullable().optional(),
  preferredDays: z.array(z.number().int().min(1).max(7)).optional(),
  treatTentativeAsBusy: z.boolean().optional(),
  defaultCalendarId: z.string().nullable().optional(),
  defaultVideoLink: z.url("Paste a full https:// link").max(500).nullable().optional(),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

export interface PreferencesDTO {
  timezone: string;
  workingHours: WeeklyWindow[];
  blocked: WeeklyWindow[];
  focus: WeeklyWindow[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minimumNoticeMin: number;
  maxAdvanceDays: number;
  maxMeetingsPerDay: number | null;
  maxConsecutiveMeetings: number | null;
  defaultDurationMin: number;
  slotIntervalMin: number;
  lunch: { start: string; end: string } | null;
  preferredStart: string | null;
  preferredEnd: string | null;
  noMeetingsBefore: string | null;
  noMeetingsAfter: string | null;
  preferredDays: number[];
  treatTentativeAsBusy: boolean;
  defaultCalendarId: string | null;
  defaultVideoLink: string | null;
}

export async function getPreferences(userId: string): Promise<PreferencesDTO> {
  const [user, prefs, rules] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
    db.schedulingPreferences.findUnique({ where: { userId } }),
    db.availabilityRule.findMany({ where: { userId }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
  ]);
  const byKind = (kind: AvailabilityKind): WeeklyWindow[] =>
    rules.filter((r) => r.kind === kind).map((r) => ({ day: r.dayOfWeek as IsoWeekday, start: r.startTime, end: r.endTime, label: r.label ?? undefined }));
  return {
    timezone: user.timezone,
    workingHours: rules.some((r) => r.kind === "WORKING_HOURS") ? byKind("WORKING_HOURS") : DEFAULT_RULES.workingHours,
    blocked: byKind("BLOCKED"),
    focus: byKind("FOCUS"),
    bufferBeforeMin: prefs?.bufferBeforeMin ?? DEFAULT_RULES.bufferBeforeMin,
    bufferAfterMin: prefs?.bufferAfterMin ?? DEFAULT_RULES.bufferAfterMin,
    minimumNoticeMin: prefs?.minimumNoticeMin ?? DEFAULT_RULES.minimumNoticeMin,
    maxAdvanceDays: prefs?.maxAdvanceDays ?? DEFAULT_RULES.maxAdvanceDays,
    maxMeetingsPerDay: prefs?.maxMeetingsPerDay ?? null,
    maxConsecutiveMeetings: prefs?.maxConsecutiveMeetings ?? null,
    defaultDurationMin: prefs?.defaultDurationMin ?? 30,
    slotIntervalMin: prefs?.slotIntervalMin ?? 15,
    lunch: prefs?.lunchStart && prefs?.lunchEnd ? { start: prefs.lunchStart, end: prefs.lunchEnd } : prefs ? null : DEFAULT_RULES.lunch,
    preferredStart: prefs?.preferredStart ?? null,
    preferredEnd: prefs?.preferredEnd ?? null,
    noMeetingsBefore: prefs?.noMeetingsBefore ?? null,
    noMeetingsAfter: prefs?.noMeetingsAfter ?? null,
    preferredDays: prefs?.preferredDays ?? [],
    treatTentativeAsBusy: prefs?.treatTentativeAsBusy ?? true,
    defaultCalendarId: prefs?.defaultCalendarId ?? null,
    defaultVideoLink: prefs?.defaultVideoLink ?? null,
  };
}

export function toRules(p: PreferencesDTO): SchedulingRules {
  return {
    workingHours: p.workingHours,
    blocked: p.blocked,
    focus: p.focus,
    lunch: p.lunch,
    bufferBeforeMin: p.bufferBeforeMin,
    bufferAfterMin: p.bufferAfterMin,
    minimumNoticeMin: p.minimumNoticeMin,
    maxAdvanceDays: p.maxAdvanceDays,
    maxMeetingsPerDay: p.maxMeetingsPerDay,
    maxConsecutiveMeetings: p.maxConsecutiveMeetings,
    preferredStart: p.preferredStart,
    preferredEnd: p.preferredEnd,
    noMeetingsBefore: p.noMeetingsBefore,
    noMeetingsAfter: p.noMeetingsAfter,
    preferredDays: p.preferredDays as IsoWeekday[],
    slotIntervalMin: p.slotIntervalMin,
    treatTentativeAsBusy: p.treatTentativeAsBusy,
  };
}

export async function getRules(userId: string): Promise<{ rules: SchedulingRules; timezone: string; prefs: PreferencesDTO }> {
  const prefs = await getPreferences(userId);
  return { rules: toRules(prefs), timezone: prefs.timezone, prefs };
}

function validateWindows(list: Array<{ start: string; end: string }> | undefined, what: string) {
  for (const w of list ?? []) {
    if (w.end !== "24:00" && w.end <= w.start) throw errors.validation(`${what}: each window must end after it starts (${w.start}–${w.end}).`);
  }
}

export async function updatePreferences(userId: string, input: PreferencesInput, actor: "user" | "assistant" = "user"): Promise<PreferencesDTO> {
  validateWindows(input.workingHours, "Working hours");
  validateWindows(input.blocked, "Blocked time");
  validateWindows(input.focus, "Focus time");
  if (input.lunch && input.lunch.end <= input.lunch.start) throw errors.validation("Lunch must end after it starts.");
  if (input.defaultCalendarId) {
    const cal = await db.calendar.findFirst({ where: { id: input.defaultCalendarId, userId } });
    if (!cal) throw errors.validation("That calendar can't be used for new events.");
  }

  await db.$transaction(async (tx) => {
    if (input.timezone) await tx.user.update({ where: { id: userId }, data: { timezone: input.timezone } });
    const { workingHours, blocked, focus, lunch, timezone, ...scalar } = input;
    void timezone;
    await tx.schedulingPreferences.upsert({
      where: { userId },
      create: {
        userId,
        ...scalar,
        preferredDays: scalar.preferredDays ?? [],
        ...(lunch !== undefined ? { lunchStart: lunch?.start ?? null, lunchEnd: lunch?.end ?? null } : {}),
      },
      update: {
        ...scalar,
        ...(lunch !== undefined ? { lunchStart: lunch?.start ?? null, lunchEnd: lunch?.end ?? null } : {}),
      },
    });
    const replace = async (kind: AvailabilityKind, list: Array<{ day: number; start: string; end: string; label?: string }> | undefined) => {
      if (!list) return;
      await tx.availabilityRule.deleteMany({ where: { userId, kind } });
      if (list.length) {
        await tx.availabilityRule.createMany({
          data: list.map((w) => ({ userId, kind, dayOfWeek: w.day, startTime: w.start, endTime: w.end, label: w.label ?? null })),
        });
      }
    };
    await replace("WORKING_HOURS", workingHours);
    await replace("BLOCKED", blocked);
    await replace("FOCUS", focus);
  });
  await audit({ userId, actorType: actor, action: "preferences.update", metadata: { fields: Object.keys(input).join(",") } });
  return getPreferences(userId);
}
