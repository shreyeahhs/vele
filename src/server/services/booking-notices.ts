import "server-only";
import { hashToken, randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { db } from "../db";
import { sendEmail, type DeliveryStatus } from "../email";
import { buildIcs, googleCalendarLink, outlookCalendarLink } from "../email/ics";
import { bookingCancelledEmail, bookingConfirmedEmail, bookingRescheduledEmail, type BookingEmailInput } from "../email/templates";

/**
 * Emails about bookings. Kept apart from the events service so both the
 * calendar (host moves or cancels a booked meeting) and the public booking
 * flow (invitee books, moves or cancels) share one implementation.
 */
async function loadContext(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { user: { select: { id: true, name: true, email: true, timezone: true } }, event: { select: { iCalUid: true, sequence: true } } },
  });
  return booking;
}

type Ctx = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

function emailInput(b: Ctx, audience: "invitee" | "host", manageToken?: string | null): BookingEmailInput {
  return {
    audience,
    hostName: b.user.name || b.user.email,
    inviteeName: b.inviteeName,
    inviteeEmail: b.inviteeEmail,
    title: b.title,
    start: b.startTime,
    end: b.endTime,
    hostTimezone: b.user.timezone,
    inviteeTimezone: b.inviteeTimezone,
    location: b.locationValue && b.locationType !== "VIDEO_LINK" ? b.locationValue : null,
    meetingUrl: b.meetingUrl,
    message: b.message,
    manageUrl: manageToken ? appUrl(`/booking/${manageToken}`) : null,
    addToGoogle: googleCalendarLink({ title: b.title, start: b.startTime, end: b.endTime, details: b.meetingUrl, location: b.locationValue }),
    addToOutlook: outlookCalendarLink({ title: b.title, start: b.startTime, end: b.endTime, details: b.meetingUrl, location: b.locationValue }),
  };
}

function ics(b: Ctx, method: "REQUEST" | "CANCEL") {
  return buildIcs({
    method,
    uid: b.event?.iCalUid ?? `${b.id}@vele`,
    sequence: b.event?.sequence ?? 0,
    start: b.startTime,
    end: b.endTime,
    summary: `${b.title} with ${b.user.name || b.user.email}`,
    description: b.message,
    location: b.meetingUrl ?? b.locationValue,
    url: b.meetingUrl,
    organizer: { name: b.user.name || b.user.email, email: b.user.email },
    attendees: [{ name: b.inviteeName, email: b.inviteeEmail }],
  });
}

/** Sends both confirmation emails; returns the invitee's delivery status. */
export async function sendBookingConfirmations(bookingId: string, manageToken: string): Promise<{ invitee: DeliveryStatus; host: DeliveryStatus }> {
  const b = await loadContext(bookingId);
  if (!b) return { invitee: "failed", host: "failed" };
  const toInvitee = bookingConfirmedEmail(emailInput(b, "invitee", manageToken));
  const invitee = await sendEmail(
    {
      to: b.inviteeEmail,
      subject: toInvitee.subject,
      html: toInvitee.html,
      text: toInvitee.text,
      replyTo: b.user.email,
      attachments: [{ filename: "invite.ics", content: ics(b, "REQUEST"), contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
    },
    { userId: b.userId, bookingId, type: "booking_confirmed" },
  );
  const toHost = bookingConfirmedEmail(emailInput(b, "host"));
  const host = await sendEmail(
    { to: b.user.email, subject: toHost.subject, html: toHost.html, text: toHost.text, replyTo: b.inviteeEmail },
    { userId: b.userId, bookingId, type: "booking_confirmed" },
  );
  return { invitee: invitee.status, host: host.status };
}

export async function sendBookingCancellation(bookingId: string, cancelledBy: "host" | "invitee", reason: string | null): Promise<DeliveryStatus> {
  const b = await loadContext(bookingId);
  if (!b) return "failed";
  const invitee = bookingCancelledEmail({ ...emailInput(b, "invitee"), cancelledBy, reason });
  const res = await sendEmail(
    {
      to: b.inviteeEmail,
      subject: invitee.subject,
      html: invitee.html,
      text: invitee.text,
      replyTo: b.user.email,
      attachments: [{ filename: "cancel.ics", content: ics(b, "CANCEL"), contentType: "text/calendar; charset=utf-8; method=CANCEL" }],
    },
    { userId: b.userId, bookingId, type: "booking_cancelled" },
  );
  if (cancelledBy === "invitee") {
    const host = bookingCancelledEmail({ ...emailInput(b, "host"), cancelledBy, reason });
    await sendEmail({ to: b.user.email, subject: host.subject, html: host.html, text: host.text }, { userId: b.userId, bookingId, type: "booking_cancelled" });
  }
  return res.status;
}

export async function sendBookingRescheduled(bookingId: string, previous: { start: Date; end: Date }, notifyHost: boolean, manageToken?: string | null): Promise<DeliveryStatus> {
  const b = await loadContext(bookingId);
  if (!b) return "failed";
  const invitee = bookingRescheduledEmail({ ...emailInput(b, "invitee", manageToken), previousStart: previous.start, previousEnd: previous.end });
  const res = await sendEmail(
    {
      to: b.inviteeEmail,
      subject: invitee.subject,
      html: invitee.html,
      text: invitee.text,
      replyTo: b.user.email,
      attachments: [{ filename: "invite.ics", content: ics(b, "REQUEST"), contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
    },
    { userId: b.userId, bookingId, type: "booking_rescheduled" },
  );
  if (notifyHost) {
    const host = bookingRescheduledEmail({ ...emailInput(b, "host"), previousStart: previous.start, previousEnd: previous.end });
    await sendEmail({ to: b.user.email, subject: host.subject, html: host.html, text: host.text }, { userId: b.userId, bookingId, type: "booking_rescheduled" });
  }
  return res.status;
}

/** The host cancelled the calendar event of a booking: mark it cancelled and tell the invitee. */
export async function notifyBookingCancelledByHost(bookingId: string, reason: string | null): Promise<boolean> {
  const b = await db.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.status !== "CONFIRMED") return false;
  await db.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "host", cancelReason: reason } });
  const status = await sendBookingCancellation(bookingId, "host", reason);
  return status !== "failed";
}

/** The host moved the calendar event of a booking: keep the booking in step and tell the invitee. */
export async function notifyBookingRescheduledByHost(bookingId: string, previous: { start: Date; end: Date }, next: { start: Date; end: Date }): Promise<boolean> {
  const b = await db.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.status !== "CONFIRMED") return false;
  // Only a hash of the manage link is stored, so issue a fresh link with the update.
  const manageToken = randomToken();
  await db.booking.update({ where: { id: bookingId }, data: { startTime: next.start, endTime: next.end, manageTokenHash: hashToken(manageToken) } });
  const status = await sendBookingRescheduled(bookingId, previous, false, manageToken);
  return status !== "failed";
}
