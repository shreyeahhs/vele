"use client";

import { CalendarClock, ChevronLeft, ChevronRight, PencilLine, Plus } from "lucide-react";
import { DateTime } from "luxon";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useAssistantContext } from "@/components/app/assistant-context";
import { usePencil, type Proposal } from "@/components/app/pencil-context";
import { useUI } from "@/components/app/ui-context";
import { useZone } from "@/components/app/zone";
import { Button } from "@/components/ui/button";
import { Segmented, Tip } from "@/components/ui/primitives";
import { useCalendars, useEvents, usePreferences } from "@/hooks/use-api";
import { useMediaQuery, useNow } from "@/hooks/use-client";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { errorMessage } from "@/lib/fetcher";
import { dt, stepAnchor, timeRange, viewRange, viewTitle, type CalendarView } from "@/lib/time-client";
import { AgendaView } from "./agenda-view";
import { MonthView } from "./month-view";
import { TimeGrid } from "./time-grid";

const VIEWS: CalendarView[] = ["day", "3day", "week", "month", "agenda"];
const VIEW_OPTIONS: Array<{ value: CalendarView; label: string; shortcut?: string }> = [
  { value: "day", label: "Day", shortcut: "D" },
  { value: "3day", label: "3 days", shortcut: "X" },
  { value: "week", label: "Week", shortcut: "W" },
  { value: "month", label: "Month", shortcut: "M" },
  { value: "agenda", label: "List", shortcut: "L" },
];

/** Phones: the same heading, short enough to sit beside the controls. */
function shortTitle(view: CalendarView, days: DateTime[], anchor: DateTime) {
  if (view === "day") return anchor.toFormat("ccc d LLL");
  if (view === "month") return anchor.toFormat("LLL yyyy");
  const a = days[0];
  const b = days[days.length - 1];
  return a.hasSame(b, "month") ? `${a.toFormat("d")}–${b.toFormat("d LLL")}` : `${a.toFormat("d LLL")}–${b.toFormat("d LLL")}`;
}

export function CalendarPage() {
  const zone = useZone();
  const now = useNow(zone);
  // The grid depends on "now" (today's column, the now line); render it on the client only.
  if (!now) return <div className="flex-1" aria-busy />;
  return <Calendar now={now} />;
}

