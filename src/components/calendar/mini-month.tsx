"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DateTime } from "luxon";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { viewRange } from "@/lib/time-client";

/**
 * The month beside the sheet: week numbers down the side the way university
 * calendars print them, the chosen day in ink and today underlined in red.
 */
export function MiniMonth({ selected, today, onSelect, highlightWeek }: { selected: DateTime; today: DateTime; onSelect: (d: DateTime) => void; highlightWeek?: boolean }) {
  const [cursor, setCursor] = useState(selected.startOf("month"));
  const [lastSelected, setLastSelected] = useState(selected);
  if (!lastSelected.hasSame(selected, "day")) {
    setLastSelected(selected);
    if (!cursor.hasSame(selected, "month")) setCursor(selected.startOf("month"));
  }
  const { days } = viewRange("month", cursor);
  const weekStart = selected.minus({ days: selected.weekday - 1 }).startOf("day");
  const weekEnd = weekStart.plus({ days: 7 });
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));

  return (
    <div className="text-wall-ink select-none">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-small font-bold">{cursor.toFormat("LLLL yyyy")}</span>
        <div className="flex">
          <button
            className="rounded-[2px] p-1 text-wall-ink-2 hover:bg-wall-hover hover:text-wall-ink"
            aria-label="Previous month"
            onClick={() => setCursor(cursor.minus({ months: 1 }))}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            className="rounded-[2px] p-1 text-wall-ink-2 hover:bg-wall-hover hover:text-wall-ink"
            aria-label="Next month"
            onClick={() => setCursor(cursor.plus({ months: 1 }))}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[22px_repeat(7,1fr)] text-center text-micro font-bold text-wall-ink-2" aria-hidden>
        <span className="py-1 text-left">Wk</span>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div role="grid" aria-label={cursor.toFormat("LLLL yyyy")}>
        {weeks.map((week) => {
          const inWeek = highlightWeek && week[0] >= weekStart && week[0] < weekEnd;
          return (
            <div key={week[0].toISODate()} role="row" className={cn("grid grid-cols-[22px_repeat(7,1fr)] rounded-[2px]", inWeek && "bg-wall-hover")}>
              <span className="tnum flex items-center text-micro font-bold text-wall-ink-2" aria-hidden>
                {week[0].weekNumber}
              </span>
              {week.map((d) => {
                const inMonth = d.hasSame(cursor, "month");
                const isToday = d.hasSame(today, "day");
                const isSelected = d.hasSame(selected, "day");
                return (
                  <button
                    key={d.toISODate()}
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-label={`${d.toFormat("cccc d LLLL")}${isToday ? ", today" : ""}`}
                    onClick={() => onSelect(d)}
                    className={cn(
                      "tnum relative mx-auto my-px flex size-7 items-center justify-center rounded-[2px] text-small font-semibold transition-colors hover:bg-wall-hover",
                      !inMonth && "text-wall-ink-2/55",
                      isSelected && "bg-ink font-extrabold text-paper hover:bg-ink",
                    )}
                  >
                    {d.day}
                    {isToday && <span className="absolute inset-x-1.5 bottom-0.5 h-[2px] rounded-full bg-red-ink" aria-hidden />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
