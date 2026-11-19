"use client";

import { ExternalLink, Link2, MapPin, MessageSquareText, PenLine, Repeat, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAssistantContext } from "@/components/app/assistant-context";
import { useUI } from "@/components/app/ui-context";
import { useZone } from "@/components/app/zone";
import { Button } from "@/components/ui/button";
import { Badge, Tape } from "@/components/ui/primitives";
import type { EventDTO } from "@/hooks/use-api";
import { MEETING_PROVIDER_LABEL, type MeetingProviderKind } from "@/lib/meeting-links";
import { dt, timeRange } from "@/lib/time-client";
import { calendarCode, calendarInk } from "@/lib/utils";

/** What you see when you open an event: everything about it, and what you can do next. */
export function EventDetails({ event, onClose }: { event: EventDTO; onClose: () => void }) {
  const zone = useZone();
  const ui = useUI();
  const assistant = useAssistantContext();
  const router = useRouter();
  const start = dt(event.start, zone);
  const joinLabel =
    event.meetingProvider === "TEAMS"
      ? "Join Teams meeting"
      : event.meetingProvider === "GOOGLE_MEET"
        ? "Join Google Meet"
        : event.meetingProvider === "ZOOM"
          ? "Join Zoom"
          : "Join meeting";
  return (
    <div className="grid gap-3">
      <div className="min-w-0">
        <h3 className="text-lead leading-snug font-extrabold tracking-[-0.01em]">{event.title}</h3>
        <p className="tnum text-small font-bold text-ink-2">
          {start.toFormat("cccc d LLLL")}
          {event.isAllDay ? " · all day" : ` · ${timeRange(event.start, event.end, zone)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1.5 text-small font-bold text-ink-2">
          <Tape color={calendarInk(event.calendarPosition)}>{calendarCode(event.calendarName)}</Tape>
          {event.calendarName}
        </span>
        {event.kind === "FOCUS" && <Badge tone="pencil">Focus time</Badge>}
        {(event.kind === "BLOCKED" || event.kind === "OUT_OF_OFFICE") && <Badge tone="pencil">Unavailable</Badge>}
        {event.source === "BOOKING" && (
          <Badge tone="green">
            <Link2 className="size-3" /> Booked through your link
          </Badge>
        )}
        {event.source === "ASSISTANT" && <Badge tone="neutral">Added by Vele</Badge>}
        {event.isRecurring && (
          <Badge>
            <Repeat className="size-3" /> {event.recurrenceText ?? "Repeats"}
          </Badge>
        )}
      </div>
      {event.meetingUrl && (
        <div className="flex items-center justify-between gap-3 rounded-[2px] border border-rule bg-paper-2 px-3 py-2">
          <span className="text-small font-bold text-ink-2">{MEETING_PROVIDER_LABEL[event.meetingProvider as MeetingProviderKind] || "Video call"}</span>
          <Button asChild size="sm" variant="primary">
            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer">
              {joinLabel} <ExternalLink />
            </a>
          </Button>
        </div>
      )}
      {event.location && (
        <p className="flex gap-2 text-small text-ink-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-graphite" /> {event.location}
        </p>
      )}
      {event.attendees.length > 0 && (
        <div className="flex gap-2 text-small text-ink-2">
          <Users className="mt-0.5 size-3.5 shrink-0 text-graphite" />
          <ul className="grid gap-0.5">
            {event.attendees.map((a, i) => (
              <li key={i} className="break-all">
                {a.name ? `${a.name} ` : ""}
                <span className="text-graphite">{a.email}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {event.description && <p className="max-h-32 max-w-[55ch] overflow-y-auto text-small whitespace-pre-wrap text-graphite">{event.description}</p>}
      <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
        <Button
          size="sm"
          onClick={() => {
            onClose();
            ui.openEventDialog({ id: event.id });
          }}
        >
          <PenLine /> Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onClose();
            const prompt = `Move “${event.title}” on ${start.toFormat("cccc d LLLL")} to `;
            if (window.matchMedia("(min-width: 1024px)").matches) assistant.focusComposer(prompt);
            else {
              assistant.focusComposer(prompt);
              router.push("/assistant");
            }
          }}
        >
          <MessageSquareText /> Ask Vele to move it
        </Button>
      </div>
    </div>
  );
}
