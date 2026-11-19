"use client";

import { ArrowUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Fade, FilmFrame, Pointer, typed, useFilm, useTargets, type Chapter, type Waypoint } from "./film-kit";

/**
 * Film one: ask Vele for a time, watch it pencil options onto the week, pick
 * one, and see it printed. A scripted loop over a miniature of the real app.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DATES = [14, 15, 16, 17, 18];
const TODAY = 3;
const START = 9;
const END = 18;
const HOUR = 38;
const GUTTER = 48;

type Ev = { day: number; start: number; end: number; title: string; ink: string; focus?: boolean };
const WEEK: Ev[] = [
  { day: 0, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 0, start: 11, end: 12.5, title: "Design review", ink: "var(--ink-0)" },
  { day: 0, start: 15, end: 16, title: "1:1 with Amara", ink: "var(--ink-4)" },
  { day: 1, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 1, start: 10.5, end: 12.5, title: "Focus", ink: "var(--ink-5)", focus: true },
  { day: 1, start: 13, end: 14, title: "Lunch with Priya", ink: "var(--ink-1)" },
  { day: 2, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 2, start: 13, end: 14, title: "Roadmap", ink: "var(--ink-0)" },
  { day: 2, start: 15, end: 16, title: "Team retro", ink: "var(--ink-0)" },
  { day: 3, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 3, start: 12.5, end: 13.5, title: "Gym", ink: "var(--ink-1)" },
  { day: 4, start: 10, end: 11, title: "Customer call", ink: "var(--ink-3)" },
  { day: 4, start: 14.5, end: 15.5, title: "Demo prep", ink: "var(--ink-0)" },
];

const HOLDS = [
  { label: "A", start: 14, end: 14.5, at: 6500 },
  { label: "B", start: 15.5, end: 16, at: 6750 },
  { label: "C", start: 17, end: 17.5, at: 7000 },
];

const ASK = "Find 30 minutes with Sarah on Thursday afternoon";

// The script, in milliseconds.
const TYPE_AT = 1800;
const SENT = 5150;
const REPLIED = 6200;
const HOVER = 8400;
const OPEN = 9150;
const BOOK = 10700;
const DONE = 11150;
const DURATION = 15600;

const CHAPTERS: Chapter[] = [
  { label: "Ask in plain words", start: 0, poster: 4300 },
  { label: "Vele pencils in options", start: REPLIED, poster: 8300 },
  { label: "Pick one, it's booked", start: OPEN, poster: 12800 },
];

const PATH: Waypoint[] = [
  { t: 0, to: [0.56, 0.9] },
  { t: 600, to: [0.56, 0.9] },
  { t: 1500, to: "composer" },
  { t: 4300, to: "composer" },
  { t: 5000, to: "send" },
  { t: 7300, to: "send" },
  { t: 8400, to: "holdA" },
  { t: 9700, to: "holdA" },
  { t: 10500, to: "book" },
  { t: 11100, to: "book" },
  { t: 12200, to: [0.5, 0.94] },
  { t: DURATION, to: [0.5, 0.94] },
];
const CLICKS = [1500, 5000, 9100, 10550];

const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

export function AskFilm() {
  const [setFrame, film] = useFilm({ duration: DURATION, chapters: CHAPTERS, poster: 12800 });
  const [setStage, layout] = useTargets();
  const { t } = film;

  const focused = t >= 1600 && t < SENT;
  const draft = t < SENT ? typed(ASK, t, TYPE_AT) : "";
  const booked = t >= BOOK;
  const popOpen = t >= OPEN && t < BOOK;
  const holdA = HOLDS[0];

  return (
    <FilmFrame
      film={film}
      frame={setFrame}
      label="A short demo: someone asks Vele to find 30 minutes with Sarah on Thursday afternoon. Vele pencils three options onto Thursday; they click option A and book it, and it becomes a printed booking."
    >
      <div ref={setStage} className="relative grid lg:grid-cols-[minmax(0,1fr)_340px]" aria-hidden>
        {/* The week */}
        <div className="min-w-0">
          <div className="band flex border-b-2 border-ink-2">
            <div className="tnum flex shrink-0 items-end justify-end pr-2 pb-2 text-micro font-extrabold text-band-ink-2" style={{ width: GUTTER }}>
              Wk 38
            </div>
            {DAYS.map((d, i) => (
              <div
                key={d}
                className={cn("min-w-0 flex-1 items-baseline gap-1.5 border-l border-band-line px-2 py-2", i < 2 ? "hidden sm:flex" : "flex", i === TODAY && "bg-paper")}
              >
                <span className="text-micro font-extrabold uppercase">{d}</span>
                <span className={cn("tnum relative text-body font-extrabold", i === TODAY && "text-red-ink-text")}>
                  {DATES[i]}
                  {i === TODAY && <span className="absolute inset-x-0 -bottom-0.5 h-[2px] bg-red-ink" />}
                </span>
              </div>
            ))}
          </div>
          <div className="relative flex" style={{ height: (END - START) * HOUR }}>
            <div className="relative shrink-0" style={{ width: GUTTER }}>
              {Array.from({ length: END - START - 1 }, (_, i) => (
                <span key={i} className="tnum absolute right-2 -translate-y-1/2 text-micro font-extrabold text-ink-2" style={{ top: (i + 1) * HOUR }}>
                  {START + i + 1}:00
                </span>
              ))}
            </div>
            <div className="graph-ruling relative flex flex-1" style={{ ["--hour" as string]: `${HOUR}px` }}>
              <div className="absolute inset-y-0 left-0 z-10 w-[1.5px] bg-ink-2" />
              {DAYS.map((d, day) => (
                <div key={d} className={cn("relative flex-1 border-l border-rule first:border-l-0", day < 2 && "hidden sm:block", day === TODAY && "bg-wash/60")}>
                  {WEEK.filter((e) => e.day === day).map((e, i) => (
                    <Cell
                      key={i}
                      top={(e.start - START) * HOUR}
                      height={(e.end - e.start) * HOUR}
                      title={e.title}
                      time={`${fmt(e.start)}–${fmt(e.end)}`}
                      ink={e.ink}
                      focus={e.focus}
                    />
                  ))}
                  {day === TODAY && (
                    <>
                      <span data-target="holdA" className="invisible absolute inset-x-1" style={{ top: (holdA.start - START) * HOUR, height: (holdA.end - holdA.start) * HOUR }} />
                      {HOLDS.map((h) =>
                        t >= h.at && !booked ? (
                          <div
                            key={h.label}
                            className={cn(
                              "pencil-hatch animate-pencil-in absolute inset-x-1 z-20 flex items-start gap-1.5 rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper/60 px-1.5 transition-colors",
                              h.label === "A" && t >= HOVER && "border-ink-2 bg-paper",
                            )}
                            style={{ top: (h.start - START) * HOUR + 1, height: (h.end - h.start) * HOUR - 2 }}
                          >
                            <span className="font-hand text-small leading-[16px] font-bold text-hand">{h.label}</span>
                            <span className="tnum truncate font-hand text-small leading-[16px] font-bold text-hand">{fmt(h.start)}</span>
                          </div>
                        ) : null,
                      )}
                      {booked && (
                        <Cell top={(holdA.start - START) * HOUR} height={(holdA.end - holdA.start) * HOUR} title="Sarah / sync" time="14:00–14:30" ink="var(--ink-0)" inked />
                      )}
                      <Popover open={popOpen} pressed={t >= 10550 && t < 10720} top={(holdA.start - START) * HOUR} height={(holdA.end - holdA.start) * HOUR} />
                    </>
                  )}
                </div>
              ))}
              {/* Now: Thursday, 13:24. */}
              <div
                className="pointer-events-none absolute z-30 h-[2px] bg-red-ink max-sm:left-1/3! max-sm:w-1/3!"
                style={{ top: (13.4 - START) * HOUR, left: "60%", width: "20%" }}
              >
                <span className="absolute -top-[4px] -left-[5px] size-2.5 rounded-full bg-red-ink" />
              </div>
            </div>
          </div>
        </div>

        {/* Vele's memo */}
        <div className="flex min-h-[300px] flex-col border-t-[1.5px] border-ink-2 bg-paper lg:border-t-0 lg:border-l-[1.5px]">
          <div className="band m-1.5 mb-0 flex h-10 shrink-0 items-center gap-2.5 rounded-[2px] px-2.5">
            <span className="dymo h-6 px-2 tracking-[0.3em]">Vele</span>
            <span className="text-small font-semibold text-band-ink-2">Memo</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 pt-3 pb-3">
            {t < SENT ? (
              <div className="pb-1">
                <p className="text-body font-extrabold">Write to Vele</p>
                <p className="mt-0.5 text-small text-ink-2">Ask about your time, or say what to book.</p>
              </div>
            ) : (
              <ol className="grid gap-3">
                <Row who="You">
                  <p className="font-bold text-ink">{ASK}</p>
                </Row>
                <Row who="Vele">
                  {t < REPLIED ? (
                    <span className="flex gap-1 pt-1.5">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-1.5 bg-graphite" style={{ opacity: 0.35 + 0.65 * Math.abs(Math.sin((t / 260 + i * 0.7) % Math.PI)) }} />
                      ))}
                    </span>
                  ) : (
                    <>
                      <p className="text-ink-2">Thursday afternoon is free after the gym. I’ve pencilled in three times.</p>
                      {!booked && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {HOLDS.filter((h) => t >= h.at).map((h) => (
                            <span
                              key={h.label}
                              className="pencil-hatch animate-pencil-in inline-flex items-center gap-1 rounded-[2px] border-[1.5px] border-dashed border-pencil px-1.5 font-hand text-small font-bold text-hand"
                            >
                              {h.label} {fmt(h.start)}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </Row>
                {t >= BOOK + 50 && (
                  <Row who="You">
                    <p className="font-bold text-ink">Book option A</p>
                  </Row>
                )}
                {t >= DONE && (
                  <Row who="Vele">
                    <p className="text-ink-2">Booked: Thursday 14:00–14:30 with Sarah. The invitation is on its way.</p>
                    <p className="mt-1 flex items-center gap-1 font-bold text-green-ok">
                      <Check className="size-3.5" strokeWidth={3} /> Booked
                    </p>
                  </Row>
                )}
              </ol>
            )}
          </div>
          <div className="border-t-[1.5px] border-ink-2 bg-paper-2 p-2.5">
            <div
              data-target="composer"
              className={cn(
                "flex h-10 items-center gap-2 rounded-[2px] border bg-paper pr-1 pl-3 transition-[border-color,box-shadow]",
                focused ? "border-ink-2 shadow-[0_0_0_1px_var(--ink-2)]" : "border-rule",
              )}
            >
              <span className={cn("flex min-w-0 flex-1 overflow-hidden text-small whitespace-nowrap", draft.length > 26 && "justify-end")}>
                {draft ? (
                  <span className="text-ink">
                    {draft}
                    {focused && <span className="animate-caret ml-px inline-block h-3.5 w-[1.5px] translate-y-0.5 bg-ink" />}
                  </span>
                ) : (
                  <span className="text-graphite-soft">
                    {focused && <span className="animate-caret mr-px inline-block h-3.5 w-[1.5px] translate-y-0.5 bg-ink" />}
                    Ask about your time…
                  </span>
                )}
              </span>
              <span
                data-target="send"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-[2px] transition-colors",
                  draft ? "bg-ink text-paper" : "bg-paper-2 text-graphite-soft",
                  t >= 5000 && t < 5170 && "bg-ink-2",
                )}
              >
                <ArrowUp className="size-4" />
              </span>
            </div>
          </div>
        </div>

        <Pointer t={t} path={PATH} clicks={CLICKS} layout={layout} visible={t < 12600} />
        <Fade t={t} duration={DURATION} playing={film.playing} />
      </div>
    </FilmFrame>
  );
}

