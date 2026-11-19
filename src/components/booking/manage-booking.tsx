"use client";

import { CalendarClock, CalendarPlus, ExternalLink, X } from "lucide-react";
import { DateTime } from "luxon";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/primitives";
import { ApiError, apiGet, apiSend, errorMessage } from "@/lib/fetcher";
import { durationText } from "@/lib/time-client";
import { downloadIcs, SlotPicker, type SlotsResponse } from "./slot-picker";

export interface ManagedBooking {
  title: string;
  status: string;
  start: string;
  end: string;
  hostName: string;
  hostTimezone: string;
  inviteeName: string;
  inviteeTimezone: string;
  meetingUrl: string | null;
  location: string | null;
  handle: string | null;
  slug: string | null;
  durationMin: number;
  canChange: boolean;
  /** False when the meeting type behind the booking was removed: it can still be cancelled. */
  canReschedule: boolean;
}

type Mode = "view" | "reschedule" | "confirm-move" | "cancel";

export function ManageBooking({ token, initial }: { token: string; initial: ManagedBooking }) {
  const [b, setB] = useState(initial);
  const [zone, setZone] = useState(initial.inviteeTimezone);
  const [mode, setMode] = useState<Mode>("view");
  const [newStart, setNewStart] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/api/public/booking/${encodeURIComponent(token)}`;

  const s = DateTime.fromISO(b.start, { zone });
  const e = DateTime.fromISO(b.end, { zone });
  const cancelled = b.status === "CANCELLED";

  const emailNote = (status: string | undefined, what: string) =>
    status === "sent" ? `${b.hostName.split(" ")[0]} has been told, and you’ll get an email ${what}.` : `${b.hostName.split(" ")[0]} will see the change in their calendar.`;

  const move = async () => {
    if (!newStart) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ start: string; end: string; emailStatus?: string }>(`${base}/reschedule`, "POST", { start: newStart });
      setB({ ...b, start: res.start, end: res.end });
      setNotice(`Moved. ${emailNote(res.emailStatus, "with the new time")}`);
      setMode("view");
      setNewStart(null);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "slot_unavailable" ? "That time is no longer available. Please pick another." : errorMessage(err));
      if (err instanceof ApiError && err.code === "slot_unavailable") setMode("reschedule");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ emailStatus?: string }>(`${base}/cancel`, "POST", { reason: reason.trim() || null });
      setB({ ...b, status: "CANCELLED", canChange: false, canReschedule: false, meetingUrl: null, location: null });
      setNotice(`Cancelled. ${emailNote(res.emailStatus, "confirming it")}`);
      setMode("view");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div className="sheet overflow-hidden">
        <div className="band m-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[2px] px-5 pt-6 pb-5">
          <h1 className={`text-title leading-tight font-extrabold tracking-[-0.02em] ${cancelled ? "line-through decoration-red-ink" : ""}`}>
            {b.title} with {b.hostName}
          </h1>
          {cancelled && <Badge tone="red">Cancelled</Badge>}
          {!cancelled && !b.canChange && <Badge>Past</Badge>}
        </div>
        <div className="px-5 pt-3 pb-5 md:px-6">
          <p className="text-lead font-extrabold">{s.toFormat("cccc d LLLL yyyy")}</p>
          <p className="tnum text-body font-semibold text-ink-2">
            {s.toFormat("HH:mm")}–{e.toFormat("HH:mm")} · {durationText(b.durationMin)} <span className="text-graphite">({zone.replace(/_/g, " ")})</span>
          </p>
          {b.meetingUrl && (
            <Button asChild variant="primary" className="mt-4">
              <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer">
                Join the call <ExternalLink />
              </a>
            </Button>
          )}
          {b.location && <p className="mt-3 text-body text-ink-2">{b.location}</p>}
          {notice && <p className="mt-4 rounded-[2px] border-[1.5px] border-ink-2 bg-paper-2 px-3 py-2 text-body font-semibold text-ink">{notice}</p>}
          {!cancelled && mode === "view" && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4">
              <Button
                variant="secondary"
                onClick={() => downloadIcs({ title: `${b.title} with ${b.hostName}`, start: b.start, end: b.end, location: b.location, url: b.meetingUrl })}
              >
                <CalendarPlus /> Add to my calendar
              </Button>
              {b.canChange && (
                <>
                  {b.canReschedule && (
                    <Button variant="ghost" onClick={() => setMode("reschedule")}>
                      <CalendarClock /> Reschedule
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setMode("cancel")}>
                    <X /> Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-[2px] border border-red-ink bg-red-wash px-3 py-2 text-small font-semibold text-red-ink-text">
          {error}
        </p>
      )}

      {mode === "reschedule" && (
        <section className="sheet p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3 border-t-2 border-ink-2 pt-2">
            <h2 className="text-lead font-extrabold tracking-[-0.01em]">Pick a new time</h2>
            <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
              Never mind
            </Button>
          </div>
          <SlotPicker
            queryKey={["manage-slots", token]}
            fetchSlots={(from, to) => apiGet<SlotsResponse>(`${base}/slots`, { from, to })}
            zone={zone}
            onZoneChange={setZone}
            onPick={(t) => {
              setNewStart(t);
              setMode("confirm-move");
            }}
          />
        </section>
      )}

      {mode === "confirm-move" && newStart && (
        <section className="pencil-hatch grid gap-3 rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper p-5">
          <p className="text-body font-semibold">
            Move to <span className="font-hand text-lead font-bold text-hand">{DateTime.fromISO(newStart, { zone }).toFormat("cccc d LLLL, HH:mm")}</span>?
          </p>
          <div className="flex gap-2">
            <Button variant="primary" loading={busy} onClick={move}>
              Move my booking
            </Button>
            <Button variant="ghost" onClick={() => setMode("reschedule")}>
              Pick another time
            </Button>
          </div>
        </section>
      )}

      {mode === "cancel" && (
        <section className="sheet grid gap-3 p-5">
          <h2 className="border-t-2 border-red-ink pt-2 text-lead font-extrabold tracking-[-0.01em]">Cancel this booking?</h2>
          <Field label={`A note for ${b.hostName.split(" ")[0]} (optional)`}>
            {(a) => <Textarea {...a} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={300} />}
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" loading={busy} onClick={cancel}>
              Cancel booking
            </Button>
            <Button variant="ghost" onClick={() => setMode("view")}>
              Keep it
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
