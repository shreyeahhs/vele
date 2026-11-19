"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Fade, FilmFrame, Pointer, typed, useFilm, useTargets, type Chapter, type Waypoint } from "./film-kit";

/**
 * Film two: a visitor opens your booking link, picks a free time and books
 * it; then the scene cuts to your sheet, where the booking lands in print.
 */

const PICK_DAY = 1900;
const TIMES_AT = 2000;
const PICK_TIME = 3400;
const FORM_AT = 3600;
const NAME_AT = 3950;
const EMAIL_AT = 4750;
const CONFIRM = 6250;
const BOOKED = 6500;
const CUT = 7400;
const LANDS = 8100;
const TOAST = 8600;
const DURATION = 12400;

const CHAPTERS: Chapter[] = [
  { label: "They open your link", start: 0, poster: 2800 },
  { label: "They pick a time", start: 3300, poster: 5900 },
  { label: "It lands on your sheet", start: CUT, poster: 9800 },
];

const PATH: Waypoint[] = [
  { t: 0, to: [0.78, 0.88] },
  { t: 700, to: [0.78, 0.88] },
  { t: 1700, to: "day22" },
  { t: 2600, to: "day22" },
  { t: 3300, to: "time" },
  { t: 3500, to: "time" },
  { t: 3800, to: "name" },
  { t: 4500, to: "name" },
  { t: 4650, to: "email" },
  { t: 5650, to: "email" },
  { t: 6200, to: "confirm" },
  { t: 6600, to: "confirm" },
  { t: 7200, to: [0.8, 0.9] },
  { t: DURATION, to: [0.8, 0.9] },
];
const CLICKS = [1800, 3350, 3800, 4650, 6250];

const TIMES = ["09:30", "10:00", "11:30", "14:00", "15:30"];
const FREE = new Set([21, 22, 23, 24, 25, 28, 29, 30]);
// September 2026 starts on a Tuesday.
const CELLS: Array<number | null> = [null, ...Array.from({ length: 30 }, (_, i) => i + 1)];

