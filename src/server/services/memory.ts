import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { errors } from "@/lib/errors";
import type { IsoWeekday } from "@/scheduling";
import { db } from "../db";
import { audit } from "./audit";
import { getPreferences, updatePreferences, type PreferencesInput } from "./preferences";

/**
 * Things the user tells Vele about how they like to work. Where a statement
 * maps to a scheduling rule, the rule itself is updated (so the engine obeys
 * it); the statement is also kept as a note the user can review in Settings.
 * Nothing here depends on the language model remembering anything.
 */
export type PreferenceRule =
  | { type: "no_meetings_before"; time: string }
  | { type: "no_meetings_after"; time: string }
  | { type: "gap_between_meetings"; minutes: number }
  | { type: "keep_time_free"; days: IsoWeekday[]; start: string; end: string }
  | { type: "focus_time"; days: IsoWeekday[]; start: string; end: string }
  | { type: "preferred_meeting_hours"; start: string; end: string }
  | { type: "preferred_days"; days: IsoWeekday[] }
  | { type: "max_meetings_per_day"; count: number }
  | { type: "working_hours"; days: IsoWeekday[]; start: string; end: string }
  | { type: "lunch"; start: string; end: string }
  | { type: "video_link"; url: string }
  | { type: "note" };

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const days = (d: IsoWeekday[]) => d.map((x) => DAY[x]).join(", ");

export interface MemoryEntry {
  key: string;
  statement: string | null;
  value: unknown;
  source: string;
  updatedAt: string;
}

export async function listMemory(userId: string): Promise<MemoryEntry[]> {
  const rows = await db.userPreference.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return rows.map((r) => ({ key: r.key, statement: r.statement, value: r.value, source: r.source, updatedAt: r.updatedAt.toISOString() }));
}

export async function forgetMemory(userId: string, key: string) {
  await db.userPreference.deleteMany({ where: { userId, key } });
  await audit({ userId, actorType: "user", action: "memory.forget", metadata: { key } });
}

/** Applies a rule, stores the statement, and returns a plain description of what changed. */
export async function rememberPreference(
  userId: string,
  statement: string,
  rule: PreferenceRule,
  actor: "user" | "assistant" = "assistant",
): Promise<{ applied: string; key: string }> {
  const prefs = await getPreferences(userId);
  let change: PreferencesInput = {};
  let applied: string;
  let key: string;

  switch (rule.type) {
    case "no_meetings_before":
      change = { noMeetingsBefore: rule.time };
      applied = `No meetings before ${rule.time} (booking pages enforce it; I'll flag earlier times for you)`;
      key = "no_meetings_before";
      break;
    case "no_meetings_after":
      change = { noMeetingsAfter: rule.time };
      applied = `No meetings after ${rule.time}`;
      key = "no_meetings_after";
      break;
    case "gap_between_meetings":
      change = { bufferAfterMin: rule.minutes, bufferBeforeMin: Math.min(prefs.bufferBeforeMin, rule.minutes) };
      applied = `At least ${rule.minutes} minutes between meetings`;
      key = "gap_between_meetings";
      break;
    case "keep_time_free": {
      const added = rule.days.map((day) => ({ day, start: rule.start, end: rule.end, label: "Kept free" }));
      change = { blocked: [...prefs.blocked.filter((b) => !added.some((a) => a.day === b.day && a.start === b.start)), ...added] };
      applied = `${days(rule.days)} ${rule.start}–${rule.end} kept free`;
      key = `keep_free:${rule.days.join("")}:${rule.start}`;
      break;
    }
    case "focus_time": {
      const added = rule.days.map((day) => ({ day, start: rule.start, end: rule.end, label: "Focus" }));
      change = { focus: [...prefs.focus.filter((b) => !added.some((a) => a.day === b.day && a.start === b.start)), ...added] };
      applied = `Focus time ${days(rule.days)} ${rule.start}–${rule.end}`;
      key = `focus:${rule.days.join("")}:${rule.start}`;
      break;
    }
    case "preferred_meeting_hours":
      change = { preferredStart: rule.start, preferredEnd: rule.end };
      applied = `Preferred meeting hours ${rule.start}–${rule.end}`;
      key = "preferred_meeting_hours";
      break;
    case "preferred_days":
      change = { preferredDays: rule.days };
      applied = `Preferred meeting days: ${days(rule.days)}`;
      key = "preferred_days";
      break;
    case "max_meetings_per_day":
      change = { maxMeetingsPerDay: rule.count };
      applied = `At most ${rule.count} meetings a day`;
      key = "max_meetings_per_day";
      break;
    case "working_hours": {
      const others = prefs.workingHours.filter((w) => !rule.days.includes(w.day));
      change = { workingHours: [...others, ...rule.days.map((day) => ({ day, start: rule.start, end: rule.end }))] };
      applied = `Working hours ${days(rule.days)} ${rule.start}–${rule.end}`;
      key = `working_hours:${rule.days.join("")}`;
      break;
    }
    case "lunch":
      change = { lunch: { start: rule.start, end: rule.end } };
      applied = `Lunch ${rule.start}–${rule.end}`;
      key = "lunch";
      break;
    case "video_link":
      if (!/^https:\/\//i.test(rule.url)) throw errors.validation("That doesn't look like a meeting link (it should start with https://).");
      change = { defaultVideoLink: rule.url };
      applied = "Your meeting link will be added to video meetings";
      key = "video_link";
      break;
    case "note":
      applied = "Noted";
      key = `note:${statement
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)}`;
      break;
  }

  if (Object.keys(change).length) await updatePreferences(userId, change, actor);
  await db.userPreference.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value: rule as unknown as Prisma.InputJsonValue, statement: statement.slice(0, 300), source: actor === "assistant" ? "ASSISTANT" : "SETTINGS" },
    update: { value: rule as unknown as Prisma.InputJsonValue, statement: statement.slice(0, 300) },
  });
  await audit({ userId, actorType: actor, action: "memory.remember", metadata: { type: rule.type } });
  return { applied, key };
}
