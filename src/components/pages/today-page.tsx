"use client";

import { ArrowRight, CalendarPlus, ExternalLink, Link2, MapPin, PenLine, TriangleAlert, Users } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAssistantContext } from "@/components/app/assistant-context";
import { usePencil } from "@/components/app/pencil-context";
import { useUI } from "@/components/app/ui-context";
import { useZone } from "@/components/app/zone";
import { ActionCard } from "@/components/assistant/action-card";
import { MeetingBadge } from "@/components/calendar/event-bits";
import { EventPopover } from "@/components/calendar/time-grid";
import { Button } from "@/components/ui/button";
import { SectionHead, Skeleton, Tape } from "@/components/ui/primitives";
import { useOverview, type EventDTO, type Overview } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-client";
import { errorMessage } from "@/lib/fetcher";
import { dt, durationText, hhmm, relativeStart, timeRange } from "@/lib/time-client";
import { calendarCode, calendarInk, cn } from "@/lib/utils";

/** Wide screens write to Vele's memo sheet; narrower ones go to the assistant page. */
function useAsk() {
  const assistant = useAssistantContext();
  const router = useRouter();
  return (prefill: string, sendNow = false) => {
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if (sendNow) {
      if (wide) assistant.setPanelOpen(true);
      else router.push("/assistant");
      void assistant.send(prefill);
      return;
    }
    assistant.focusComposer(prefill);
    if (!wide) router.push("/assistant");
  };
}

/** Today, as the sheet on the door: the date in the band, the next booking printed large, the day as a timetable. */
export function TodayPage() {
  const zone = useZone();
  const overview = useOverview();
  const now = useNow(zone);

  if (overview.isPending || !now) return <TodaySkeleton />;
  if (overview.isError) {
    return (
      <div className="m-6 grid max-w-md gap-3 border-t-2 border-red-ink pt-3">
        <p className="text-lead font-extrabold">Today didn’t load.</p>
        <p className="text-small text-ink-2">{errorMessage(overview.error)}</p>
        <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => overview.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const o = overview.data;
  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <TodayBand o={o} now={now} />
      <div className="grid items-start gap-x-10 gap-y-9 px-4 pt-6 pb-12 md:px-6 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-9">
          <AskLine />
          {o.next && <NextUp event={o.next} now={now} />}
          <YourDay o={o} now={now} />
        </div>
        <div className="grid gap-9">
          <Pencilled now={now} />
          {o.pending.length > 0 && <Holds o={o} />}
          {o.conflicts.length > 0 && <Conflicts o={o} />}
          <FreeTime o={o} now={now} />
          <ThisWeek o={o} now={now} />
          {o.bookings.length > 0 && <Bookings o={o} />}
        </div>
      </div>
    </div>
  );
}

function TodayBand({ o, now }: { o: Overview; now: DateTime }) {
  const booked = o.today.meetingCount;
  const summary = [
    booked === 0 ? "Nothing booked" : `${booked} ${booked === 1 ? "booking" : "bookings"}`,
    o.today.freeMinutesLeft > 0 ? `${durationText(o.today.freeMinutesLeft)} still open` : o.today.isWorkingDay ? "no open time left" : "a day off",
  ].join(" · ");
  return (
    <header className="band m-1.5 mb-0 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-6 rounded-[2px] px-4 pt-6 pb-4 md:m-2 md:mb-0 md:px-6">
      <div className="min-w-0">
        <p className="tnum text-small font-bold text-band-ink-2">
          Week {now.weekNumber} · {now.toFormat("yyyy")}
        </p>
        <h1 className="mt-1 text-title font-extrabold tracking-[-0.02em] md:text-headline">{now.toFormat("cccc d LLLL")}</h1>
        <p className="mt-1.5 text-small font-semibold text-band-ink-2">
          {o.firstName ? `${o.firstName}: ` : ""}
          {summary}
        </p>
      </div>
      <p className="tnum text-right text-title leading-none font-extrabold md:text-headline" aria-label={`The time is ${now.toFormat("HH:mm")}`}>
        {now.toFormat("HH:mm")}
      </p>
    </header>
  );
}

/** The ask line, for screens where Vele's memo sheet isn't pinned alongside. */
function AskLine() {
  const ask = useAsk();
  return (
    <form
      className="flex items-center gap-2 rounded-[2px] border-[1.5px] border-ink-2 bg-paper p-1 pl-3 focus-within:shadow-[0_0_0_1px_var(--ink-2)] lg:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        const text = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        if (text) ask(text, true);
        e.currentTarget.reset();
      }}
    >
      <PenLine className="size-4 shrink-0 text-ink-2" aria-hidden />
      <input
        name="q"
        className="h-9 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-graphite-soft"
        placeholder="Write to Vele: “lunch with Mom 1–3 Saturday”"
        aria-label="Write to Vele"
        autoComplete="off"
      />
      <Button type="submit" size="sm" variant="primary">
        Send
      </Button>
    </form>
  );
}