export function LinkFilm() {
  const [setFrame, film] = useFilm({ duration: DURATION, chapters: CHAPTERS, poster: 9800 });
  const [setStage, layout] = useTargets();
  const { t } = film;
  const sceneB = t >= CUT;
  const step = t >= BOOKED ? "booked" : t >= FORM_AT ? "form" : t >= TIMES_AT ? "times" : "idle";

  return (
    <FilmFrame
      film={film}
      frame={setFrame}
      label="A short demo: a visitor opens a booking link, picks Tuesday 22 September at 10:00, enters their name and email and confirms. The booking then appears, printed, on the host's week."
    >
      <div ref={setStage} className="relative grid [&>*]:col-start-1 [&>*]:row-start-1" aria-hidden>
        {/* Scene A: the visitor's booking page */}
        <div className={cn("flex flex-col transition-opacity duration-300", sceneB ? "opacity-0" : "opacity-100")}>
          <div className="band m-1.5 mb-0 rounded-[2px] px-4 pt-3.5 pb-3">
            <p className="text-lead font-extrabold tracking-[-0.01em]">Intro call · 30 min</p>
            <p className="text-small font-semibold text-band-ink-2">with Amara Okafor</p>
          </div>
          <div className="grid flex-1 gap-4 p-4 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div>
              <p className="mb-2 text-small font-extrabold">September 2026</p>
              <div className="grid grid-cols-7 gap-1 text-center text-micro font-extrabold text-ink-2">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {CELLS.map((d, i) =>
                  d == null ? (
                    <span key={i} />
                  ) : (
                    <span
                      key={i}
                      data-target={d === 22 ? "day22" : undefined}
                      className={cn(
                        "tnum relative flex h-8 items-center justify-center rounded-[2px] text-small transition-colors",
                        FREE.has(d) ? "bg-wash font-bold text-ink" : "text-graphite-soft",
                        d === 22 && t >= PICK_DAY && "bg-ink font-extrabold text-paper",
                        d === 22 && t >= 1300 && t < PICK_DAY && "bg-[color-mix(in_oklab,var(--ink-2)_18%,var(--paper))]",
                      )}
                    >
                      {d}
                      {d === 19 && <span className="absolute inset-x-2 bottom-1 h-[2px] bg-red-ink" />}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="grid min-h-[210px] [&>*]:col-start-1 [&>*]:row-start-1">
              <Layer on={step === "idle"}>
                <p className="max-w-[24ch] pt-7 text-small text-graphite">Pick a day to see the times Amara is free.</p>
              </Layer>
              <Layer on={step === "times"}>
                <p className="mb-2 border-b-2 border-ink-2 pb-1 text-small font-extrabold">Tuesday 22 September</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {TIMES.map((time) => (
                    <span
                      key={time}
                      data-target={time === "10:00" ? "time" : undefined}
                      className={cn(
                        "tnum flex h-8 items-center justify-center rounded-[2px] border-[1.5px] text-small font-bold transition-colors",
                        time === "10:00" && t >= PICK_TIME ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink",
                        time === "10:00" && t >= 2900 && t < PICK_TIME && "border-ink-2 bg-wash",
                      )}
                    >
                      {time}
                    </span>
                  ))}
                </div>
              </Layer>
              <Layer on={step === "form"}>
                <p className="mb-2 border-b-2 border-ink-2 pb-1 text-small font-extrabold">Tue 22 Sep, 10:00–10:30</p>
                <Field label="Name" target="name" value={typed("Sarah Test", t, NAME_AT)} focused={t >= 3800 && t < 4650} />
                <Field label="Email" target="email" value={typed("sarah@example.com", t, EMAIL_AT)} focused={t >= 4650 && t < CONFIRM} />
                <span
                  data-target="confirm"
                  className={cn(
                    "mt-2.5 flex h-9 items-center justify-center rounded-[2px] text-small font-bold text-paper transition-colors",
                    t >= CONFIRM && t < CONFIRM + 170 ? "bg-ink-2" : "bg-ink",
                  )}
                >
                  Confirm booking
                </span>
              </Layer>
              <Layer on={step === "booked"}>
                <div className="animate-ink-in pt-4">
                  <p className="flex items-center gap-1.5 text-lead font-extrabold">
                    <Check className="size-5 text-green-ok" strokeWidth={3} /> You’re booked
                  </p>
                  <p className="tnum mt-1 text-small font-bold text-ink-2">Tuesday 22 September, 10:00–10:30</p>
                  <p className="mt-1 text-small text-graphite">A confirmation is on its way to your inbox.</p>
                </div>
              </Layer>
            </div>
          </div>
        </div>

        {/* Scene B: the host's sheet */}
        <div className={cn("flex flex-col transition-opacity duration-500", sceneB ? "opacity-100" : "opacity-0")}>
          <HostWeek t={t} />
        </div>

        <Pointer t={t} path={PATH} clicks={CLICKS} layout={layout} visible={t < 6900} />
        <Fade t={t} duration={DURATION} playing={film.playing} />
      </div>
    </FilmFrame>
  );
}

function Layer({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <div className={cn("transition-opacity duration-200", on ? "opacity-100" : "pointer-events-none opacity-0")}>{children}</div>;
}

function Field({ label, target, value, focused }: { label: string; target: string; value: string; focused: boolean }) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-micro font-bold text-ink-2">{label}</p>
      <div
        data-target={target}
        className={cn(
          "flex h-8 items-center rounded-[2px] border bg-paper px-2 text-small text-ink transition-[border-color,box-shadow]",
          focused ? "border-ink-2 shadow-[0_0_0_1px_var(--ink-2)]" : "border-rule",
        )}
      >
        {value}
        {focused && <span className="animate-caret ml-px inline-block h-3.5 w-[1.5px] bg-ink" />}
      </div>
    </div>
  );
}

const HOST_DAYS = ["Mon 21", "Tue 22", "Wed 23", "Thu 24", "Fri 25"];
const H_START = 9;
const H_END = 14;
const HOST_WEEK = [
  { day: 0, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 0, start: 11, end: 12, title: "Design review", ink: "var(--ink-0)" },
  { day: 1, start: 11.5, end: 12.5, title: "Lunch with Priya", ink: "var(--ink-1)" },
  { day: 2, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
  { day: 2, start: 12, end: 13, title: "Roadmap", ink: "var(--ink-0)" },
  { day: 3, start: 10, end: 11, title: "Customer call", ink: "var(--ink-3)" },
  { day: 4, start: 9.5, end: 10, title: "Stand-up", ink: "var(--ink-0)" },
];

function HostWeek({ t }: { t: number }) {
  const span = H_END - H_START;
  const pct = (h: number) => `${((h - H_START) / span) * 100}%`;
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="band flex border-b-2 border-ink-2">
        <div className="tnum flex w-12 shrink-0 items-end justify-end pr-2 pb-2 text-micro font-extrabold text-band-ink-2">Wk 39</div>
        {HOST_DAYS.map((d, i) => (
          <div key={d} className={cn("min-w-0 flex-1 border-l border-band-line px-2 py-2 text-small font-extrabold", i > 2 && "hidden sm:block")}>
            {d}
          </div>
        ))}
      </div>
      <div className="relative flex flex-1">
        <div className="relative w-12 shrink-0">
          {Array.from({ length: span - 1 }, (_, i) => (
            <span key={i} className="tnum absolute right-2 -translate-y-1/2 text-micro font-extrabold text-ink-2" style={{ top: pct(H_START + i + 1) }}>
              {H_START + i + 1}:00
            </span>
          ))}
        </div>
        <div className="relative flex flex-1">
          <div className="absolute inset-y-0 left-0 z-10 w-[1.5px] bg-ink-2" />
          {Array.from({ length: span - 1 }, (_, i) => (
            <div key={i} className="absolute inset-x-0 h-px bg-rule-strong" style={{ top: pct(H_START + i + 1) }} />
          ))}
          {HOST_DAYS.map((d, day) => (
            <div key={d} className={cn("relative flex-1 border-l border-rule first:border-l-0", day > 2 && "hidden sm:block", day === 1 && "bg-wash/50")}>
              {HOST_WEEK.filter((e) => e.day === day).map((e, i) => (
                <HostCell key={i} top={pct(e.start)} height={`${((e.end - e.start) / span) * 100}%`} title={e.title} ink={e.ink} />
              ))}
              {day === 1 && t >= LANDS && <HostCell top={pct(10)} height={`${(0.5 / span) * 100}%`} title="Sarah Test" ink="var(--ink-4)" inked />}
            </div>
          ))}
        </div>
      </div>
      {t >= TOAST && (
        <div className="animate-pencil-in absolute right-3 bottom-3 z-40 w-64 rounded-[2px] border-[1.5px] border-ink-2 bg-sheet p-3 shadow-[var(--shadow-sheet)]">
          <p className="flex items-center gap-2 text-small font-extrabold">
            <span className="dymo h-5 px-1.5">Link</span> New booking
          </p>
          <p className="mt-1 text-small text-ink-2">Sarah Test booked Intro call for Tue 22 Sep, 10:00.</p>
        </div>
      )}
    </div>
  );
}

function HostCell({ top, height, title, ink, inked }: { top: string; height: string; title: string; ink: string; inked?: boolean }) {
  return (
    <div
      className={cn("absolute inset-x-1 overflow-hidden border-[1.5px] px-1", inked && "animate-ink-in z-20")}
      style={{ top, height, color: "var(--ink)", background: `color-mix(in oklab, ${ink} 16%, var(--paper))`, borderColor: `color-mix(in oklab, ${ink} 70%, var(--paper))` }}
    >
      <p className="truncate text-micro leading-[14px] font-bold">{title}</p>
    </div>
  );
}
