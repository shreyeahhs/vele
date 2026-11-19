"use client";

import { Link2, MapPin, Repeat, Users, Video } from "lucide-react";
import { useZone } from "@/components/app/zone";
import type { EventDTO } from "@/hooks/use-api";
import { MEETING_PROVIDER_LABEL, type MeetingProviderKind } from "@/lib/meeting-links";
import { hhmm } from "@/lib/time-client";
import { calendarInk, cn } from "@/lib/utils";

/**
 * A printed booking cell: the calendar's tape colour carries the fill and the
 * rule around it, and the words stay in full-strength ink.
 */
export function inkStyle(e: Pick<EventDTO, "calendarPosition">, color?: string | null): React.CSSProperties {
  const ink = calendarInk(e.calendarPosition, color);
  return {
    "--ev": ink,
    color: "var(--ink)",
    background: `color-mix(in oklab, ${ink} 16%, var(--paper))`,
    borderColor: `color-mix(in oklab, ${ink} 70%, var(--paper))`,
  } as React.CSSProperties;
}

export function MeetingBadge({ provider, className }: { provider: string; className?: string }) {
  const label = MEETING_PROVIDER_LABEL[provider as MeetingProviderKind] || "Video call";
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Video className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** One event on the time grid: title first, then the time, then what it is. */
export function EventBlock({
  event,
  height,
  inked,
  past,
  className,
  ...rest
}: {
  event: EventDTO;
  height: number;
  inked: boolean;
  past: boolean;
} & Omit<React.ComponentProps<"button">, "style" | "children">) {
  const zone = useZone();
  const compact = height < 34;
  const roomy = height >= 64;
  const focus = event.kind === "FOCUS";
  const blocked = event.kind === "BLOCKED" || event.kind === "OUT_OF_OFFICE";
  return (
    <button
      {...rest}
      data-event-id={event.id}
      className={cn(
        "group absolute inset-x-0 flex h-full w-full flex-col overflow-hidden rounded-none border-[1.5px] px-1.5 text-left hover:z-20 hover:outline-[1.5px] hover:outline-[var(--ev)] focus-visible:z-20",
        compact ? "justify-center py-0" : "py-1",
        focus && "focus-hatch border-dashed",
        blocked && "blocked-hatch",
        past && "opacity-60",
        inked && "animate-ink-in",
        className,
      )}
      style={inkStyle(event)}
      aria-label={`${event.title}, ${hhmm(event.start, zone)} to ${hhmm(event.end, zone)}, ${event.calendarName}`}
    >
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-small leading-tight font-bold">{event.title}</span>
        {compact && <span className="tnum shrink-0 text-micro font-semibold">{hhmm(event.start, zone)}</span>}
      </span>
      {!compact && (
        <span className="tnum truncate text-micro leading-tight font-semibold">
          {hhmm(event.start, zone)}–{hhmm(event.end, zone)}
        </span>
      )}
      {roomy && (
        <span className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-micro leading-tight font-semibold">
          {event.meetingUrl && <MeetingBadge provider={event.meetingProvider} className="max-w-full" />}
          {!event.meetingUrl && event.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{event.location}</span>
            </span>
          )}
          {event.attendees.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" aria-hidden />
              {event.attendees.length}
            </span>
          )}
          {event.isRecurring && <Repeat className="size-3" aria-label="Repeats" />}
          {event.source === "BOOKING" && <Link2 className="size-3" aria-label="Booked through your link" />}
        </span>
      )}
    </button>
  );
}