function NextUp({ event, now }: { event: EventDTO; now: DateTime }) {
  const zone = useZone();
  const start = dt(event.start, zone);
  const end = dt(event.end, zone);
  const live = now >= start && now < end;
  const soon = !live && start.diff(now, "minutes").minutes <= 10;
  const rel = live ? `Now, until ${hhmm(event.end, zone)}` : relativeStart(event.start, now);
  const [open, setOpen] = useState(false);
  const ink = calendarInk(event.calendarPosition);
  return (
    <section aria-labelledby="next-up">
      <SectionHead
        id="next-up"
        title={live ? "Happening now" : "Next booking"}
        action={<span className={cn("tnum", live || soon ? "text-red-ink-text" : "text-ink-2")}>{rel}</span>}
      />
      <EventPopover event={event} open={open} setOpen={setOpen}>
        <button className="group grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-1 pt-3 text-left">
          <span className="tnum text-title font-extrabold text-ink-2">{start.toFormat("HH:mm")}</span>
          <span className="text-title leading-tight font-extrabold tracking-[-0.02em] text-ink group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">
            {event.title}
          </span>
          <span className="tnum text-small font-bold text-ink-2">to {end.toFormat("HH:mm")}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-small font-semibold text-ink-2">
            <Tape color={ink}>{calendarCode(event.calendarName)}</Tape>
            {!start.hasSame(now, "day") && <span>{start.toFormat("cccc")}</span>}
            {event.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{event.location}</span>
              </span>
            )}
            {event.attendees.length > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Users className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{event.attendees.map((a) => a.name ?? a.email).join(", ")}</span>
              </span>
            )}
          </span>
        </button>
      </EventPopover>
      {event.meetingUrl && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button asChild variant={live || soon ? "primary" : "secondary"}>
            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer">
              Join <ExternalLink />
            </a>
          </Button>
          <MeetingBadge provider={event.meetingProvider} className="text-small font-semibold text-ink-2" />
        </div>
      )}
    </section>
  );
}

