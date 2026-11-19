import "server-only";
import { db } from "../db";
import { sendEmail, type DeliveryStatus } from "../email";
import { buildIcs } from "../email/ics";
import { invitationEmail } from "../email/templates";

export interface InvitationResult {
  email: string;
  status: DeliveryStatus;
}

/**
 * Emails attendees of a Vele event with an .ics attachment, so the meeting
 * lands in their own calendar (Outlook, Google, Apple) without Vele needing
 * access to it. Returns the real delivery status per recipient.
 */
export async function sendInvitations(args: {
  userId: string;
  kind: "invite" | "update" | "cancel";
  event: {
    iCalUid: string;
    sequence: number;
    title: string;
    description: string | null;
    location: string | null;
    meetingUrl: string | null;
    startTime: Date;
    endTime: Date;
    timezone: string;
    recurrence: string[];
    isRecurringMaster: boolean;
  };
  attendees: Array<{ email: string | null; name: string | null }>;
  /** For a single occurrence of a series. */
  recurrenceId?: Date | null;
  /** Shared UID of the series when the event is an exception. */
  seriesUid?: string | null;
}): Promise<InvitationResult[]> {
  const user = await db.user.findUniqueOrThrow({ where: { id: args.userId }, select: { name: true, email: true } });
  const recipients = args.attendees.filter((a): a is { email: string; name: string | null } => Boolean(a.email));
  const results: InvitationResult[] = [];
  for (const r of recipients) {
    const ics = buildIcs({
      method: args.kind === "cancel" ? "CANCEL" : "REQUEST",
      uid: args.seriesUid ?? args.event.iCalUid,
      sequence: args.event.sequence,
      start: args.event.startTime,
      end: args.event.endTime,
      summary: args.event.title,
      description: args.event.description,
      location: args.event.meetingUrl ?? args.event.location,
      url: args.event.meetingUrl,
      organizer: { name: user.name || user.email, email: user.email },
      attendees: recipients,
      recurrenceId: args.recurrenceId ?? null,
      rrule: args.event.isRecurringMaster ? args.event.recurrence : undefined,
      timezone: args.event.timezone,
    });
    const mail = invitationEmail({
      kind: args.kind,
      organizerName: user.name || user.email,
      organizerEmail: user.email,
      title: args.event.title,
      start: args.event.startTime,
      end: args.event.endTime,
      timezone: args.event.timezone,
      location: args.event.location,
      meetingUrl: args.event.meetingUrl,
      description: args.event.description,
    });
    const res = await sendEmail(
      {
        to: r.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: user.email,
        attachments: [
          {
            filename: args.kind === "cancel" ? "cancel.ics" : "invite.ics",
            content: ics,
            contentType: `text/calendar; charset=utf-8; method=${args.kind === "cancel" ? "CANCEL" : "REQUEST"}`,
          },
        ],
      },
      { userId: args.userId, type: args.kind === "cancel" ? "cancellation" : "invitation" },
    );
    results.push({ email: r.email, status: res.status });
  }
  return results;
}
