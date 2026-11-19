import { DateTime } from "luxon";
import { brand } from "@/config/brand";
import { MEETING_PROVIDER_LABEL, classifyMeetingUrl } from "@/lib/meeting-links";

/**
 * Transactional email templates. Table-based HTML for mail-client
 * compatibility, in Vele's ink-on-paper style. Every template returns a
 * plain-text twin. Times always carry a zone label; when the recipient's zone
 * differs from the organiser's, both are shown.
 */
// The booking-sheet palette (DESIGN.md), fixed to its light values: mail clients ignore our dark theme.
const INK = "#1c2433";
const INK_SOFT = "#33405a";
const GRAPHITE = "#5b626b";
const RULE = "#d9e2ec";
const PAPER = "#fbfcfd";
const BAND = "#eef3f8";
const DESK = "#f3f6f9";
const FONT = "'Libre Franklin',-apple-system,Segoe UI,Helvetica,Arial,sans-serif";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatWhen(start: Date, end: Date, zone: string): { date: string; time: string; zone: string } {
  const s = DateTime.fromJSDate(start, { zone });
  const e = DateTime.fromJSDate(end, { zone });
  return {
    date: s.toFormat("cccc d LLLL yyyy"),
    time: `${s.toFormat("HH:mm")}–${e.toFormat("HH:mm")}`,
    zone: s.offsetNameShort ?? zone,
  };
}

function row(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:12px 0;border-top:1px solid ${RULE};width:112px;vertical-align:top;font:800 13px/20px ${FONT};color:${INK_SOFT};">${esc(label)}</td>
    <td style="padding:12px 0;border-top:1px solid ${RULE};vertical-align:top;font:400 15px/22px ${FONT};color:${INK};">${valueHtml}</td>
  </tr>`;
}

function button(label: string, href: string, primary = true): string {
  return `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:2px;text-decoration:none;font:700 14px/20px ${FONT};${
    primary ? `background:${INK};color:${PAPER};` : `background:${PAPER};color:${INK_SOFT};border:1.5px solid ${INK_SOFT};padding:9.5px 16.5px;`
  }">${esc(label)}</a>`;
}

