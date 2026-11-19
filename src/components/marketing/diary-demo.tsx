"use client";

import { Check, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-client";
import { cn } from "@/lib/utils";

/**
 * A scripted booking sheet for the landing page: the real product's visual
 * language (the printed band, banded hour rows, calendar inks, holds written
 * in marker, the red now line), driven by canned requests. Nothing here talks
 * to a server.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DATES = [14, 15, 16, 17, 18];
const TODAY = 3;
const START = 9;
const END = 18;
const HOUR = 38;
const GUTTER = 48;

type Ev = { day: number; start: number; end: number; title: string; ink: string; kind?: "focus" };
type Option = { label: string; day: number; start: number; end: number; note: string; flagged?: boolean };

const WEEK: Ev[] = [
  { day: 0, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 0, start: 11, end: 12.5, title: "Design review", ink: "var(--ink-0)" },
  { day: 0, start: 15, end: 16, title: "1:1 with Amara", ink: "var(--ink-4)" },
  { day: 1, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 1, start: 10.5, end: 12.5, title: "Focus", ink: "var(--ink-5)", kind: "focus" },
  { day: 1, start: 13, end: 14, title: "Lunch with Priya", ink: "var(--ink-1)" },
  { day: 1, start: 16, end: 17, title: "Hiring panel", ink: "var(--ink-2c)" },
  { day: 2, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 2, start: 13, end: 14, title: "Roadmap", ink: "var(--ink-0)" },
  { day: 2, start: 14, end: 15, title: "Vendor call", ink: "var(--ink-3)" },
  { day: 2, start: 15, end: 16, title: "Team retro", ink: "var(--ink-0)" },
  { day: 2, start: 16, end: 16.5, title: "Invoices", ink: "var(--ink-6)" },
  { day: 3, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 3, start: 12.5, end: 13.5, title: "Gym", ink: "var(--ink-1)" },
  { day: 4, start: 10, end: 11, title: "Customer call", ink: "var(--ink-3)" },
  { day: 4, start: 14.5, end: 15.5, title: "Demo prep", ink: "var(--ink-0)" },
];

interface Scenario {
  ask: string;
  reply: string;
  options: Option[];
  inked?: (o: Option) => { title: string; ink: string; kind?: "focus"; done: string };
}

const SCENARIOS: Scenario[] = [
  {
    ask: "Find 30 minutes with Sarah on Thursday afternoon",
    reply: "Thursday afternoon is open after the gym. All three keep your 10 minute gaps; A is the soonest, C runs into the end of your working day.",
    options: [
      { label: "A", day: 3, start: 14, end: 14.5, note: "Soonest, after the gym" },
      { label: "B", day: 3, start: 15.5, end: 16, note: "Mid-afternoon" },
      { label: "C", day: 3, start: 17, end: 17.5, note: "Last half hour of your day", flagged: true },
    ],
    inked: () => ({
      title: "Sarah / sync",
      ink: "var(--ink-0)",
      done: "Booked: Thursday 14:00–14:30 with Sarah, and the invitation went to the address you gave me.",
    }),
  },
  {
    ask: "Protect two hours for deep work tomorrow",
    reply: "Friday has two clear stretches long enough. A follows your customer call; B takes the end of the day, with nothing after it.",
    options: [
      { label: "A", day: 4, start: 11.25, end: 13.25, note: "After the customer call" },
      { label: "B", day: 4, start: 15.75, end: 17.75, note: "End of the day" },
    ],
    inked: () => ({ title: "Deep work", ink: "var(--ink-5)", kind: "focus", done: "Blocked. It shows as busy, so your booking page won’t offer it either." }),
  },
  {
    ask: "How busy am I this week?",
    reply: "16 bookings, about 13 hours. Wednesday is the heavy one: four back to back from 13:00. What’s left of Thursday is wide open, 4½ hours after the gym.",
    options: [],
  },
];

function fmt(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

type Phase = "idle" | "typing" | "thinking" | "pencilled" | "inked";

export function DiaryDemo({ interactive = true, className }: { interactive?: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const [scenario, setScenario] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [picked, setPicked] = useState<Option | null>(null);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const run = (i: number) => {
    clear();
    const s = SCENARIOS[i];
    setScenario(i);
    setPicked(null);
    if (reduced) {
      setTyped(s.ask);
      setPhase("pencilled");
      return;
    }
    setPhase("typing");
    setTyped("");
    const step = 22;
    for (let k = 1; k <= s.ask.length; k++) timers.current.push(window.setTimeout(() => setTyped(s.ask.slice(0, k)), k * step));
    const typedAt = s.ask.length * step + 200;
    timers.current.push(window.setTimeout(() => setPhase("thinking"), typedAt));
    timers.current.push(window.setTimeout(() => setPhase("pencilled"), typedAt + 900));
  };

  const ink = (o: Option) => {
    setPicked(o);
    setPhase("inked");
  };

  const reset = () => {
    clear();
    setScenario(null);
    setTyped("");
    setPhase("idle");
    setPicked(null);
  };

  const s = scenario != null ? SCENARIOS[scenario] : null;
  const showOptions = phase === "pencilled" && s ? s.options : [];
  const inkedEvent = phase === "inked" && s?.inked && picked ? s.inked(picked) : null;

  return (
    <div className={cn("overflow-hidden rounded-[2px] border-[1.5px] border-ink-2 bg-paper", className)}>
      {/* The printed head of the sheet */}
      <div className="band flex border-b-2 border-ink-2" style={{ paddingLeft: GUTTER }}>
        {DAYS.map((d, i) => (
          <div key={d} className={cn("flex min-w-0 flex-1 items-baseline gap-1.5 border-l border-band-line px-1.5 py-1.5 sm:px-2", i === TODAY && "bg-paper")}>
            <span className="hidden text-micro font-extrabold uppercase sm:inline">{d}</span>
            <span className="text-micro font-extrabold uppercase sm:hidden">{d[0]}</span>
            <span className={cn("tnum relative text-body font-extrabold", i === TODAY && "text-red-ink-text")}>
              {DATES[i]}
              {i === TODAY && <span className="absolute inset-x-0 -bottom-0.5 h-[2px] bg-red-ink" aria-hidden />}
            </span>
          </div>
        ))}
      </div>
      <div className="relative flex" style={{ height: (END - START) * HOUR }}>
        <div className="relative shrink-0" style={{ width: GUTTER }} aria-hidden>
          {Array.from({ length: END - START - 1 }, (_, i) => (
            <span key={i} className="tnum absolute right-2 -translate-y-1/2 text-micro font-extrabold text-ink-2" style={{ top: (i + 1) * HOUR }}>
              {START + i + 1}:00
            </span>
          ))}
        </div>
        <div className="graph-ruling relative flex flex-1" style={{ ["--hour" as string]: `${HOUR}px` }}>
          <div className="absolute inset-y-0 left-0 z-10 w-[1.5px] bg-ink-2" aria-hidden />
          {DAYS.map((d, day) => (
            <div key={d} className={cn("relative flex-1 border-l border-rule first:border-l-0", day === TODAY && "bg-wash/60")}>
              {WEEK.filter((e) => e.day === day).map((e, i) => (
                <Block
                  key={i}
                  top={(e.start - START) * HOUR}
                  height={(e.end - e.start) * HOUR}
                  title={e.title}
                  time={`${fmt(e.start)}–${fmt(e.end)}`}
                  ink={e.ink}
                  focus={e.kind === "focus"}
                />
              ))}
              {showOptions
                .filter((o) => o.day === day)
                .map((o) => (
                  <button
                    key={o.label}
                    disabled={!interactive}
                    onClick={() => ink(o)}
                    className={cn(
                      "pencil-hatch animate-pencil-in absolute inset-x-[3px] z-20 flex items-start gap-1 rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper/60 px-1 text-left transition-colors enabled:hover:border-ink-2",
                      o.flagged && "border-amber",
                    )}
                    style={{ top: (o.start - START) * HOUR + 1, height: (o.end - o.start) * HOUR - 2 }}
                    aria-label={`Option ${o.label}, ${DAYS[o.day]} ${fmt(o.start)} to ${fmt(o.end)}. ${o.note}`}
                  >
                    <span className="font-hand text-small leading-[16px] font-bold text-hand">{o.label}</span>
                    <span className="tnum truncate font-hand text-small leading-[16px] font-bold text-hand">{fmt(o.start)}</span>
                  </button>
                ))}
              {inkedEvent && picked && picked.day === day && (
                <Block
                  top={(picked.start - START) * HOUR}
                  height={(picked.end - picked.start) * HOUR}
                  title={inkedEvent.title}
                  time={`${fmt(picked.start)}–${fmt(picked.end)}`}
                  ink={inkedEvent.ink}
                  focus={inkedEvent.kind === "focus"}
                  inked
                />
              )}
            </div>
          ))}
          <div className="pointer-events-none absolute z-30 h-[2px] bg-red-ink" style={{ top: (13.4 - START) * HOUR, left: `${(TODAY / 5) * 100}%`, width: "20%" }} aria-hidden>
            <span className="absolute -top-[4px] -left-[5px] size-2.5 rounded-full bg-red-ink" />
          </div>
          <span className="sr-only">It is Thursday, 13:24.</span>
        </div>
      </div>

      {/* The conversation, logged beneath the sheet the way the app logs it */}
      {interactive && (
        <div className="border-t-[1.5px] border-ink-2 bg-paper-2">
          {s && (
            <ol className="grid gap-2.5 px-3 pt-3 pb-1" aria-live="polite">
              <li className="grid grid-cols-[40px_minmax(0,1fr)] gap-2">
                <span className="pt-px text-micro font-extrabold text-graphite">You</span>
                <p className="text-small font-bold text-ink">
                  {typed}
                  {phase === "typing" && <span className="animate-caret ml-px inline-block h-3.5 w-[1.5px] translate-y-0.5 bg-ink" />}
                </p>
              </li>
              {phase !== "typing" && (
                <li className="grid grid-cols-[40px_minmax(0,1fr)] gap-2">
                  <span className="pt-px text-micro font-extrabold text-graphite">Vele</span>
                  {phase === "thinking" ? (
                    <p className="text-small text-graphite">Reading your week…</p>
                  ) : (
                    <div className="grid gap-2 text-small text-ink-2">
                      <p className="max-w-[55ch]">{phase === "inked" && inkedEvent ? inkedEvent.done : s.reply}</p>
                      {phase === "pencilled" && s.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {s.options.map((o) => (
                            <button
                              key={o.label}
                              onClick={() => ink(o)}
                              className="pencil-hatch flex items-center gap-1.5 rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper/70 px-2 py-0.5 font-hand text-small font-bold text-hand hover:border-ink-2"
                            >
                              {o.label}
                              <span className="tnum">
                                {DAYS[o.day]} {fmt(o.start)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {phase === "inked" && (
                        <p className="flex items-center gap-1.5 text-small font-bold text-green-ok">
                          <Check className="size-3.5" /> Booked
                        </p>
                      )}
                    </div>
                  )}
                </li>
              )}
            </ol>
          )}
          <div className="flex items-baseline justify-between gap-3 px-3 pt-2.5">
            <p className="text-small font-extrabold text-ink">{s ? "Try another" : "Pick something to ask"}</p>
            {s && (
              <button onClick={reset} className="inline-flex items-center gap-1 text-micro font-bold text-graphite hover:text-ink" aria-label="Reset the demo">
                <RotateCcw className="size-3" /> Reset
              </button>
            )}
          </div>
          <ul className="mt-1 px-3 pb-2">
            {SCENARIOS.map((sc, i) => (
              <li key={i} className="border-t border-rule">
                <button
                  onClick={() => run(i)}
                  disabled={phase === "typing" || phase === "thinking"}
                  aria-pressed={scenario === i}
                  className={cn(
                    "w-full rounded-[2px] px-1 py-1.5 text-left text-small font-semibold text-ink-2 transition-colors hover:bg-wash hover:text-ink disabled:opacity-50",
                    scenario === i && "font-extrabold text-ink",
                  )}
                >
                  “{sc.ask}”
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Block({ top, height, title, time, ink, focus, inked }: { top: number; height: number; title: string; time: string; ink: string; focus?: boolean; inked?: boolean }) {
  const compact = height < 36;
  return (
    <div
      className={cn("absolute inset-x-[3px] overflow-hidden border-[1.5px] px-1", focus && "focus-hatch", inked && "animate-ink-in z-20")}
      style={{
        top: top + 1,
        height: height - 2,
        color: "var(--ink)",
        background: `color-mix(in oklab, ${ink} 16%, var(--paper))`,
        borderColor: `color-mix(in oklab, ${ink} 70%, var(--paper))`,
      }}
    >
      <p className="truncate text-micro leading-[14px] font-bold">{title}</p>
      {!compact && <p className="tnum truncate text-micro leading-[14px] font-semibold text-ink-2">{time}</p>}
    </div>
  );
}
