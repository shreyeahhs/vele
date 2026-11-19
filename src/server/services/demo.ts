import "server-only";
import { DateTime } from "luxon";
import { auth } from "../auth";
import { db } from "../db";
import { createEvent } from "./events";

/**
 * Development only: a demo account filled with a plausible (clearly sample)
 * week, so the app can be explored before anything real is added.
 */
export const DEMO_EMAIL = "demo@vele.local";
export const DEMO_PASSWORD = "vele-demo-password";

export async function ensureDemoUser(): Promise<string> {
  let user = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    await auth.api.signUpEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo User", timezone: "Europe/London" } });
    user = await db.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    await db.user.update({ where: { id: user.id }, data: { onboardedAt: new Date(), emailVerified: true } });
  }
  const count = await db.calendarEvent.count({ where: { userId: user.id } });
  if (count === 0) await seedSampleWeek(user.id);
  return user.id;
}

export async function seedSampleWeek(userId: string) {
  const zone = "Europe/London";
  const cals = await db.calendar.findMany({ where: { userId } });
  const work = cals.find((c) => c.name === "Work")!;
  const personal = cals.find((c) => c.name === "Personal")!;
  const monday = DateTime.now().setZone(zone).startOf("week");
  const at = (dayOffset: number, time: string) => {
    const [h, m] = time.split(":").map(Number);
    return monday.plus({ days: dayOffset }).set({ hour: h, minute: m }).toJSDate();
  };
  type Sample = { d: number; s: string; e: string; title: string; cal?: "work" | "personal"; location?: string; link?: string; recurrence?: string[]; kind?: "EVENT" | "FOCUS" };
  const samples: Sample[] = [
    { d: 0, s: "09:30", e: "10:00", title: "Team stand-up", recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"], link: "https://teams.microsoft.com/l/meetup-join/sample-standup" },
    { d: 0, s: "11:00", e: "12:00", title: "Research group meeting", location: "Main Building, Room 4.22" },
    { d: 0, s: "14:00", e: "14:30", title: "Project call: data governance", link: "https://meet.google.com/abc-defg-hij" },
    { d: 1, s: "10:00", e: "12:00", title: "Focus: grant report", kind: "FOCUS" },
    { d: 1, s: "13:30", e: "14:30", title: "Weekly team meeting", recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU"], link: "https://teams.microsoft.com/l/meetup-join/sample-weekly" },
    { d: 1, s: "15:00", e: "15:45", title: "Seminar planning", location: "Library, Seminar Room 2" },
    { d: 2, s: "11:00", e: "11:30", title: "1:1 with manager" },
    { d: 2, s: "14:00", e: "15:00", title: "Industry partner intro", link: "https://zoom.us/j/1234567890" },
    { d: 2, s: "18:30", e: "20:00", title: "Climbing", cal: "personal", location: "Climbing gym" },
    { d: 3, s: "09:00", e: "09:30", title: "Budget check-in" },
    { d: 3, s: "09:30", e: "10:30", title: "Workshop prep" },
    { d: 3, s: "10:30", e: "11:30", title: "PhD student drop-in" },
    { d: 3, s: "16:00", e: "17:00", title: "Department all-hands", link: "https://teams.microsoft.com/l/meetup-join/sample-allhands" },
    { d: 4, s: "12:30", e: "13:30", title: "Lunch with Priya", cal: "personal", location: "Corner Café" },
    { d: 4, s: "14:00", e: "15:00", title: "Events committee" },
    { d: 5, s: "13:00", e: "15:00", title: "Lunch with Mom", cal: "personal" },
  ];
  for (const s of samples) {
    await createEvent(
      userId,
      {
        title: s.title,
        calendarId: s.cal === "personal" ? personal.id : work.id,
        start: at(s.d, s.s),
        end: at(s.d, s.e),
        timezone: zone,
        location: s.location ?? null,
        meetingUrl: s.link ?? null,
        recurrence: s.recurrence ?? null,
        kind: s.kind ?? "EVENT",
        description: "Sample data for exploring Vele.",
        source: "MANUAL",
      },
      "system",
    );
  }
}
