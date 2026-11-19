import { DateTime } from "luxon";
import { beforeEach, describe, expect, it } from "vitest";
import { hashToken, randomToken } from "@/lib/crypto";
import { db } from "@/server/db";
import {
  cancelBookingAsInvitee,
  createBooking,
  createPrivateLink,
  getManagedBooking,
  getPublicProfile,
  getPublicSlots,
  getRescheduleSlots,
  rescheduleBookingAsInvitee,
} from "@/server/services/bookings";
import { createEvent } from "@/server/services/events";
import { createUser, resetDb } from "./helpers";

const ZONE = "Europe/London";
const NOW = DateTime.fromISO("2026-09-18T10:30", { zone: ZONE }).toJSDate();
const at = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
const iso = (s: string) => at(s).toISOString();

async function host() {
  const user = await createUser("Alex Morgan");
  const profile = await db.bookingProfile.findUniqueOrThrow({ where: { userId: user.id } });
  // Keep tests deterministic: no minimum notice for the 30-minute type.
  await db.meetingType.updateMany({ where: { userId: user.id }, data: { minimumNoticeMin: 0 } });
  return { user, handle: profile.handle };
}

const visitor = { name: "John Smith", email: "john@example.com", timezone: "America/New_York", message: "Looking forward to it" };

beforeEach(resetDb);

