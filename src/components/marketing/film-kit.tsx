"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/use-client";
import { cn } from "@/lib/utils";

/**
 * A tiny toolkit for the landing page's product films: a clock that loops a
 * scripted timeline while the film is on screen, a pointer that travels
 * between measured targets and clicks them, and chapter controls so a viewer
 * can pause or jump. Everything is derived from one number, `t`, so pausing
 * and seeking are just "stop the clock" and "set the clock".
 */

export interface Chapter {
  label: string;
  start: number;
  /** A representative frame, shown instead of motion when reduced motion is on. */
  poster: number;
}

export function useFilm({ duration, chapters, poster }: { duration: number; chapters: Chapter[]; poster: number }) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const [t, setT] = useState(0);
  const [mode, setMode] = useState<"auto" | "playing" | "paused">("auto");
  const [touched, setTouched] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!frame) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    io.observe(frame);
    return () => io.disconnect();
  }, [frame]);

  const playing = inView && mode !== "paused" && (mode === "playing" || !reduced);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setT((prev) => (prev + dt) % duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const toggle = useCallback(() => {
    setTouched(true);
    setMode(playing ? "paused" : "playing");
  }, [playing]);

  const seek = useCallback(
    (i: number) => {
      setTouched(true);
      const c = chapters[i];
      setT(reduced && !playing ? c.poster : c.start);
    },
    [chapters, reduced, playing],
  );

  // With reduced motion and no interaction yet, hold a meaningful still frame.
  const shown = reduced && !touched ? poster : t;
  const chapter = Math.max(
    0,
    chapters.findLastIndex((c) => shown >= c.start),
  );
  return [setFrame, { t: shown, playing, toggle, seek, chapter, duration, chapters }] as const;
}

export type Film = ReturnType<typeof useFilm>[1];

/** Where each named target sits inside the stage, measured from the live layout. */
export function useTargets() {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{ w: number; h: number; targets: Record<string, { x: number; y: number }> }>({ w: 0, h: 0, targets: {} });

  useLayoutEffect(() => {
    if (!stage) return;
    const measure = () => {
      const box = stage.getBoundingClientRect();
      const targets: Record<string, { x: number; y: number }> = {};
      stage.querySelectorAll<HTMLElement>("[data-target]").forEach((el) => {
        const r = el.getBoundingClientRect();
        targets[el.dataset.target!] = { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
      });
      setLayout({ w: box.width, h: box.height, targets });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [stage]);

  return [setStage, layout] as const;
}

export type Waypoint = { t: number; to: string | [number, number] };

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export function progress(t: number, from: number, to: number) {
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

export function typed(text: string, t: number, start: number, perChar = 48) {
  if (t < start) return "";
  return text.slice(0, Math.min(text.length, Math.floor((t - start) / perChar) + 1));
}

export function cursorAt(t: number, path: Waypoint[], layout: { w: number; h: number; targets: Record<string, { x: number; y: number }> }) {
  const pos = (w: Waypoint) => (typeof w.to === "string" ? (layout.targets[w.to] ?? { x: layout.w / 2, y: layout.h / 2 }) : { x: w.to[0] * layout.w, y: w.to[1] * layout.h });
  if (t <= path[0].t) return pos(path[0]);
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = pos(path[i - 1]);
      const b = pos(path[i]);
      const p = ease(progress(t, path[i - 1].t, path[i].t));
      // A slight arc, the way a hand moves a mouse.
      const bow = Math.sin(Math.PI * p) * Math.min(24, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p - bow };
    }
  }
  return pos(path[path.length - 1]);
}

/** The pointer, with a press and a ring for each click. */
export function Pointer({ t, path, clicks, layout, visible }: { t: number; path: Waypoint[]; clicks: number[]; layout: ReturnType<typeof useTargets>[1]; visible: boolean }) {
  if (!layout.w) return null;
  const { x, y } = cursorAt(t, path, layout);
  const click = clicks.find((c) => t >= c && t < c + 520);
  const pressed = click != null && t < click + 170;
  const ring = click != null ? progress(t, click, click + 520) : 0;
  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-50 transition-opacity duration-300"
      style={{ transform: `translate(${x}px, ${y}px)`, opacity: visible ? 1 : 0 }}
      aria-hidden
    >
      {click != null && (
        <span className="absolute -top-5 -left-5 size-10 rounded-full border-2 border-ink-2" style={{ transform: `scale(${0.35 + ring * 0.9})`, opacity: 0.7 * (1 - ring) }} />
      )}
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        className="-mt-[2px] -ml-[3px] drop-shadow-[0_1px_0_rgb(var(--shadow-ink)/0.35)] transition-transform duration-100"
        style={{ transform: `scale(${pressed ? 0.86 : 1})`, transformOrigin: "3px 2px" }}
      >
        <path d="M3 2 L3 18.5 L7.4 14.4 L10.3 20.8 L13.1 19.6 L10.3 13.3 L16.2 13.3 Z" fill="var(--ink)" stroke="var(--paper)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** The film's frame: the stage as a sheet on the desk, and the chapter controls under it. */
export function FilmFrame({
  film,
  frame,
  label,
  children,
  className,
}: {
  film: Film;
  frame: (el: HTMLElement | null) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { t, playing, toggle, seek, chapter, chapters, duration } = film;
  return (
    <figure ref={frame} className={cn("sheet overflow-hidden", className)}>
      <figcaption className="sr-only">{label}</figcaption>
      {children}
      <div className="flex items-start gap-3 border-t border-rule px-3 pt-3 pb-3.5 sm:gap-4 sm:px-5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause the demo" : "Play the demo"}
          className="flex size-9 shrink-0 items-center justify-center rounded-[2px] border-[1.5px] border-ink-2 text-ink-2 transition-colors hover:bg-wash"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <ol className="grid flex-1 grid-cols-3 gap-3 sm:gap-5">
          {chapters.map((c, i) => {
            const end = chapters[i + 1]?.start ?? duration;
            const fill = i < chapter ? 1 : i > chapter ? 0 : progress(t, c.start, end);
            return (
              <li key={c.label}>
                <button type="button" onClick={() => seek(i)} aria-current={i === chapter ? "step" : undefined} className="group grid w-full gap-2 pt-1 text-left">
                  <span className="relative h-[3px] overflow-hidden bg-rule" aria-hidden>
                    <span className="absolute inset-y-0 left-0 bg-ink-2" style={{ width: `${fill * 100}%` }} />
                  </span>
                  <span className={cn("text-small leading-snug font-bold transition-colors", i === chapter ? "text-ink" : "text-graphite group-hover:text-ink-2")}>
                    <span className="tnum mr-1.5">{i + 1}</span>
                    {c.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}

/** A soft cut between loops, like the end of a clip. */
export function Fade({ t, duration, playing }: { t: number; duration: number; playing: boolean }) {
  if (!playing) return null;
  const out = progress(t, duration - 500, duration);
  const inn = 1 - progress(t, 0, 350);
  const o = Math.max(out, inn);
  return o > 0 ? <div className="pointer-events-none absolute inset-0 z-[60] bg-paper" style={{ opacity: o }} aria-hidden /> : null;
}
