"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/primitives";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { durationText, timeRange } from "@/lib/time-client";
import { cn } from "@/lib/utils";
import type { AvailableSlot, FreeWindow } from "@/scheduling";
import { usePencil } from "./pencil-context";
import { useUI } from "./ui-context";
import { useZone } from "./zone";

type RangeKey = "today" | "tomorrow" | "this_week" | "next_week" | "next_14";
type TimeKey = "any" | "morning" | "afternoon" | "late";

interface Result {
  slots: AvailableSlot[];
  freeWindows: FreeWindow[];
  excluded: Array<{ label: string }>;
  constraintsApplied: string[];
}

/** "Check availability": the scheduling engine, directly, for when you'd rather click than type. */
export function FindTimeDialog() {
  const ui = useUI();
  return (
    <Dialog open={ui.findTimeOpen} onOpenChange={ui.setFindTimeOpen}>
      {ui.findTimeOpen && <FindTime onClose={() => ui.setFindTimeOpen(false)} />}
    </Dialog>
  );
}

function FindTime({ onClose }: { onClose: () => void }) {
  const zone = useZone();
  const ui = useUI();
  const pencil = usePencil();
  const router = useRouter();
  const [duration, setDuration] = useState(30);
  const [range, setRange] = useState<RangeKey>("this_week");
  const [time, setTime] = useState<TimeKey>("any");
  const [purpose, setPurpose] = useState<"meeting" | "personal">("meeting");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const window = () => {
    const now = DateTime.now().setZone(zone);
    const today = now.startOf("day");
    switch (range) {
      case "today":
        return [now, today.plus({ days: 1 })];
      case "tomorrow":
        return [today.plus({ days: 1 }), today.plus({ days: 2 })];
      case "this_week":
        return [now, today.minus({ days: today.weekday - 1 }).plus({ days: 7 })];
      case "next_week": {
        const mon = today.minus({ days: today.weekday - 1 }).plus({ days: 7 });
        return [mon, mon.plus({ days: 7 })];
      }
      case "next_14":
        return [now, today.plus({ days: 14 })];
    }
  };

  const search = async () => {
    setBusy(true);
    setError(null);
    const [start, end] = window();
    const timeOfDay =
      time === "morning" ? { start: "08:00", end: "12:00" } : time === "afternoon" ? { start: "12:00", end: "17:00" } : time === "late" ? { start: "15:00", end: "19:00" } : null;
    try {
      const res = await apiSend<Result>("/api/availability", "POST", {
        mode: "find",
        start: start.toUTC().toISO(),
        end: end.toUTC().toISO(),
        durationMin: duration,
        purpose,
        timeOfDay,
        maxResults: 8,
      });
      setResult(res);
      pencil.setProposals(
        res.slots.map((s, i) => ({
          start: new Date(s.start).toISOString(),
          end: new Date(s.end).toISOString(),
          label: "ABCDEFGH"[i],
          status: s.status,
          notes: s.reasons.map((r) => r.label),
        })),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const choose = (s: AvailableSlot) => {
    onClose();
    ui.openEventDialog({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() });
  };

  return (
    <DialogContent title="Find time" description="Free slots from your calendar, after working hours, buffers, lunch and focus time." wide>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Length">
          {(p) => (
            <Select {...p} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {durationText(m)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="When">
          {(p) => (
            <Select {...p} value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="this_week">This week</option>
              <option value="next_week">Next week</option>
              <option value="next_14">Next two weeks</option>
            </Select>
          )}
        </Field>
        <Field label="Time of day">
          {(p) => (
            <Select {...p} value={time} onChange={(e) => setTime(e.target.value as TimeKey)}>
              <option value="any">Any time</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="late">Late afternoon</option>
            </Select>
          )}
        </Field>
        <Field label="For">
          {(p) => (
            <Select {...p} value={purpose} onChange={(e) => setPurpose(e.target.value as "meeting" | "personal")}>
              <option value="meeting">A meeting</option>
              <option value="personal">Personal plans</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={search} loading={busy}>
          Find time
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-small font-semibold text-red-ink-text">
          {error}
        </p>
      )}
      {result && (
        <div className="grid gap-3">
          {result.slots.length === 0 ? (
            <p className="text-body text-graphite">Nothing fits. {result.excluded.map((e) => e.label).join(". ")}</p>
          ) : (
            <ul className="grid gap-1.5">
              {result.slots.map((s, i) => (
                <li key={s.start}>
                  <button
                    onClick={() => choose(s)}
                    className={cn(
                      "pencil-hatch group flex w-full items-start gap-3 rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper/60 px-3 py-2 text-left hover:border-ink-2 hover:bg-paper",
                      s.status === "flagged" && "border-amber",
                    )}
                  >
                    <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-[2px] border-[1.5px] border-pencil bg-paper font-hand text-small font-bold text-hand group-hover:border-ink-2 group-hover:bg-ink-2 group-hover:text-paper">
                      {"ABCDEFGH"[i]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="tnum block font-hand text-lead leading-tight font-bold text-hand">
                        {DateTime.fromMillis(s.start, { zone }).toFormat("cccc d LLL")} · {timeRange(new Date(s.start).toISOString(), new Date(s.end).toISOString(), zone)}
                      </span>
                      <span className="block text-small font-medium text-ink-2">{s.reasons.map((r) => r.label).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
            <p className="text-small text-graphite">{result.constraintsApplied.slice(0, 3).join(" · ")}</p>
            {result.slots.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  router.push(`/calendar?view=week&date=${DateTime.fromMillis(result.slots[0].start, { zone }).toISODate()}`);
                }}
              >
                Show on calendar
              </Button>
            )}
          </div>
        </div>
      )}
    </DialogContent>
  );
}
