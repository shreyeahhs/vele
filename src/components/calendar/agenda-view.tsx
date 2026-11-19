"use client";

import { Link2, MapPin, Repeat, Users } from "lucide-react";
import { DateTime } from "luxon";
import { useMemo } from "react";
import type { EventDTO } from "@/hooks/use-api";
import { durationText, hhmm } from "@/lib/time-client";
import { Tape } from "@/components/ui/primitives";
import { calendarCode, calendarInk, cn } from "@/lib/utils";
import { MeetingBadge } from "./event-bits";
import { EventPopover } from "./time-grid";

/** A fortnight as a printed list, one ruled row per day: the view for reading, not arranging. */
export function AgendaView({
  days,
  events,
  zone,
  now,
  openEventId,
  setOpenEventId,
  onCreate,
}: {
  days: DateTime[];
  events: EventDTO[];
  zone: string;
  now: DateTime;
  openEventId: string | null;
  setOpenEventId: (id: string | null) => void;
  onCreate: (d: DateTime) => void;
}) {
  const groups = useMemo(
    () =>
      days.map((d) => {
        const end = d.plus({ days: 1 });
        const list = events
          .filter((e) => DateTime.fromISO(e.start, { zone }) < end && DateTime.fromISO(e.end, { zone }) > d)
          .sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || a.start.localeCompare(b.start));
        return { day: d, list };
      }),
    [days, events, zone],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ol className="mx-auto max-w-3xl px-4 pt-2 pb-6 md:px-6">
        {groups.map(({ day, list }) => {
          const isToday = day.hasSame(now, "day");
          return (
            <li
              key={day.toISODate()}
              className={cn("grid grid-cols-[72px_1fr] gap-4 border-b border-rule py-3 sm:grid-cols-[104px_1fr]", day.weekday === 1 && "border-t-2 border-t-ink-2")}
            >
              <div className="pt-0.5">
                <p className={cn("text-small font-bold text-graphite", isToday && "text-red-ink-text")}>
                  {isToday ? "Today" : day.toFormat("cccc")}
                  {day.weekday === 1 && <span className="tnum font-semibold text-graphite-soft"> · Wk {day.weekNumber}</span>}
                </p>
                <p className={cn("tnum text-lead font-extrabold tracking-[-0.01em]", isToday && "text-red-ink-text")}>{day.toFormat("d LLL")}</p>
              </div>
              {list.length === 0 ? (
                <button onClick={() => onCreate(day)} className="self-center justify-self-start rounded-[2px] px-2 py-1 text-small text-graphite hover:bg-wash hover:text-ink">
                  Nothing booked. <span className="font-bold underline decoration-rule-strong underline-offset-2">Add something</span>
                </button>
              ) : (
                <ul className="grid gap-1">
                  {list.map((e) => {
                    const mins = (Date.parse(e.end) - Date.parse(e.start)) / 60_000;
                    const past = Date.parse(e.end) < now.toMillis();
                    return (
                      <li key={e.id}>
                        <EventPopover event={e} open={openEventId === e.id} setOpen={(o) => setOpenEventId(o ? e.id : null)}>
                          <button
                            data-event-id={e.id}
                            className={cn(
                              "grid w-full grid-cols-[88px_1fr] items-start gap-3 rounded-[2px] px-2 py-1.5 text-left hover:bg-wash sm:grid-cols-[112px_1fr]",
                              past && "opacity-60",
                            )}
                          >
                            <span className="tnum pt-px text-small font-bold text-ink-2">
                              {e.isAllDay ? "All day" : `${hhmm(e.start, zone)}–${hhmm(e.end, zone)}`}
                              {!e.isAllDay && <span className="block text-micro font-semibold text-graphite">{durationText(mins)}</span>}
                            </span>
                            <span className="flex min-w-0 gap-2.5">
                              <Tape color={calendarInk(e.calendarPosition)} className="mt-0.5 shrink-0">
                                {calendarCode(e.calendarName)}
                              </Tape>
                              <span className="min-w-0">
                                <span className="block truncate text-body font-bold">{e.title}</span>
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small text-graphite">
                                  <span>{e.calendarName}</span>
                                  {e.meetingUrl && <MeetingBadge provider={e.meetingProvider} />}
                                  {!e.meetingUrl && e.location && (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                      <MapPin className="size-3 shrink-0" aria-hidden />
                                      <span className="truncate">{e.location}</span>
                                    </span>
                                  )}
                                  {e.attendees.length > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                      <Users className="size-3" aria-hidden /> {e.attendees.length}
                                    </span>
                                  )}
                                  {e.isRecurring && (
                                    <span className="inline-flex items-center gap-1">
                                      <Repeat className="size-3" aria-hidden /> {e.recurrenceText ?? "repeats"}
                                    </span>
                                  )}
                                  {e.source === "BOOKING" && (
                                    <span className="inline-flex items-center gap-1">
                                      <Link2 className="size-3" aria-hidden /> booked
                                    </span>
                                  )}
                                </span>
                              </span>
                            </span>
                          </button>
                        </EventPopover>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
