"use client";

import { DateTime } from "luxon";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Proposal } from "@/components/app/pencil-context";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { EventDTO, PreferencesDTO } from "@/hooks/use-api";
import { hhmm } from "@/lib/time-client";
import { cn } from "@/lib/utils";
import { EventBlock, inkStyle } from "./event-bits";
import { EventDetails } from "./event-details";
import { layoutDay } from "./layout";

const HOUR = 52;
const PX_PER_MIN = HOUR / 60;
const GUTTER = 56;
const SNAP = 15;

interface Props {
  days: DateTime[];
  events: EventDTO[];
  zone: string;
  now: DateTime;
  preferences?: PreferencesDTO;
  proposals: Proposal[];
  inked: string[];
  openEventId: string | null;
  setOpenEventId: (id: string | null) => void;
  onCreate: (start: DateTime, end: DateTime) => void;
  onUseProposal: (p: Proposal) => void;
  onProposalManual: (p: Proposal) => void;
}

function minutesOf(value: string, day: DateTime, zone: string) {
  return DateTime.fromISO(value, { zone }).diff(day, "minutes").minutes;
}

/** Day, 3-day and week views: the booking sheet, printed hour rows under a header band. */
export function TimeGrid(props: Props) {
  const { days, events, zone, now, preferences } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);
  const cols = days.length;

  const { timed, allDay } = useMemo(() => {
    const timedList: EventDTO[] = [];
    const allDayList: EventDTO[] = [];
    for (const e of events) {
      const long = Date.parse(e.end) - Date.parse(e.start) >= 24 * 3_600_000;
      (e.isAllDay || long ? allDayList : timedList).push(e);
    }
    return { timed: timedList, allDay: allDayList };
  }, [events]);

  useLayoutEffect(() => {
    if (didScroll.current || !scrollRef.current) return;
    const showsToday = days.some((d) => d.hasSame(now, "day"));
    const target = showsToday ? Math.max(0, (now.hour * 60 + now.minute - 90) * PX_PER_MIN) : 7.5 * HOUR;
    scrollRef.current.scrollTop = target;
    didScroll.current = true;
  }, [days, now]);

  // Reveal an event opened from search or the assistant.
  useEffect(() => {
    if (!props.openEventId) return;
    const el = scrollRef.current?.querySelector(`[data-event-id="${CSS.escape(props.openEventId)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [props.openEventId, events]);

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* Headers stick inside the scroller, so they always line up with the columns below. */}
      <div className="sticky top-0 z-[45] bg-paper">
        <div className="band flex">
          <div className="tnum flex shrink-0 items-end justify-end pr-2 pb-2.5 text-micro font-extrabold text-band-ink-2" style={{ width: GUTTER }}>
            Wk {days[0].weekNumber}
          </div>
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const isToday = d.hasSame(now, "day");
              return (
                <div
                  key={d.toISODate()}
                  className={cn("flex items-baseline gap-1.5 border-l border-band-line px-2 py-2 first:border-l-0", isToday && "bg-paper text-ink")}
                  aria-current={isToday ? "date" : undefined}
                >
                  <span className="text-micro font-extrabold tracking-[0.06em] uppercase">{d.toFormat("ccc")}</span>
                  <span className={cn("tnum text-lead font-extrabold", isToday && "underline decoration-red-ink decoration-[3px] underline-offset-4")}>{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* All-day lane */}
        {allDay.length > 0 && (
          <div className="flex border-b-2 border-ink-2 bg-paper-2">
            <div className="flex shrink-0 items-start justify-end pt-1.5 pr-2 text-micro font-bold text-ink-2" style={{ width: GUTTER }}>
              All day
            </div>
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {days.map((d) => {
                const dayEnd = d.plus({ days: 1 });
                const items = allDay.filter((e) => DateTime.fromISO(e.start, { zone }) < dayEnd && DateTime.fromISO(e.end, { zone }) > d);
                return (
                  <div key={d.toISODate()} className="grid min-w-0 content-start gap-0.5 border-l border-rule p-1 first:border-l-0">
                    {items.map((e) => (
                      <EventPopover key={e.id} event={e} open={props.openEventId === e.id} setOpen={(o) => props.setOpenEventId(o ? e.id : null)}>
                        <button className="truncate rounded-[2px] border px-1.5 py-0.5 text-left text-micro font-bold" style={inkStyle(e)} data-event-id={e.id}>
                          {e.title}
                        </button>
                      </EventPopover>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Ruled body */}
      <div className="relative flex" style={{ height: 24 * HOUR }}>
        <div className="relative shrink-0" style={{ width: GUTTER }} aria-hidden>
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <span key={h} className="tnum absolute right-2 -translate-y-1/2 bg-paper px-0.5 text-micro font-extrabold text-ink-2" style={{ top: h * HOUR }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[1.5px] bg-ink-2" aria-hidden />
          {days.map((d) => (
            <DayColumn key={d.toISODate()} {...props} day={d} timed={timed} workingHours={preferences?.workingHours} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn(
  props: Props & {
    day: DateTime;
    timed: EventDTO[];
    workingHours?: PreferencesDTO["workingHours"];
  },
) {
  const { day, timed, zone, now } = props;
  const dayEnd = day.plus({ days: 1 });
  const colRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragStart = useRef<{ y: number; min: number; touch: boolean } | null>(null);

  const positioned = useMemo(() => {
    const items = timed.filter((e) => DateTime.fromISO(e.start, { zone }) < dayEnd && DateTime.fromISO(e.end, { zone }) > day);
    return layoutDay(
      items,
      (e) => ({
        start: Math.max(0, minutesOf(e.start, day, zone)),
        end: Math.min(24 * 60, minutesOf(e.end, day, zone)),
      }),
      18,
    );
  }, [timed, day, dayEnd, zone]);

  const proposals = props.proposals.filter((p) => DateTime.fromISO(p.start, { zone }).hasSame(day, "day"));
  const isToday = day.hasSame(now, "day");
  const nowMin = now.hour * 60 + now.minute;

  const windows = (props.workingHours ?? []).filter((w) => w.day === day.weekday);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const offHours: Array<[number, number]> = [];
  if (props.workingHours) {
    let cursor = 0;
    for (const w of [...windows].sort((a, b) => toMin(a.start) - toMin(b.start))) {
      if (toMin(w.start) > cursor) offHours.push([cursor, toMin(w.start)]);
      cursor = Math.max(cursor, toMin(w.end));
    }
    if (cursor < 24 * 60) offHours.push([cursor, 24 * 60]);
  }

  const minuteAt = (clientY: number) => {
    const rect = colRef.current!.getBoundingClientRect();
    const m = (clientY - rect.top) / PX_PER_MIN;
    return Math.max(0, Math.min(24 * 60, Math.round(m / SNAP) * SNAP));
  };

  // Mouse: press and drag to draw a block. Touch: a tap drafts 30 minutes, so
  // scrolling the page never draws anything.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    if (props.openEventId) return; // this click only dismisses the open event
    const m = Math.floor((e.clientY - colRef.current!.getBoundingClientRect().top) / PX_PER_MIN / SNAP) * SNAP;
    dragStart.current = {
      y: e.clientY,
      min: m,
      touch: e.pointerType !== "mouse",
    };
    if (e.pointerType === "mouse") {
      setDrag({ from: m, to: m + 30 });
      colRef.current!.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragStart.current;
    if (!s) return;
    if (s.touch) {
      if (Math.abs(e.clientY - s.y) > 8) dragStart.current = null;
      return;
    }
    if (Math.abs(e.clientY - s.y) < 6) return;
    const m = minuteAt(e.clientY);
    setDrag({ from: Math.min(s.min, m), to: Math.max(s.min + SNAP, m) });
  };
  const onPointerUp = () => {
    const s = dragStart.current;
    dragStart.current = null;
    if (!s) return;
    const range = s.touch ? { from: s.min, to: s.min + 30 } : drag;
    setDrag(null);
    if (!range) return;
    props.onCreate(
      day.plus({ minutes: range.from }),
      day.plus({
        minutes: Math.min(24 * 60, Math.max(range.to, range.from + SNAP)),
      }),
    );
  };

  return (
    <div
      ref={colRef}
      className={cn("graph-ruling relative cursor-crosshair border-l border-rule first:border-l-0", isToday && "bg-wash/60")}
      style={{ ["--hour" as string]: `${HOUR}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragStart.current = null;
        setDrag(null);
      }}
      aria-label={day.toFormat("cccc d LLLL")}
    >
      {offHours.map(([a, b]) => (
        <div key={a} className="pointer-events-none absolute inset-x-0 bg-paper-2" style={{ top: a * PX_PER_MIN, height: (b - a) * PX_PER_MIN }} aria-hidden />
      ))}

      {positioned.map((p) => {
        const e = p.item;
        const past = Date.parse(e.end) < now.toMillis();
        const inked = props.inked.some((id) => id === e.id || id === e.eventId);
        return (
          <div
            key={e.id}
            className="absolute px-[2px]"
            style={{
              top: p.top * PX_PER_MIN + 1,
              height: p.height * PX_PER_MIN - 2,
              left: `${(p.column / p.columns) * 100}%`,
              width: `${100 / p.columns}%`,
              zIndex: 5 + p.column,
            }}
          >
            <EventPopover event={e} open={props.openEventId === e.id} setOpen={(o) => props.setOpenEventId(o ? e.id : null)}>
              <EventBlock event={e} height={p.height * PX_PER_MIN - 2} inked={inked} past={past} />
            </EventPopover>
          </div>
        );
      })}

      {proposals.map((p) => {
        const top = minutesOf(p.start, day, zone);
        const height = minutesOf(p.end, day, zone) - top;
        return (
          <ProposalBox
            key={p.label + p.start}
            proposal={p}
            top={top * PX_PER_MIN}
            height={height * PX_PER_MIN}
            zone={zone}
            onUse={props.onUseProposal}
            onManual={props.onProposalManual}
          />
        );
      })}

      {drag && (
        <div
          className="pencil-hatch pointer-events-none absolute inset-x-1 z-30 rounded-[2px] border-[1.5px] border-dashed border-ink-2 px-1.5 py-0.5"
          style={{
            top: drag.from * PX_PER_MIN,
            height: (drag.to - drag.from) * PX_PER_MIN,
          }}
        >
          <span className="tnum font-hand text-small font-bold text-ink-2">
            {day.plus({ minutes: drag.from }).toFormat("HH:mm")}–{day.plus({ minutes: drag.to }).toFormat("HH:mm")}
          </span>
        </div>
      )}

      {isToday && (
        <div className="pointer-events-none absolute inset-x-0 z-40" style={{ top: nowMin * PX_PER_MIN }} aria-hidden>
          <div className="h-[2px] rounded-full bg-red-ink" />
          <div className="absolute -top-[4px] -left-[5px] size-2.5 rounded-full bg-red-ink" />
        </div>
      )}
    </div>
  );
}