function Calendar({ now }: { now: DateTime }) {
  const zone = useZone();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ui = useUI();
  const pencil = usePencil();
  const assistant = useAssistantContext();
  // Phones open on a single day; wider screens on the week.
  const narrow = useMediaQuery("(max-width: 767px)");

  const paramView = params.get("view") as CalendarView | null;
  const view: CalendarView = paramView && VIEWS.includes(paramView) ? paramView : narrow ? "day" : "week";
  const dateParam = params.get("date");
  const todayIso = now.toISODate()!;
  const anchor = useMemo(() => {
    const d = DateTime.fromISO(dateParam ?? todayIso, { zone });
    return d.isValid ? d.startOf("day") : DateTime.fromISO(todayIso, { zone });
  }, [dateParam, todayIso, zone]);
  const openEventId = params.get("event");

  const navigate = useCallback(
    (next: { view?: CalendarView; date?: DateTime; event?: string | null }) => {
      const sp = new URLSearchParams(params.toString());
      if (next.view) sp.set("view", next.view);
      if (next.date) sp.set("date", next.date.toISODate()!);
      if (next.event === null) sp.delete("event");
      else if (next.event) sp.set("event", next.event);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const queryRange = useMemo(() => ({ start: range.start.toJSDate(), end: range.end.toJSDate() }), [range]);
  const events = useEvents(queryRange);
  const calendars = useCalendars();
  const prefs = usePreferences();

  const hidden = useMemo(() => new Set((calendars.data ?? []).filter((c) => !c.isVisible).map((c) => c.id)), [calendars.data]);
  const visible = useMemo(() => (events.data ?? []).filter((e) => !hidden.has(e.calendarId)), [events.data, hidden]);

  const step = (dir: 1 | -1) => navigate({ date: stepAnchor(view, anchor, dir), event: null });
  const goToday = () => navigate({ date: now, event: null });

  useShortcuts({
    t: goToday,
    d: () => navigate({ view: "day" }),
    x: () => navigate({ view: "3day" }),
    w: () => navigate({ view: "week" }),
    m: () => navigate({ view: "month" }),
    l: () => navigate({ view: "agenda" }),
    j: () => step(1),
    k: () => step(-1),
    arrowright: () => step(1),
    arrowleft: () => step(-1),
  });

  const create = (start: DateTime, end: DateTime) => ui.openEventDialog({ start: start.toISO()!, end: end.toISO()! });
  const createOnDay = (d: DateTime) => {
    const at = d.set({ hour: Math.max(9, now.hasSame(d, "day") ? now.hour + 1 : 9), minute: 0 });
    create(at, at.plus({ minutes: prefs.data?.defaultDurationMin ?? 30 }));
  };
  const setOpenEventId = (id: string | null) => navigate({ event: id });

  const takeProposal = (p: Proposal) => {
    const text = `Let's go with option ${p.label} (${dt(p.start, zone).toFormat("ccc d LLL")} ${timeRange(p.start, p.end, zone)}).`;
    if (!window.matchMedia("(min-width: 1024px)").matches) router.push("/assistant");
    else assistant.setPanelOpen(true);
    void assistant.send(text);
  };
  const manualProposal = (p: Proposal) => ui.openEventDialog({ start: p.start, end: p.end });

  // An option whose time has passed can no longer be booked: stop offering it.
  const live = pencil.proposals.filter((p) => Date.parse(p.end) > now.toMillis());
  // Options Vele pencilled in that sit outside what's on screen.
  const offscreen = live.filter((p) => {
    const s = Date.parse(p.start);
    return s < range.start.toMillis() || s >= range.end.toMillis();
  });
  const isTimeGrid = view === "day" || view === "3day" || view === "week";
  const showsToday = now >= range.start && now < range.end;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-2 border-b-2 border-ink-2 px-3 py-2 md:px-5">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={goToday} disabled={showsToday && view !== "month"} title="Today (T)">
            Today
          </Button>
          <Tip label="Previous" shortcut="K">
            <Button size="icon-sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft />
            </Button>
          </Tip>
          <Tip label="Next" shortcut="J">
            <Button size="icon-sm" variant="ghost" onClick={() => step(1)} aria-label="Next">
              <ChevronRight />
            </Button>
          </Tip>
        </div>
        <h1 className="tnum flex min-w-0 flex-1 items-baseline gap-2.5" aria-live="polite">
          <span className="truncate text-lead font-extrabold tracking-[-0.01em] sm:hidden">{shortTitle(view, range.days, anchor)}</span>
          <span className="hidden truncate text-lead font-extrabold tracking-[-0.01em] sm:inline">{viewTitle(view, anchor)}</span>
          {view === "agenda" && <span className="hidden shrink-0 text-small font-bold text-graphite sm:inline">Week {anchor.weekNumber}</span>}
        </h1>
        {events.isFetching && !events.isPending && <span className="size-3 animate-spin rounded-[1px] border-2 border-graphite border-r-transparent" aria-label="Refreshing" />}
        <Segmented label="Calendar view" value={view} onChange={(v) => navigate({ view: v })} options={VIEW_OPTIONS} className="hidden md:inline-flex" />
        <Tip label="Find a time">
          <Button size="icon-sm" variant="ghost" onClick={() => ui.setFindTimeOpen(true)} aria-label="Find a time" className="hidden sm:inline-flex">
            <CalendarClock />
          </Button>
        </Tip>
        <Button size="sm" variant="primary" onClick={() => ui.openEventDialog()} className="md:hidden" aria-label="New event">
          <Plus /> New
        </Button>
        <div className="w-full md:hidden">
          <Segmented
            label="Calendar view"
            value={view}
            onChange={(v) => navigate({ view: v })}
            options={VIEW_OPTIONS.filter((o) => o.value !== "3day").map((o) => ({ ...o, label: o.value === "agenda" ? "List" : o.label }))}
            className="flex w-full [&>*]:flex-1"
          />
        </div>
      </header>

      {offscreen.length > 0 && (
        <div className="flex items-center gap-2 border-b border-dashed border-pencil bg-paper-2 px-4 py-1.5 text-small text-ink-2 md:px-5">
          <PencilLine className="size-3.5 text-graphite" />
          <span className="min-w-0 flex-1 truncate">
            Vele pencilled in {live.length === 1 ? "an option" : `${live.length} options`} starting {dt(offscreen[0].start, zone).toFormat("cccc d LLLL")}.
          </span>
          <button
            className="font-bold text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
            onClick={() => navigate({ date: dt(offscreen[0].start, zone), view: isTimeGrid ? view : "week" })}
          >
            Show me
          </button>
        </div>
      )}

      {events.isError && !events.data ? (
        <div role="alert" className="m-6 grid max-w-md gap-2 border-t-2 border-red-ink pt-3">
          <p className="text-lead font-extrabold">Your calendar didn’t load.</p>
          <p className="text-small text-graphite">{errorMessage(events.error)}</p>
          <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => events.refetch()}>
            Try again
          </Button>
        </div>
      ) : isTimeGrid ? (
        <TimeGrid
          key={view}
          days={range.days}
          events={visible}
          zone={zone}
          now={now}
          preferences={prefs.data}
          proposals={live}
          inked={pencil.inked}
          openEventId={openEventId}
          setOpenEventId={setOpenEventId}
          onCreate={create}
          onUseProposal={takeProposal}
          onProposalManual={manualProposal}
        />
      ) : view === "month" ? (
        <MonthView
          days={range.days}
          anchor={anchor}
          events={visible}
          zone={zone}
          now={now}
          openEventId={openEventId}
          setOpenEventId={setOpenEventId}
          onDay={(d) => navigate({ view: "day", date: d, event: null })}
          onCreate={createOnDay}
        />
      ) : (
        <AgendaView days={range.days} events={visible} zone={zone} now={now} openEventId={openEventId} setOpenEventId={setOpenEventId} onCreate={createOnDay} />
      )}
    </div>
  );
}