function layout(opts: { preheader: string; eyebrow?: string; heading: string; intro?: string; rows?: string; actions?: string; footer?: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${DESK};">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${DESK};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${PAPER};border:1px solid ${RULE};border-radius:3px;">
    <tr><td style="padding:6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BAND};border-radius:2px;">
        <tr><td style="padding:18px 26px 16px 26px;">
          <span style="display:inline-block;padding:4px 8px;border-radius:2px;background:${INK};color:${PAPER};font:800 11px/1 ${FONT};letter-spacing:.3em;text-transform:uppercase;">${esc(brand.name)}</span>
          ${opts.eyebrow ? `<div style="margin-top:14px;font:700 13px/18px ${FONT};color:${INK_SOFT};">${esc(opts.eyebrow)}</div>` : ""}
          <h1 style="margin:${opts.eyebrow ? "2px" : "14px"} 0 0 0;font:800 26px/30px ${FONT};color:${INK};letter-spacing:-.02em;">${esc(opts.heading)}</h1>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:14px 32px 0 32px;">
      ${opts.intro ? `<p style="margin:0 0 18px 0;font:400 15px/23px ${FONT};color:${INK_SOFT};">${opts.intro}</p>` : ""}
    </td></tr>
    ${opts.rows ? `<tr><td style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.rows}</table></td></tr>` : ""}
    ${opts.actions ? `<tr><td style="padding:20px 32px 8px 32px;border-top:1px solid ${RULE};">${opts.actions}</td></tr>` : ""}
    <tr><td style="padding:16px 32px 28px 32px;font:400 12px/18px ${FONT};color:${GRAPHITE};">
      ${opts.footer ?? `Sent by ${esc(brand.name)}, a scheduling assistant.`}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function whenHtml(start: Date, end: Date, zone: string, otherZone?: string | null, otherLabel?: string): string {
  const w = formatWhen(start, end, zone);
  let html = `${esc(w.date)}<br><strong style="font-weight:600;">${esc(w.time)}</strong> <span style="color:${GRAPHITE};">${esc(w.zone)}</span>`;
  if (otherZone && otherZone !== zone) {
    const o = formatWhen(start, end, otherZone);
    html += `<br><span style="color:${GRAPHITE};font-size:13px;">${esc(o.time)} ${esc(o.zone)}${otherLabel ? ` for ${esc(otherLabel)}` : ""}${o.date !== w.date ? `, ${esc(o.date)}` : ""}</span>`;
  }
  return html;
}

function whenText(start: Date, end: Date, zone: string, otherZone?: string | null, otherLabel?: string): string {
  const w = formatWhen(start, end, zone);
  let t = `${w.date}, ${w.time} ${w.zone}`;
  if (otherZone && otherZone !== zone) {
    const o = formatWhen(start, end, otherZone);
    t += ` (${o.time} ${o.zone}${otherLabel ? ` for ${otherLabel}` : ""})`;
  }
  return t;
}

function whereHtml(location?: string | null, meetingUrl?: string | null): string | null {
  if (meetingUrl) {
    const label = MEETING_PROVIDER_LABEL[classifyMeetingUrl(meetingUrl)] || "Video call";
    return `${esc(label)}<br><a href="${esc(meetingUrl)}" style="color:${INK};">${esc(meetingUrl.length > 60 ? `${meetingUrl.slice(0, 57)}…` : meetingUrl)}</a>${location ? `<br>${esc(location)}` : ""}`;
  }
  return location ? esc(location) : null;
}

export function magicLinkEmail({ url }: { url: string }): RenderedEmail {
  return {
    subject: `Your ${brand.name} sign-in link`,
    html: layout({
      preheader: "Use this link to sign in. It expires in 15 minutes.",
      heading: "Sign in to your calendar",
      intro: "Use the button below to sign in. The link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.",
      actions: button(`Sign in to ${brand.name}`, url),
    }),
    text: `Sign in to ${brand.name}: ${url}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
  };
}

export interface BookingEmailInput {
  audience: "invitee" | "host";
  hostName: string;
  inviteeName: string;
  inviteeEmail: string;
  title: string;
  start: Date;
  end: Date;
  hostTimezone: string;
  inviteeTimezone: string;
  location?: string | null;
  meetingUrl?: string | null;
  message?: string | null;
  manageUrl?: string | null;
  addToGoogle?: string;
  addToOutlook?: string;
  reason?: string | null;
  previousStart?: Date | null;
  previousEnd?: Date | null;
}

export function bookingConfirmedEmail(b: BookingEmailInput): RenderedEmail {
  const forInvitee = b.audience === "invitee";
  const zone = forInvitee ? b.inviteeTimezone : b.hostTimezone;
  const other = forInvitee ? b.hostTimezone : b.inviteeTimezone;
  const otherLabel = forInvitee ? b.hostName : b.inviteeName;
  const where = whereHtml(b.location, b.meetingUrl);
  const rows = [
    row("What", `${esc(b.title)}`),
    row("With", forInvitee ? esc(b.hostName) : `${esc(b.inviteeName)} <span style="color:${GRAPHITE};">&lt;${esc(b.inviteeEmail)}&gt;</span>`),
    row("When", whenHtml(b.start, b.end, zone, other, otherLabel)),
    ...(where ? [row("Where", where)] : []),
    ...(b.message ? [row("Note", esc(b.message))] : []),
  ].join("");
  const actions = [
    ...(b.meetingUrl ? [button("Join meeting", b.meetingUrl)] : []),
    ...(b.addToGoogle ? [button("Add to Google Calendar", b.addToGoogle, !b.meetingUrl)] : []),
    ...(b.addToOutlook ? [button("Add to Outlook", b.addToOutlook, false)] : []),
    ...(forInvitee && b.manageUrl ? [button("Reschedule or cancel", b.manageUrl, false)] : []),
  ].join("");
  const heading = forInvitee ? `You're booked with ${b.hostName}` : `${b.inviteeName} booked ${b.title}`;
  return {
    subject: forInvitee ? `Confirmed: ${b.title} with ${b.hostName}` : `New booking: ${b.title} with ${b.inviteeName}`,
    html: layout({
      preheader: whenText(b.start, b.end, zone),
      eyebrow: "Meeting confirmed",
      heading,
      intro: forInvitee ? "The time is held and an invitation is attached for your calendar." : "It's on your calendar in Vele.",
      rows,
      actions,
    }),
    text: [
      heading,
      "",
      `What: ${b.title}`,
      `With: ${forInvitee ? b.hostName : `${b.inviteeName} <${b.inviteeEmail}>`}`,
      `When: ${whenText(b.start, b.end, zone, other, otherLabel)}`,
      ...(b.meetingUrl ? [`Join: ${b.meetingUrl}`] : []),
      ...(b.location ? [`Where: ${b.location}`] : []),
      ...(b.message ? [`Note: ${b.message}`] : []),
      ...(forInvitee && b.manageUrl ? ["", `Reschedule or cancel: ${b.manageUrl}`] : []),
    ].join("\n"),
  };
}

export function bookingCancelledEmail(b: BookingEmailInput & { cancelledBy: "host" | "invitee" }): RenderedEmail {
  const forInvitee = b.audience === "invitee";
  const zone = forInvitee ? b.inviteeTimezone : b.hostTimezone;
  const who = b.cancelledBy === "host" ? b.hostName : b.inviteeName;
  const heading = `${b.title} was cancelled`;
  return {
    subject: `Cancelled: ${b.title} with ${forInvitee ? b.hostName : b.inviteeName}`,
    html: layout({
      preheader: `${who} cancelled ${whenText(b.start, b.end, zone)}`,
      eyebrow: "Meeting cancelled",
      heading,
      intro: `${esc(who)} cancelled this meeting.`,
      rows: [
        row("When", `<span style="text-decoration:line-through;color:${GRAPHITE};">${whenHtml(b.start, b.end, zone)}</span>`),
        ...(b.reason ? [row("Reason", esc(b.reason))] : []),
      ].join(""),
    }),
    text: `${heading}\n\n${who} cancelled this meeting.\nWas: ${whenText(b.start, b.end, zone)}${b.reason ? `\nReason: ${b.reason}` : ""}`,
  };
}

export function bookingRescheduledEmail(b: BookingEmailInput): RenderedEmail {
  const forInvitee = b.audience === "invitee";
  const zone = forInvitee ? b.inviteeTimezone : b.hostTimezone;
  const heading = `${b.title} has moved`;
  const rows = [
    row("New time", whenHtml(b.start, b.end, zone, forInvitee ? b.hostTimezone : b.inviteeTimezone, forInvitee ? b.hostName : b.inviteeName)),
    ...(b.previousStart && b.previousEnd
      ? [row("Was", `<span style="text-decoration:line-through;color:${GRAPHITE};">${whenHtml(b.previousStart, b.previousEnd, zone)}</span>`)]
      : []),
    ...(whereHtml(b.location, b.meetingUrl) ? [row("Where", whereHtml(b.location, b.meetingUrl)!)] : []),
  ].join("");
  return {
    subject: `Updated: ${b.title} with ${forInvitee ? b.hostName : b.inviteeName}`,
    html: layout({
      preheader: `New time: ${whenText(b.start, b.end, zone)}`,
      eyebrow: "Meeting rescheduled",
      heading,
      rows,
      actions: [...(b.meetingUrl ? [button("Join meeting", b.meetingUrl)] : []), ...(forInvitee && b.manageUrl ? [button("Reschedule or cancel", b.manageUrl, false)] : [])].join(
        "",
      ),
    }),
    text: `${heading}\n\nNew time: ${whenText(b.start, b.end, zone)}${b.previousStart && b.previousEnd ? `\nWas: ${whenText(b.previousStart, b.previousEnd, zone)}` : ""}${b.meetingUrl ? `\nJoin: ${b.meetingUrl}` : ""}${forInvitee && b.manageUrl ? `\n\nReschedule or cancel: ${b.manageUrl}` : ""}`,
  };
}

export interface InvitationInput {
  kind: "invite" | "update" | "cancel";
  organizerName: string;
  organizerEmail: string;
  title: string;
  start: Date;
  end: Date;
  timezone: string;
  location?: string | null;
  meetingUrl?: string | null;
  description?: string | null;
}

/** Invitations for meetings the user creates in Vele (by hand or through the assistant). */
export function invitationEmail(i: InvitationInput): RenderedEmail {
  const verb = i.kind === "invite" ? "Invitation" : i.kind === "update" ? "Updated invitation" : "Cancelled";
  const where = whereHtml(i.location, i.meetingUrl);
  const rows = [
    row(
      "When",
      i.kind === "cancel" ? `<span style="text-decoration:line-through;color:${GRAPHITE};">${whenHtml(i.start, i.end, i.timezone)}</span>` : whenHtml(i.start, i.end, i.timezone),
    ),
    row("From", `${esc(i.organizerName)} <span style="color:${GRAPHITE};">&lt;${esc(i.organizerEmail)}&gt;</span>`),
    ...(where && i.kind !== "cancel" ? [row("Where", where)] : []),
    ...(i.description && i.kind !== "cancel" ? [row("Details", esc(i.description).replace(/\n/g, "<br>"))] : []),
  ].join("");
  const heading = i.kind === "cancel" ? `${i.title} is cancelled` : i.title;
  return {
    subject: `${verb}: ${i.title} (${formatWhen(i.start, i.end, i.timezone).date})`,
    html: layout({
      preheader: `${verb} from ${i.organizerName}: ${whenText(i.start, i.end, i.timezone)}`,
      eyebrow: verb,
      heading,
      intro: i.kind === "cancel" ? `${esc(i.organizerName)} cancelled this meeting.` : `${esc(i.organizerName)} invited you. The attached invitation adds it to your calendar.`,
      rows,
      actions: i.meetingUrl && i.kind !== "cancel" ? button("Join meeting", i.meetingUrl) : undefined,
      footer: `Sent by ${esc(brand.name)} on behalf of ${esc(i.organizerName)}. Reply to this email to reach them.`,
    }),
    text: `${heading}\n\n${i.kind === "cancel" ? `${i.organizerName} cancelled this meeting.` : `${i.organizerName} invited you.`}\nWhen: ${whenText(i.start, i.end, i.timezone)}${i.meetingUrl && i.kind !== "cancel" ? `\nJoin: ${i.meetingUrl}` : ""}${i.location ? `\nWhere: ${i.location}` : ""}${i.description && i.kind !== "cancel" ? `\n\n${i.description}` : ""}`,
  };
}
