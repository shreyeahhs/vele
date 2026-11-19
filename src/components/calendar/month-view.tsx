"use client";

import { DateTime } from "luxon";
import { useMemo } from "react";
import type { EventDTO } from "@/hooks/use-api";
import { hhmm } from "@/lib/time-client";
import { calendarInk, cn } from "@/lib/utils";
import { EventPopover } from "./time-grid";

const MAX_CHIPS = 3;

/**
 * The month as a printed wall planner: a header band of weekdays, week numbers
 * on the Mondays, and each day listing what's on in the ink of its calendar.
 */
export function MonthView({
  days,
  anchor,
  events,
  zone,
  now,
  openEventId,
  setOpenEventId,
  onDay,
  onCreate,
}: {
  days: DateTime[];
  anchor: DateTime;
  events: EventDTO[];
  zone: string;
  now: DateTime;
  openEventId: string | null;
  setOpenEventId: (id: string | null) => void;
  onDay: (d: DateTime) => void;
  onCreate: (d: DateTime) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, EventDTO[]>();
    for (const d of days) map.set(d.toISODate()!, []);
    for (const e of events) {
      const s = DateTime.fromISO(e.start, { zone });
      const en = DateTime.fromISO(e.end, { zone });
      for (let d = s.startOf("day"); d < en || d.hasSame(s, "day"); d = d.plus({ days: 1 })) {
        map.get(d.toISODate()!)?.push(e);
        if (d.hasSame(en, "day")) break;
      }
    }
    for (const list of map.values()) list.sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || a.start.localeCompare(b.start));
    return map;
  }, [days, events, zone]);

  const weeks = days.length / 7;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="band grid grid-cols-7 border-b-2 border-ink-2">
        {days.slice(0, 7).map((d) => (
          <div key={d.weekday} className="border-l border-band-line px-2 py-1.5 text-small font-extrabold first:border-l-0">
            <span className="hidden sm:inline">{d.toFormat("ccc")}</span>
            <span className="sm:hidden">{d.toFormat("ccccc")}</span>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 overflow-y-auto" style={{ gridTemplateRows: `repeat(${weeks}, minmax(96px, 1fr))` }}>
        {days.map((d) => {
          const list = byDay.get(d.toISODate()!) ?? [];
          const inMonth = d.hasSame(anchor, "month");
          const isToday = d.hasSame(now, "day");
          const extra = list.length - MAX_CHIPS;
          return (
            <div
              key={d.toISODate()}
              className={cn(
                "group relative flex min-w-0 flex-col gap-0.5 border-b border-l border-rule p-1 [&:nth-child(7n+1)]:border-l-0",
                !inMonth && "bg-paper-2",
                isToday && "bg-wash/60",
              )}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                onCreate(d);
              }}
            >
              <button
                onClick={() => onDay(d)}
                className={cn(
                  "tnum relative mb-0.5 flex h-6 min-w-6 items-center justify-center self-start rounded-[2px] px-1 text-small font-bold hover:bg-wash",
                  !inMonth && "font-semibold text-graphite-soft",
                  isToday && "font-extrabold text-red-ink-text",
                )}
                aria-label={`${d.toFormat("cccc d LLLL")}, ${list.length} ${list.length === 1 ? "event" : "events"}`}
              >
                {d.day}
                {isToday && <span className="absolute inset-x-1 bottom-0.5 h-[2px] bg-red-ink" aria-hidden />}
              </button>
              {d.weekday === 1 && (
                <span className="tnum pointer-events-none absolute top-1.5 right-1.5 text-micro font-bold text-graphite-soft" aria-hidden>
                  Wk {d.weekNumber}
                </span>
              )}
              {/* Phones: ticks. Wider: named entries. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                {list.slice(0, 4).map((e) => (
                  <span key={e.id} className="h-1.5 w-2.5 rounded-[1px]" style={{ background: calendarInk(e.calendarPosition) }} />
                ))}
              </div>
              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {list.slice(0, MAX_CHIPS).map((e) => (
                  <EventPopover key={e.id} event={e} open={openEventId === e.id} setOpen={(o) => setOpenEventId(o ? e.id : null)}>
                    <button
                      data-event-id={e.id}
                      className={cn(
                        "flex min-w-0 items-center gap-1.5 rounded-[2px] px-1 py-px text-left text-micro hover:bg-wash",
                        e.isAllDay && "font-bold",
                        Date.parse(e.end) < now.toMillis() && "opacity-60",
                      )}
                      style={e.isAllDay ? { background: `color-mix(in oklab, ${calendarInk(e.calendarPosition)} 12%, var(--sheet))` } : undefined}
                    >
                      {!e.isAllDay && <span className="h-2.5 w-1.5 shrink-0 rounded-[1px]" style={{ background: calendarInk(e.calendarPosition) }} aria-hidden />}
                      {!e.isAllDay && <span className="tnum shrink-0 font-semibold text-graphite">{hhmm(e.start, zone)}</span>}
                      <span className="truncate font-semibold">{e.title}</span>
                    </button>
                  </EventPopover>
                ))}
                {extra > 0 && (
                  <button
                    onClick={() => onDay(d)}
                    className="self-start rounded-[2px] px-1 text-micro font-bold text-graphite underline decoration-rule-strong underline-offset-2 hover:bg-wash hover:text-ink"
                  >
                    {extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
