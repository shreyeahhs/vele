import "server-only";
import { DEFAULT_RULES } from "@/scheduling";
import { db } from "../db";

export const DEFAULT_MEETING_TYPES = [
  { slug: "quick-chat", title: "Quick Chat", durationMin: 15, description: "A short conversation.", position: 0 },
  { slug: "meeting", title: "Meeting", durationMin: 30, description: "A standard meeting.", position: 1 },
  { slug: "project-discussion", title: "Project Discussion", durationMin: 45, description: "Time to talk through a project.", position: 2 },
  { slug: "deep-discussion", title: "Deep Discussion", durationMin: 60, description: "An unhurried hour.", position: 3 },
] as const;

export function slugifyHandle(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return base.length >= 2 ? base : "me";
}

const RESERVED_HANDLES = new Set(["admin", "api", "app", "book", "booking", "settings", "sign-in", "sign-up", "vele", "support", "help", "about"]);

export async function availableHandle(seed: string): Promise<string> {
  const base = slugifyHandle(seed);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (RESERVED_HANDLES.has(candidate)) continue;
    const taken = await db.bookingProfile.findUnique({ where: { handle: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Creates everything a new account needs. Idempotent: safe to call again
 * (e.g. from onboarding) without duplicating anything.
 */
export async function provisionUser(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  let work = await db.calendar.findFirst({ where: { userId, isDefault: true } });
  if (!work) {
    work = await db.calendar.create({ data: { userId, name: "Work", isDefault: true, isPersonal: false, position: 0 } });
    await db.calendar.create({ data: { userId, name: "Personal", isPersonal: true, position: 1 } });
  }

  await db.schedulingPreferences.upsert({
    where: { userId },
    create: {
      userId,
      bufferBeforeMin: DEFAULT_RULES.bufferBeforeMin,
      bufferAfterMin: DEFAULT_RULES.bufferAfterMin,
      minimumNoticeMin: DEFAULT_RULES.minimumNoticeMin,
      maxAdvanceDays: DEFAULT_RULES.maxAdvanceDays,
      lunchStart: DEFAULT_RULES.lunch?.start ?? null,
      lunchEnd: DEFAULT_RULES.lunch?.end ?? null,
      slotIntervalMin: DEFAULT_RULES.slotIntervalMin,
      defaultCalendarId: work.id,
      preferredDays: [],
    },
    update: {},
  });

  const hasRules = await db.availabilityRule.count({ where: { userId, kind: "WORKING_HOURS" } });
  if (!hasRules) {
    await db.availabilityRule.createMany({
      data: DEFAULT_RULES.workingHours.map((w) => ({ userId, kind: "WORKING_HOURS" as const, dayOfWeek: w.day, startTime: w.start, endTime: w.end })),
    });
  }

  const profile = await db.bookingProfile.findUnique({ where: { userId } });
  if (!profile) {
    const seed = user.name?.split(" ")[0] || user.email.split("@")[0];
    await db.bookingProfile.create({
      data: { userId, handle: await availableHandle(seed), displayName: user.name || user.email.split("@")[0], headline: null },
    });
  }

  const typeCount = await db.meetingType.count({ where: { userId } });
  if (!typeCount) {
    await db.meetingType.createMany({
      data: DEFAULT_MEETING_TYPES.map((t) => ({ userId, ...t, destinationCalendarId: work.id, conflictCalendarIds: [] })),
    });
  }
}
