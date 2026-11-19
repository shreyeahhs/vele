import { z } from "zod";
import { route } from "@/lib/api";
import { db } from "@/server/db";
import { findContacts } from "@/server/services/contacts";
import { searchEvents } from "@/server/services/events";

/** Global search: events (titles, places, notes, attendees), people and bookings. Database queries only. */
export const GET = route({ query: z.object({ q: z.string().trim().min(1).max(100), when: z.enum(["past", "upcoming", "any"]).optional() }) }, async ({ user, query }) => {
  const [events, people, bookings] = await Promise.all([
    searchEvents(user.id, query.q, { when: query.when ?? "any", limit: 20 }),
    findContacts(user.id, query.q, 6),
    db.booking.findMany({
      where: {
        userId: user.id,
        OR: [
          { inviteeName: { contains: query.q, mode: "insensitive" } },
          { inviteeEmail: { contains: query.q.toLowerCase() } },
          { title: { contains: query.q, mode: "insensitive" } },
        ],
      },
      orderBy: { startTime: "desc" },
      take: 6,
      select: { id: true, title: true, inviteeName: true, inviteeEmail: true, startTime: true, status: true },
    }),
  ]);
  return {
    events,
    people,
    bookings: bookings.map((b) => ({ ...b, startTime: b.startTime.toISOString() })),
  };
});
