import "server-only";
import { DateTime } from "luxon";
import { db } from "../db";
import { toActionDTO } from "../ai/actions";
import { conflictsForUser, insightsForUser, scheduleOverview } from "./availability";
import { listBookings } from "./bookings";

/**
 * Everything the Today screen needs in one request: the day's timeline, what's
 * next, how much free time is left, this week's shape, problems ahead and
 * anything waiting for the user's OK.
 */
export async function getOverview(userId: string, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, name: true } });
  const zone = user.timezone;
  const local = DateTime.fromJSDate(now, { zone });
  const dayStart = local.startOf("day");
  const weekStart = dayStart.minus({ days: dayStart.weekday - 1 });

  const [today, week, conflicts, pending, bookings, upcoming] = await Promise.all([
    scheduleOverview(userId, { start: dayStart.toJSDate(), end: dayStart.plus({ days: 1 }).toJSDate() }, now),
    insightsForUser(userId, { start: weekStart.toJSDate(), end: weekStart.plus({ days: 7 }).toJSDate() }),
    conflictsForUser(userId, { start: now, end: dayStart.plus({ days: 8 }).toJSDate() }),
    db.pendingAction.findMany({ where: { userId, status: "PENDING", expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, take: 5 }),
    listBookings(userId, "upcoming", 3),
    scheduleOverview(userId, { start: now, end: dayStart.plus({ days: 7 }).toJSDate() }, now),
  ]);

  const day = today.days[0];
  const timed = today.events.filter((e) => !e.isAllDay);
  const next = upcoming.events.find((e) => !e.isAllDay && Date.parse(e.end) > now.getTime() && e.kind === "EVENT") ?? null;
  const freeLeft = (day?.openTime ?? []).reduce((sum, w) => {
    const start = Math.max(w.start, now.getTime());
    return sum + Math.max(0, Math.round((w.end - start) / 60_000));
  }, 0);

  return {
    timezone: zone,
    firstName: user.name?.split(" ")[0] ?? null,
    now: now.toISOString(),
    today: {
      date: dayStart.toISODate(),
      isWorkingDay: day?.isWorkingDay ?? false,
      events: today.events,
      meetingCount: timed.filter((e) => e.kind === "EVENT").length,
      openTime: (day?.openTime ?? []).map((w) => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString(), minutes: w.minutes })),
      freeMinutesLeft: freeLeft,
      freeMinutesTotal: day?.freeMinutes ?? 0,
    },
    next,
    week: {
      start: weekStart.toISODate(),
      meetingCount: week.meetingCount,
      meetingMinutes: week.meetingMinutes,
      focusMinutes: week.focusMinutes,
      freeMinutes: week.freeMinutes,
      observations: week.observations,
      days: week.days,
    },
    conflicts: conflicts.conflicts.filter((c) => c.severity !== "low").slice(0, 5),
    pending: pending.map(toActionDTO),
    bookings,
  };
}