describe("public booking pages", () => {
  it("lists only public meeting types and never exposes calendar content", async () => {
    const { user, handle } = await host();
    await createEvent(user.id, { title: "Confidential review with legal", start: at("2026-09-22T10:00"), end: at("2026-09-22T11:00"), source: "MANUAL" }, "user");
    const profile = await getPublicProfile(handle);
    expect(profile.meetingTypes.map((t) => t.durationMin)).toEqual([15, 30, 45, 60]);
    const slots = await getPublicSlots(handle, "meeting", { from: at("2026-09-22T00:00"), to: at("2026-09-23T00:00") }, NOW);
    const json = JSON.stringify(slots);
    expect(json).not.toContain("Confidential");
    expect(json).not.toContain("legal");
    // The busy hour (plus buffers) is simply absent.
    expect(slots.slots).not.toContain(iso("2026-09-22T10:00"));
    expect(slots.slots).not.toContain(iso("2026-09-22T10:30"));
    expect(slots.slots).toContain(iso("2026-09-22T09:00"));
    expect(slots.slots).not.toContain(iso("2026-09-22T12:30")); // lunch
  });

  it("books a slot, creates the event and emails both sides", async () => {
    const { user, handle } = await host();
    const res = await createBooking(handle, "meeting", { ...visitor, start: iso("2026-09-22T14:00") }, {}, NOW);
    expect(res.confirmationEmail).toBe("logged");
    const event = await db.calendarEvent.findFirstOrThrow({ where: { userId: user.id, bookingId: res.bookingId }, include: { attendees: true } });
    expect(event.title).toBe("Meeting with John Smith");
    expect(event.attendees[0].email).toBe("john@example.com");
    const notes = await db.notification.findMany({ where: { bookingId: res.bookingId } });
    expect(notes.map((n) => n.recipient).sort()).toEqual([user.email, "john@example.com"].sort());
    const contact = await db.contact.findUnique({ where: { userId_email: { userId: user.id, email: "john@example.com" } } });
    expect(contact?.name).toBe("John Smith");
  });

  it("re-validates on the server: an unaligned or busy time is rejected", async () => {
    const { user, handle } = await host();
    await expect(createBooking(handle, "meeting", { ...visitor, start: iso("2026-09-22T14:07") }, {}, NOW)).rejects.toMatchObject({ code: "slot_unavailable" });
    await createEvent(user.id, { title: "Busy", start: at("2026-09-22T15:00"), end: at("2026-09-22T16:00"), source: "MANUAL" }, "user");
    await expect(createBooking(handle, "meeting", { ...visitor, start: iso("2026-09-22T15:00") }, {}, NOW)).rejects.toMatchObject({ code: "slot_unavailable" });
    // Saturday is outside working hours.
    await expect(createBooking(handle, "meeting", { ...visitor, start: iso("2026-09-26T10:00") }, {}, NOW)).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("prevents double booking under concurrency", async () => {
    const { user, handle } = await host();
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => createBooking(handle, "meeting", { ...visitor, email: `p${i}@example.com`, start: iso("2026-09-23T11:00") }, {}, NOW)),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    for (const a of attempts.filter((x) => x.status === "rejected")) {
      expect((a as PromiseRejectedResult).reason).toMatchObject({ code: "slot_unavailable" });
    }
    expect(await db.booking.count({ where: { userId: user.id, status: "CONFIRMED" } })).toBe(1);
  });

  it("enforces non-overlap in the database itself", async () => {
    const { user } = await host();
    const base = { userId: user.id, title: "x", inviteeName: "x", inviteeEmail: "x@example.com", inviteeTimezone: ZONE };
    await db.booking.create({ data: { ...base, startTime: at("2026-09-24T10:00"), endTime: at("2026-09-24T11:00"), manageTokenHash: hashToken(randomToken()) } });
    await expect(
      db.booking.create({ data: { ...base, startTime: at("2026-09-24T10:30"), endTime: at("2026-09-24T11:30"), manageTokenHash: hashToken(randomToken()) } }),
    ).rejects.toThrow();
    // Cancelled bookings don't hold the slot.
    await db.booking.updateMany({ where: { userId: user.id }, data: { status: "CANCELLED" } });
    await db.booking.create({ data: { ...base, startTime: at("2026-09-24T10:30"), endTime: at("2026-09-24T11:30"), manageTokenHash: hashToken(randomToken()) } });
  });

  it("keeps private meeting types behind a valid invite", async () => {
    const { user, handle } = await host();
    const type = await db.meetingType.findFirstOrThrow({ where: { userId: user.id, slug: "deep-discussion" } });
    await db.meetingType.update({ where: { id: type.id }, data: { visibility: "PRIVATE", minimumNoticeMin: 0 } });
    await expect(getPublicSlots(handle, "deep-discussion", { from: at("2026-09-22T00:00"), to: at("2026-09-23T00:00") }, NOW)).rejects.toMatchObject({ code: "not_found" });
    const link = await createPrivateLink(user.id, { meetingTypeId: type.id, singleUse: true });
    const token = new URL(link.url).searchParams.get("invite")!;
    const slots = await getPublicSlots(handle, "deep-discussion", { from: at("2026-09-22T00:00"), to: at("2026-09-23T00:00"), inviteToken: token }, NOW);
    expect(slots.slots.length).toBeGreaterThan(0);
    await createBooking(handle, "deep-discussion", { ...visitor, start: slots.slots[0], invite: token }, {}, NOW);
    // Single use: the same link no longer works.
    await expect(getPublicSlots(handle, "deep-discussion", { from: at("2026-09-22T00:00"), to: at("2026-09-23T00:00"), inviteToken: token }, NOW)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(profileTypes(await getPublicProfile(handle))).not.toContain("deep-discussion");
  });

  it("lets the invitee reschedule and cancel with the manage link", async () => {
    const { handle } = await host();
    const res = await createBooking(handle, "meeting", { ...visitor, start: iso("2026-09-22T14:00") }, {}, NOW);
    const token = res.manageUrl.split("/booking/")[1];
    const managed = await getManagedBooking(token);
    expect(managed.inviteeName).toBe("John Smith");
    const moved = await rescheduleBookingAsInvitee(token, iso("2026-09-22T15:00"), {}, NOW);
    expect(moved.start).toBe(iso("2026-09-22T15:00"));
    const cancelled = await cancelBookingAsInvitee(token, "Something came up", {}, NOW);
    expect(cancelled.emailStatus).toBe("logged");
    const b = await db.booking.findFirstOrThrow({ where: { manageTokenHash: hashToken(token) } });
    expect(b.status).toBe("CANCELLED");
    expect(await db.calendarEvent.count({ where: { bookingId: b.id } })).toBe(0);
  });

  it("offers reschedule times around the booking itself, but not its current time", async () => {
    const { handle } = await host();
    const res = await createBooking(handle, "meeting", { ...visitor, start: iso("2026-09-22T14:00") }, {}, NOW);
    const token = res.manageUrl.split("/booking/")[1];
    const range = { from: at("2026-09-22T00:00"), to: at("2026-09-23T00:00") };
    // For everyone else, the booking (plus buffers) blocks its neighbours.
    const publicSlots = await getPublicSlots(handle, "meeting", range, NOW);
    expect(publicSlots.slots).not.toContain(iso("2026-09-22T13:45"));
    // The invitee moving it may pick them, but not the time it already has.
    const moveSlots = await getRescheduleSlots(token, range, NOW);
    expect(moveSlots.slots).toContain(iso("2026-09-22T13:45"));
    expect(moveSlots.slots).toContain(iso("2026-09-22T14:15"));
    expect(moveSlots.slots).not.toContain(iso("2026-09-22T14:00"));
    const moved = await rescheduleBookingAsInvitee(token, iso("2026-09-22T14:15"), {}, NOW);
    expect(moved.start).toBe(iso("2026-09-22T14:15"));
  });

  it("lets a private-link booking be rescheduled, and hides Reschedule when its type is gone", async () => {
    const { user, handle } = await host();
    const type = await db.meetingType.findFirstOrThrow({ where: { userId: user.id, slug: "deep-discussion" } });
    await db.meetingType.update({ where: { id: type.id }, data: { visibility: "PRIVATE", minimumNoticeMin: 0 } });
    const link = await createPrivateLink(user.id, { meetingTypeId: type.id, singleUse: true });
    const invite = new URL(link.url).searchParams.get("invite")!;
    const res = await createBooking(handle, "deep-discussion", { ...visitor, start: iso("2026-09-22T09:00"), invite }, {}, NOW);
    const token = res.manageUrl.split("/booking/")[1];
    const moveSlots = await getRescheduleSlots(token, { from: at("2026-09-22T00:00"), to: at("2026-09-24T00:00") }, NOW);
    expect(moveSlots.slots.length).toBeGreaterThan(0);
    expect((await getManagedBooking(token, NOW)).canReschedule).toBe(true);
    await db.meetingType.delete({ where: { id: type.id } });
    const managed = await getManagedBooking(token, NOW);
    expect(managed.canChange).toBe(true);
    expect(managed.canReschedule).toBe(false);
  });

  it("respects a per-day limit for a meeting type", async () => {
    const { user, handle } = await host();
    await db.meetingType.updateMany({ where: { userId: user.id, slug: "quick-chat" }, data: { maxPerDay: 1, minimumNoticeMin: 0 } });
    await createBooking(handle, "quick-chat", { ...visitor, start: iso("2026-09-22T09:00") }, {}, NOW);
    const slots = await getPublicSlots(handle, "quick-chat", { from: at("2026-09-22T00:00"), to: at("2026-09-24T00:00") }, NOW);
    expect(slots.slots.some((s) => s.startsWith("2026-09-22"))).toBe(false);
    expect(slots.slots.some((s) => s.startsWith("2026-09-23"))).toBe(true);
  });
});

function profileTypes(p: { meetingTypes: Array<{ slug: string }> }) {
  return p.meetingTypes.map((t) => t.slug);
}