/** The day as a printed timetable, with open stretches left blank and the red marker line at now. */
function YourDay({ o, now }: { o: Overview; now: DateTime }) {
  const zone = useZone();
  const ui = useUI();
  const ask = useAsk();
  const [openId, setOpenId] = useState<string | null>(null);
  const allDay = o.today.events.filter((e) => e.isAllDay);
  const timed = o.today.events.filter((e) => !e.isAllDay);

  type Row = { type: "event"; e: EventDTO } | { type: "gap"; start: string; end: string; minutes: number } | { type: "now" };
  const rows: Row[] = [];
  // Only gaps still ahead: past free time is not actionable.
  const gaps = o.today.openTime.filter((g) => g.minutes >= 30 && Date.parse(g.end) > now.toMillis());
  const items = [...timed.map((e) => ({ at: e.start, row: { type: "event", e } as Row })), ...gaps.map((g) => ({ at: g.start, row: { type: "gap", ...g } as Row }))].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  let nowPlaced = false;
  for (const it of items) {
    if (!nowPlaced && Date.parse(it.at) > now.toMillis()) {
      rows.push({ type: "now" });
      nowPlaced = true;
    }
    rows.push(it.row);
  }
  if (!nowPlaced && items.length) rows.push({ type: "now" });

  return (
    <section aria-labelledby="your-day">
      <SectionHead
        id="your-day"
        title="The day"
        action={
          <Link
            href={`/calendar?view=day&date=${o.today.date}`}
            className="inline-flex items-center gap-1 text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink-2"
          >
            Open the day <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {allDay.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-b border-rule py-2.5">
          {allDay.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-small font-bold">
              <Tape color={calendarInk(e.calendarPosition)}>{calendarCode(e.calendarName)}</Tape>
              {e.title}
            </li>
          ))}
        </ul>
      )}
      {timed.length === 0 ? (
        <div className="grid justify-items-start gap-3 py-5">
          <p className="text-lead font-extrabold">Nothing booked today.</p>
          <p className="max-w-[48ch] text-small text-ink-2">A clear sheet. Book something yourself, or tell Vele what you’d like to do with it.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => ui.openEventDialog()}>
              <CalendarPlus /> New booking
            </Button>
            <Button size="sm" variant="pencil" onClick={() => ask("Block two hours for deep work today", false)}>
              Plan some focus time
            </Button>
          </div>
        </div>
      ) : (
        <ol className="banded">
          {rows.map((r, i) => {
            if (r.type === "now")
              return (
                <li key={`now-${i}`} className="relative flex h-7 items-center gap-3 bg-transparent!" aria-label={`Now, ${now.toFormat("HH:mm")}`}>
                  <span className="tnum w-14 shrink-0 text-small font-extrabold text-red-ink-text">{now.toFormat("HH:mm")}</span>
                  <span className="h-[2px] flex-1 rounded-full bg-red-ink" />
                </li>
              );
            if (r.type === "gap")
              return (
                <li key={`gap-${r.start}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-0 py-2">
                  <span className="tnum text-small font-semibold text-graphite">{hhmm(r.start, zone)}</span>
                  <span className="text-small font-semibold text-graphite">
                    Open for {durationText(r.minutes)}, until {hhmm(r.end, zone)}
                  </span>
                  <button
                    onClick={() => ask(`Block ${timeRange(r.start, r.end, zone)} today as focus time`, false)}
                    className="text-small font-bold text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink-2"
                  >
                    Protect it
                  </button>
                </li>
              );
            const e = r.e;
            const past = Date.parse(e.end) < now.toMillis();
            const live = Date.parse(e.start) <= now.toMillis() && !past;
            return (
              <li key={e.id} className={cn(past && "text-graphite")}>
                <EventPopover event={e} open={openId === e.id} setOpen={(v) => setOpenId(v ? e.id : null)}>
                  <button className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-3 py-2.5 text-left hover:bg-wash">
                    <span className={cn("tnum text-body font-extrabold", live ? "text-red-ink-text" : past ? "text-graphite" : "text-ink-2")}>{hhmm(e.start, zone)}</span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-body font-bold", past ? "text-graphite line-through decoration-rule" : "text-ink")}>{e.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small font-medium text-ink-2">
                        <Tape color={calendarInk(e.calendarPosition)}>{calendarCode(e.calendarName)}</Tape>
                        <span className="tnum">
                          to {hhmm(e.end, zone)} · {durationText((Date.parse(e.end) - Date.parse(e.start)) / 60_000)}
                        </span>
                        {e.meetingUrl && <MeetingBadge provider={e.meetingProvider} />}
                        {!e.meetingUrl && e.location && <span className="truncate">{e.location}</span>}
                        {e.kind === "FOCUS" && <span>focus time</span>}
                      </span>
                    </span>
                  </button>
                </EventPopover>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * Options Vele has pencilled in this session. The calendar draws them on the
 * days they fall on; Today has no grid, so they are listed here instead.
 */
function Pencilled({ now }: { now: DateTime }) {
  const pencil = usePencil();
  const zone = useZone();
  const ask = useAsk();
  // Options whose time has passed are no longer bookable.
  const options = pencil.proposals.filter((p) => Date.parse(p.end) > now.toMillis());
  if (options.length === 0) return null;
  const first = dt(options[0].start, zone);
  return (
    <section aria-labelledby="pencilled">
      <SectionHead
        id="pencilled"
        title={options.length === 1 ? "Pencilled in by Vele" : `${options.length} times pencilled in`}
        action={
          <Link href={`/calendar?view=week&date=${first.toISODate()}`} className="font-semibold text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink-2">
            See them on the sheet
          </Link>
        }
      />
      <ul className="grid gap-2 pt-2">
        {options.map((p) => (
          <li key={p.label}>
            <button
              onClick={() => ask(`Let's go with option ${p.label} (${dt(p.start, zone).toFormat("ccc d LLL")} ${timeRange(p.start, p.end, zone)}).`, true)}
              className={cn(
                "pencil-hatch group grid w-full grid-cols-[28px_minmax(0,1fr)] items-start gap-2.5 rounded-[2px] border-[1.5px] border-dashed border-pencil px-2.5 py-2 text-left transition-colors hover:border-ink-2",
                p.status === "flagged" && "border-amber",
              )}
            >
              <span className="flex size-7 items-center justify-center rounded-[2px] border-[1.5px] border-pencil font-hand text-lead font-bold text-hand group-hover:border-ink-2 group-hover:bg-ink-2 group-hover:text-paper">
                {p.label}
              </span>
              <span className="min-w-0">
                <span className="tnum block font-hand text-lead leading-tight font-bold text-hand">
                  {dt(p.start, zone).toFormat("ccc d LLL")}, {timeRange(p.start, p.end, zone)}
                </span>
                {p.notes.length > 0 && <span className="mt-0.5 block text-micro font-semibold text-graphite">{p.notes.slice(0, 2).join(" · ")}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="pt-2 text-micro text-graphite">Nothing is booked until you pick one.</p>
    </section>
  );
}

function Holds({ o }: { o: Overview }) {
  const assistant = useAssistantContext();
  return (
    <section aria-labelledby="holds">
      <SectionHead id="holds" title="Waiting for your yes" />
      <div className="grid gap-2.5 pt-2">
        {o.pending.map((a) => (
          <ActionCard key={a.id} action={a} onResolve={(d) => assistant.resolveAction(a, d)} />
        ))}
      </div>
    </section>
  );
}

function Conflicts({ o }: { o: Overview }) {
  const zone = useZone();
  return (
    <section aria-labelledby="conflicts">
      <SectionHead id="conflicts" title="Clashes coming up" className="border-red-ink" />
      <ul>
        {o.conflicts.map((c, i) => (
          <li key={i} className="flex gap-2.5 border-b border-rule py-2.5 last:border-b-0">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-ink-text" aria-hidden />
            <div className="min-w-0 text-small">
              <p className="font-bold text-ink">{c.message}</p>
              {c.events[0] && (
                <Link
                  href={`/calendar?view=day&date=${dt(c.events[0].start, zone).toISODate()}`}
                  className="font-semibold text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink-2"
                >
                  {dt(c.events[0].start, zone).toFormat("cccc d LLL")}: see it on the sheet
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FreeTime({ o, now }: { o: Overview; now: DateTime }) {
  const zone = useZone();
  const ask = useAsk();
  const left = o.today.openTime
    .map((w) => ({ ...w, start: Date.parse(w.start) < now.toMillis() ? now.toISO()! : w.start }))
    .map((w) => ({ ...w, minutes: Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60_000) }))
    .filter((w) => w.minutes >= 15);
  const total = o.today.freeMinutesTotal;
  return (
    <section aria-labelledby="free-time">
      <SectionHead id="free-time" title="Open time today" />
      <p className="pt-1.5 text-body text-ink-2">
        {o.today.freeMinutesLeft > 0 ? (
          <>
            <span className="tnum font-extrabold text-ink">{durationText(o.today.freeMinutesLeft)}</span> still open
            {total > 0 && <span className="tnum"> of the {durationText(total)} your working hours leave free</span>}.
          </>
        ) : o.today.isWorkingDay ? (
          "Nothing left open today."
        ) : (
          "Not a working day, so no open time is counted."
        )}
      </p>
      {left.length > 0 && (
        <ul className="banded mt-2">
          {left.map((w) => (
            <li key={w.start} className="flex items-center justify-between gap-3 px-1 py-2 text-small">
              <span className="tnum font-bold text-ink">{timeRange(w.start, w.end, zone)}</span>
              <span className="flex items-center gap-3">
                <span className="tnum font-semibold text-ink-2">{durationText(w.minutes)}</span>
                <button
                  className="font-bold text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink-2"
                  onClick={() => ask(`Block ${timeRange(w.start, w.end, zone)} today as focus time`, false)}
                >
                  Protect it
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ThisWeek({ o, now }: { o: Overview; now: DateTime }) {
  const days = o.week.days;
  const max = Math.max(60, ...days.map((d) => d.meetingMinutes + d.focusMinutes + d.freeMinutes));
  return (
    <section aria-labelledby="this-week">
      <SectionHead
        id="this-week"
        title={`Week ${now.weekNumber}`}
        action={
          <Link href="/calendar?view=week" className="inline-flex items-center gap-1 text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink-2">
            The week <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <p className="pt-1.5 text-body text-ink-2">
        <span className="tnum font-extrabold text-ink">{durationText(o.week.meetingMinutes)}</span> in meetings,{" "}
        <span className="tnum font-extrabold text-ink">{durationText(o.week.focusMinutes)}</span> of focus and{" "}
        <span className="tnum font-extrabold text-ink">{durationText(o.week.freeMinutes)}</span> still open.
      </p>
      <div className="mt-4 grid h-28 grid-cols-7 items-end gap-2 border-b-2 border-ink-2" role="img" aria-label="Meeting, focus and open time for each day this week">
        {days.map((d) => {
          const date = DateTime.fromISO(d.date, { zone: now.zone });
          const h = (m: number) => `${Math.max(0, (m / max) * 100)}%`;
          return (
            <div
              key={d.date}
              className="flex h-full flex-col justify-end"
              title={`${date.toFormat("cccc")}: ${durationText(d.meetingMinutes)} in meetings, ${durationText(d.freeMinutes)} open`}
            >
              <div className="border-[1.5px] border-b-0 border-dashed border-pencil" style={{ height: h(d.freeMinutes) }} />
              <div className="focus-hatch text-ink-2" style={{ height: h(d.focusMinutes) }} />
              <div className="bg-ink-2" style={{ height: h(d.meetingMinutes) }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-2" aria-hidden>
        {days.map((d) => {
          const date = DateTime.fromISO(d.date, { zone: now.zone });
          const isToday = date.hasSame(now, "day");
          return (
            <span key={d.date} className={cn("text-center text-micro font-extrabold text-ink-2", isToday && "text-red-ink-text underline decoration-2 underline-offset-4")}>
              {date.toFormat("ccc")}
            </span>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-micro font-bold text-ink-2" aria-hidden>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-3 bg-ink-2" /> meetings
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="focus-hatch size-3 border border-ink-2 text-ink-2" /> focus
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-3 border-[1.5px] border-dashed border-pencil" /> open
        </li>
      </ul>
      {o.week.observations.length > 1 && (
        <ul className="banded mt-4 border-t border-rule">
          {o.week.observations.slice(1, 4).map((line, i) => (
            <li key={i} className="border-b border-rule px-2 py-1.5 text-small font-medium text-ink">
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Bookings({ o }: { o: Overview }) {
  const zone = useZone();
  return (
    <section aria-labelledby="bookings">
      <SectionHead
        id="bookings"
        title="Booked through your link"
        action={
          <Link href="/bookings" className="inline-flex items-center gap-1 text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink-2">
            All <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <ul className="banded">
        {o.bookings.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-1 py-2.5">
            <Link2 className="size-4 shrink-0 text-green-ok" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-bold">
                {b.title} with {b.inviteeName}
              </p>
              <p className="tnum text-small font-semibold text-ink-2">
                {dt(b.start, zone).toFormat("ccc d LLL")}, {timeRange(b.start, b.end, zone)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodaySkeleton() {
  return (
    <div className="min-h-0 flex-1" aria-busy>
      <div className="band m-1.5 mb-0 h-[120px] rounded-[2px] md:m-2 md:mb-0" />
      <div className="grid gap-10 px-4 pt-6 md:grid-cols-[1.4fr_1fr] md:px-6">
        <div className="grid content-start gap-3">
          <div className="h-0.5 bg-ink-2" />
          <Skeleton className="h-16 w-3/4" />
          <div className="mt-6 h-0.5 bg-ink-2" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="grid content-start gap-3">
          <div className="h-0.5 bg-ink-2" />
          <Skeleton className="h-10 w-full" />
          <div className="mt-6 h-0.5 bg-ink-2" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </div>
  );
}
