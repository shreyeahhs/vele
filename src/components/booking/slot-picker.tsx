"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { zoneLabel } from "@/lib/zones";
import { Skeleton } from "@/components/ui/primitives";
import { useNow, useTimeZoneOptions } from "@/hooks/use-client";
import { errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

export interface SlotsResponse {
  hostTimezone: string;
  durationMin: number;
  slots: string[];
}

/**
 * Month grid + times for the chosen day, in the visitor's own time zone.
 * Only start times come from the server; nothing about the host's events.
 */
export function SlotPicker({
  queryKey,
  fetchSlots,
  zone,
  onZoneChange,
  onPick,
  selected,
}: {
  queryKey: readonly unknown[];
  fetchSlots: (from: string, to: string) => Promise<SlotsResponse>;
  zone: string;
  onZoneChange: (z: string) => void;
  onPick: (startIso: string) => void;
  selected?: string | null;
}) {
  const now = useNow(zone);
  const today = (now ?? DateTime.now().setZone(zone)).startOf("day");
  const thisMonth = today.startOf("month");
  // null until the visitor browses: then the picker opens on the first month with free times.
  const [browsed, setBrowsed] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const zones = useTimeZoneOptions(zone);

  const monthRange = (m: DateTime) => ({ from: DateTime.max(m, today).toUTC().toISO()!, to: m.plus({ months: 1 }).toUTC().toISO()! });
  const slots = useQuery({
    queryKey: [...queryKey, zone, browsed ?? "first", today.toISODate()],
    queryFn: async () => {
      if (browsed) {
        const m = DateTime.fromISO(browsed, { zone });
        const r = monthRange(m);
        return { month: browsed, ...(await fetchSlots(r.from, r.to)) };
      }
      // Look ahead up to three months for the first free time.
      for (let i = 0; ; i++) {
        const m = thisMonth.plus({ months: i });
        const r = monthRange(m);
        const res = await fetchSlots(r.from, r.to);
        if (res.slots.length || i === 2) return { month: m.toISODate()!, ...res };
      }
    },
    staleTime: 30_000,
  });
  const month = DateTime.fromISO(browsed ?? slots.data?.month ?? thisMonth.toISODate()!, { zone }).startOf("month");
  const go = (m: DateTime) => {
    setBrowsed(m.toISODate());
    setPickedDay(null);
  };

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots.data?.slots ?? []) {
      const key = DateTime.fromISO(s, { zone }).toISODate()!;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots.data, zone]);
  const firstDay = [...byDay.keys()].sort()[0] ?? null;
  const dayIso = pickedDay && byDay.has(pickedDay) ? pickedDay : firstDay;
  const day = dayIso ? DateTime.fromISO(dayIso, { zone }) : null;

  const gridStart = month.minus({ days: month.weekday - 1 });
  const cells = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i })).filter((d, i) => i < 35 || d.hasSame(month, "month"));
  const times = day ? (byDay.get(day.toISODate()!) ?? []) : [];

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
      <div className="w-full max-w-[440px] md:max-w-none">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-body font-extrabold">{month.toFormat("LLLL yyyy")}</h3>
          <div className="flex gap-1">
            <button
              className="rounded-[2px] p-1.5 text-ink-2 hover:bg-wash hover:text-ink disabled:opacity-30"
              disabled={month <= thisMonth}
              onClick={() => go(month.minus({ months: 1 }))}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button className="rounded-[2px] p-1.5 text-ink-2 hover:bg-wash hover:text-ink" onClick={() => go(month.plus({ months: 1 }))} aria-label="Next month">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-micro font-extrabold text-ink-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        {slots.isPending ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Days in ${month.toFormat("LLLL")}`}>
            {cells.map((d) => {
              const inMonth = d.hasSame(month, "month");
              const has = byDay.has(d.toISODate()!);
              const isSel = day?.hasSame(d, "day");
              const isToday = d.hasSame(today, "day");
              return (
                <button
                  key={d.toISODate()}
                  disabled={!has || !inMonth}
                  onClick={() => setPickedDay(d.toISODate())}
                  aria-pressed={isSel}
                  aria-label={`${d.toFormat("cccc d LLLL")}${has ? `, ${byDay.get(d.toISODate()!)!.length} times free` : ", no times"}`}
                  className={cn(
                    "tnum relative flex aspect-square items-center justify-center rounded-[2px] text-body transition-colors",
                    !inMonth && "invisible",
                    has ? "bg-wash font-bold text-ink hover:bg-[color-mix(in_oklab,var(--ink-2)_16%,var(--paper))]" : "text-graphite-soft",
                    isSel && "bg-ink font-extrabold text-paper hover:bg-ink",
                  )}
                >
                  {d.day}
                  {isToday && <span className={cn("absolute inset-x-2 bottom-1 h-[2px] bg-red-ink", isSel && "bg-paper")} aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
        <label className="mt-4 flex items-center gap-2 text-small font-semibold text-graphite">
          <Globe className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Time zone</span>
          <select
            value={zone}
            onChange={(e) => onZoneChange(e.target.value)}
            className="max-w-full min-w-0 truncate rounded-[2px] bg-transparent py-1 pr-1 text-small font-bold text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {zoneLabel(z)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-40">
        {slots.isError ? (
          <p role="alert" className="text-small font-semibold text-red-ink-text">
            {errorMessage(slots.error)}
          </p>
        ) : slots.isPending ? (
          <div className="grid gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !day ? (
          <p className="text-small text-graphite">No free times in {month.toFormat("LLLL")}. Try the next month.</p>
        ) : (
          <>
            <p className="mb-2 border-b-2 border-ink-2 pb-1 text-small font-extrabold">{day.toFormat("cccc d LLLL")}</p>
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:max-h-[340px] md:grid-cols-1 md:overflow-y-auto md:pr-1">
              {times.map((t) => {
                const local = DateTime.fromISO(t, { zone });
                return (
                  <li key={t}>
                    <button
                      onClick={() => onPick(t)}
                      className={cn(
                        "tnum h-10 w-full rounded-[2px] border-[1.5px] border-rule bg-paper text-body font-bold text-ink transition-colors hover:border-ink-2 hover:bg-wash",
                        selected === t && "border-ink bg-ink text-paper hover:bg-ink",
                      )}
                    >
                      {local.toFormat("HH:mm")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** A minimal .ics so a visitor can add the booking to whatever calendar they use. */
export function downloadIcs(input: { title: string; start: string; end: string; location?: string | null; url?: string | null; description?: string | null }) {
  const stamp = (iso: string) => DateTime.fromISO(iso).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vele//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@vele`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(input.start)}`,
    `DTEND:${stamp(input.end)}`,
    `SUMMARY:${esc(input.title)}`,
    ...(input.location ? [`LOCATION:${esc(input.location)}`] : input.url ? [`LOCATION:${esc(input.url)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    ...(input.description ? [`DESCRIPTION:${esc(input.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "booking.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