function Row({ who, children }: { who: "You" | "Vele"; children: React.ReactNode }) {
  return (
    <li className="animate-pencil-in grid grid-cols-[34px_minmax(0,1fr)] gap-2 text-small">
      <span className="pt-0.5 text-micro font-extrabold text-graphite">{who}</span>
      <div>{children}</div>
    </li>
  );
}

function Cell({ top, height, title, time, ink, focus, inked }: { top: number; height: number; title: string; time: string; ink: string; focus?: boolean; inked?: boolean }) {
  return (
    <div
      className={cn("absolute inset-x-1 overflow-hidden border-[1.5px] px-1", focus && "focus-hatch", inked && "animate-ink-in z-20")}
      style={{
        top: top + 1,
        height: height - 2,
        color: "var(--ink)",
        background: `color-mix(in oklab, ${ink} 16%, var(--paper))`,
        borderColor: `color-mix(in oklab, ${ink} 70%, var(--paper))`,
      }}
    >
      <p className="truncate text-micro leading-[14px] font-bold">{title}</p>
      {height >= 36 && <p className="tnum truncate text-micro leading-[14px] font-semibold text-ink-2">{time}</p>}
    </div>
  );
}

function Popover({ open, pressed, top, height }: { open: boolean; pressed: boolean; top: number; height: number }) {
  return (
    <div
      className={cn(
        "absolute z-40 w-56 rounded-[3px] border-[1.5px] border-ink-2 bg-sheet p-3 shadow-[var(--shadow-sheet)] transition-[opacity,translate] duration-200",
        "top-[var(--pop-sm)] left-1/2 -translate-x-1/2 sm:top-[var(--pop)] sm:right-[calc(100%+8px)] sm:left-auto sm:translate-x-0",
        open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
      )}
      style={{ ["--pop" as string]: `${top - 14}px`, ["--pop-sm" as string]: `${top + height + 8}px` }}
    >
      <p className="tnum font-hand text-lead leading-tight font-bold text-hand">Thu 17 Sep, 14:00–14:30</p>
      <p className="mt-1 text-micro font-semibold text-ink-2">Option A, written in by Vele. Nothing is booked yet.</p>
      <div className="mt-2.5 flex gap-2">
        <span
          data-target="book"
          className={cn("inline-flex h-8 items-center rounded-[2px] px-3 text-small font-bold text-paper transition-colors", pressed ? "bg-ink-2" : "bg-ink")}
        >
          Book this time
        </span>
        <span className="inline-flex h-8 items-center rounded-[2px] px-2 text-small font-bold text-ink-2">Not now</span>
      </div>
    </div>
  );
}
