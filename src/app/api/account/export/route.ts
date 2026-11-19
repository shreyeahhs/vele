import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";

/** Everything Vele stores about the signed-in user, as JSON. */
export const GET = route({}, async ({ user }) => {
  const [profile, calendars, events, prefs, rules, memory, bookingProfile, meetingTypes, bookings, contacts, conversations] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, name: true, email: true, timezone: true, createdAt: true } }),
    db.calendar.findMany({ where: { userId: user.id } }),
    db.calendarEvent.findMany({ where: { userId: user.id }, include: { attendees: { select: { name: true, email: true } } } }),
    db.schedulingPreferences.findUnique({ where: { userId: user.id } }),
    db.availabilityRule.findMany({ where: { userId: user.id } }),
    db.userPreference.findMany({ where: { userId: user.id } }),
    db.bookingProfile.findUnique({ where: { userId: user.id } }),
    db.meetingType.findMany({ where: { userId: user.id } }),
    db.booking.findMany({ where: { userId: user.id }, omit: { manageTokenHash: true } }),
    db.contact.findMany({ where: { userId: user.id } }),
    db.conversation.findMany({ where: { userId: user.id }, include: { messages: { select: { role: true, text: true, createdAt: true } } } }),
  ]);
  await audit({ userId: user.id, actorType: "user", action: "account.export" });
  return new NextResponse(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile,
        calendars,
        events,
        preferences: prefs,
        availabilityRules: rules,
        memory,
        bookingProfile,
        meetingTypes,
        bookings,
        contacts,
        conversations,
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="vele-export-${new Date().toISOString().slice(0, 10)}.json"` } },
  );
});