export function EventPopover({ event, open, setOpen, children }: { event: EventDTO; open: boolean; setOpen: (open: boolean) => void; children: React.ReactNode }) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-[340px]">
        <EventDetails event={event} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function ProposalBox({
  proposal,
  top,
  height,
  zone,
  onUse,
  onManual,
}: {
  proposal: Proposal;
  top: number;
  height: number;
  zone: string;
  onUse: (p: Proposal) => void;
  onManual: (p: Proposal) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="absolute inset-x-1 z-30" style={{ top: top + 1, height: Math.max(height - 2, 18) }}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "pencil-hatch animate-pencil-in flex h-full w-full items-start gap-1.5 rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper/60 px-1.5 py-0.5 text-left transition-colors hover:border-ink-2",
                proposal.status === "flagged" && "border-amber",
              )}
              aria-label={`Option ${proposal.label}, ${hhmm(proposal.start, zone)} to ${hhmm(proposal.end, zone)}`}
            >
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-[2px] border-[1.5px] border-pencil bg-paper font-hand text-small font-bold text-hand">
                {proposal.label}
              </span>
              <span className="tnum truncate font-hand text-small font-bold text-hand">
                {hhmm(proposal.start, zone)}–{hhmm(proposal.end, zone)}
              </span>
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent side="right" className="w-72">
        <div className="grid gap-2.5">
          <div>
            <p className="tnum font-hand text-lead leading-tight font-bold text-hand">
              {DateTime.fromISO(proposal.start, { zone }).toFormat("ccc d LLL")}, {hhmm(proposal.start, zone)}–{hhmm(proposal.end, zone)}
            </p>
            <p className="text-small font-semibold text-ink-2">Option {proposal.label}, written in by Vele. Nothing is booked yet.</p>
          </div>
          {proposal.notes.length > 0 && (
            <ul className="grid gap-0.5 border-l-[1.5px] border-pencil pl-2.5 text-small font-medium text-ink-2">
              {proposal.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setOpen(false);
                onUse(proposal);
              }}
            >
              Book this time
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onManual(proposal);
              }}
            >
              Book it myself
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
