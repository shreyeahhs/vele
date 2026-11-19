"use client";

import { ArrowLeft, CalendarPlus, Check, Clock, ExternalLink, MapPin, Phone, Video } from "lucide-react";
import { DateTime } from "luxon";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useDeviceZone } from "@/hooks/use-client";
import { ApiError, apiGet, apiSend, errorMessage } from "@/lib/fetcher";
import { MEETING_PROVIDER_LABEL, type MeetingProviderKind } from "@/lib/meeting-links";
import { durationText } from "@/lib/time-client";
import { downloadIcs, SlotPicker, type SlotsResponse } from "./slot-picker";
import { useQueryClient } from "@tanstack/react-query";

export interface PublicMeetingType {
  slug: string;
  title: string;
  description: string | null;
  durationMin: number;
  locationType: "NONE" | "IN_PERSON" | "PHONE" | "VIDEO_LINK";
  locationHint: string;
}

interface BookResult {
  bookingId: string;
  start: string;
  end: string;
  title: string;
  hostName: string;
  confirmationEmail: "sent" | "logged" | "failed" | string;
  manageUrl: string;
  meetingUrl: string | null;
  location: string | null;
  hostTimezone: string;
}

export function LocationLine({ type, hint }: { type: string; hint: string }) {
  if (type === "VIDEO_LINK") {
    const label = MEETING_PROVIDER_LABEL[hint as MeetingProviderKind] || "Video call";
    return (
      <span className="inline-flex items-center gap-1.5">
        <Video className="size-4 text-graphite" aria-hidden /> {label}
      </span>
    );
  }
  if (type === "PHONE")
    return (
      <span className="inline-flex items-center gap-1.5">
        <Phone className="size-4 text-graphite" aria-hidden /> Phone call
      </span>
    );
  if (type === "IN_PERSON")
    return (
      <span className="inline-flex items-center gap-1.5">
        <MapPin className="size-4 text-graphite" aria-hidden /> In person (address shared after booking)
      </span>
    );
  return null;
}

/** The visitor's own zone (from their browser) unless they pick another. */
export function useVisitorZone(fallback: string) {
  const device = useDeviceZone();
  const [chosen, setChosen] = useState<string | null>(null);
  return [chosen ?? device ?? fallback, setChosen] as const;
}

export function BookingFlow({
  handle,
  host,
  type,
  invite,
}: {
  handle: string;
  host: { displayName: string; headline: string | null; hostTimezone: string };
  type: PublicMeetingType;
  invite: string | null;
}) {
  const qc = useQueryClient();
  const [zone, setZone] = useVisitorZone(host.hostTimezone);
  const [start, setStart] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookResult | null>(null);
  const base = `/api/public/book/${encodeURIComponent(handle)}/${encodeURIComponent(type.slug)}`;

  const fetchSlots = (from: string, to: string) => apiGet<SlotsResponse>(`${base}/slots`, { from, to, ...(invite ? { invite } : {}) });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!start) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<BookResult>(`${base}/book`, "POST", {
        start,
        name: String(f.get("name")).trim(),
        email: String(f.get("email")).trim(),
        message: String(f.get("message") ?? "").trim() || null,
        timezone: zone,
        invite,
      });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === "slot_unavailable") {
        setError("Someone took that time a moment ago. Please pick another.");
        setStart(null);
        void qc.invalidateQueries({ queryKey: ["public-slots"] });
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) => DateTime.fromISO(iso, { zone });

  return (
    <div className="sheet grid overflow-hidden md:grid-cols-[292px_minmax(0,1fr)]">
      <div className="band m-1.5 rounded-[2px] p-5 md:mr-0 md:p-6">
        <h1 className="text-title leading-tight font-extrabold tracking-[-0.02em]">{type.title}</h1>
        <p className="mt-1 text-body font-semibold text-band-ink-2">with {host.displayName}</p>
        <ul className="mt-4 grid gap-2 border-t border-band-line pt-4 text-body font-semibold text-band-ink">
          <li className="inline-flex items-center gap-1.5">
            <Clock className="size-4 text-graphite" aria-hidden /> {durationText(type.durationMin)}
          </li>
          <li>
            <LocationLine type={type.locationType} hint={type.locationHint} />
          </li>
        </ul>
        {type.description && <p className="mt-4 text-body whitespace-pre-wrap text-band-ink-2">{type.description}</p>}
        {start && !result && (
          <div className="pencil-hatch mt-5 rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper/70 p-3 font-hand text-lead leading-snug font-bold text-hand">
            <p>{when(start).toFormat("cccc d LLLL")}</p>
            <p className="tnum">
              {when(start).toFormat("HH:mm")}–{when(start).plus({ minutes: type.durationMin }).toFormat("HH:mm")}
            </p>
          </div>
        )}
      </div>

      <div className="p-5 md:p-7">
        {result ? (
          <Confirmation result={result} zone={zone} type={type} />
        ) : start ? (
          <form className="grid max-w-md gap-4" onSubmit={submit}>
            <button type="button" onClick={() => setStart(null)} className="inline-flex items-center gap-1.5 justify-self-start text-small font-bold text-graphite hover:text-ink">
              <ArrowLeft className="size-4" /> Pick a different time
            </button>
            <h2 className="border-t-2 border-ink-2 pt-2 text-lead font-extrabold tracking-[-0.01em]">Your details</h2>
            <Field label="Name">{(a) => <Input {...a} name="name" required maxLength={100} autoComplete="name" autoFocus />}</Field>
            <Field label="Email" hint={`The confirmation goes here, and ${host.displayName.split(" ")[0]} will see it.`}>
              {(a) => <Input {...a} name="email" type="email" required maxLength={200} autoComplete="email" />}
            </Field>
            <Field label="Anything to share beforehand?" hint="Optional.">
              {(a) => <Textarea {...a} name="message" maxLength={1000} />}
            </Field>
            {error && (
              <p role="alert" className="rounded-[2px] border border-red-ink bg-red-wash px-3 py-2 text-small font-semibold text-red-ink-text">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={busy}>
              Confirm booking
            </Button>
          </form>
        ) : (
          <>
            <h2 className="mb-4 border-t-2 border-ink-2 pt-2 text-lead font-extrabold tracking-[-0.01em]">Pick a time</h2>
            {error && (
              <p role="alert" className="mb-4 rounded-[2px] border border-red-ink bg-red-wash px-3 py-2 text-small font-semibold text-red-ink-text">
                {error}
              </p>
            )}
            <SlotPicker queryKey={["public-slots", handle, type.slug, invite]} fetchSlots={fetchSlots} zone={zone} onZoneChange={setZone} onPick={setStart} />
          </>
        )}
      </div>
    </div>
  );
}

function Confirmation({ result, zone, type }: { result: BookResult; zone: string; type: PublicMeetingType }) {
  const s = DateTime.fromISO(result.start, { zone });
  const e = DateTime.fromISO(result.end, { zone });
  return (
    <div className="grid max-w-md gap-4">
      <div className="border-t-2 border-ink-2 pt-2">
        <h2 className="flex items-center gap-2 text-title leading-tight font-extrabold tracking-[-0.02em]">
          <Check className="size-6 text-green-ok" strokeWidth={3} aria-hidden /> You’re booked
        </h2>
        <p className="mt-1 text-body font-semibold text-ink-2">
          {result.title} with {result.hostName}
        </p>
      </div>
      <div className="animate-ink-in rounded-[2px] border-[1.5px] border-ink-2 bg-paper p-3.5">
        <p className="text-lead font-extrabold">{s.toFormat("cccc d LLLL yyyy")}</p>
        <p className="tnum font-semibold text-ink-2">
          {s.toFormat("HH:mm")}–{e.toFormat("HH:mm")} <span className="text-graphite">({zone.replace(/_/g, " ")})</span>
        </p>
        {result.meetingUrl && (
          <a
            href={result.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-body font-bold text-ink underline decoration-rule-strong underline-offset-2"
          >
            Meeting link <ExternalLink className="size-3.5" />
          </a>
        )}
        {result.location && <p className="mt-2 text-body text-ink-2">{result.location}</p>}
      </div>
      <p className="text-body text-ink-2">
        {result.confirmationEmail === "sent"
          ? "A confirmation with a calendar invite is on its way to your inbox."
          : result.confirmationEmail === "failed"
            ? "We couldn’t send the confirmation email, so keep the link below."
            : "Confirmation emails aren’t switched on here, so keep the link below."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            downloadIcs({
              title: `${result.title} with ${result.hostName}`,
              start: result.start,
              end: result.end,
              location: result.location,
              url: result.meetingUrl,
              description: type.description,
            })
          }
        >
          <CalendarPlus /> Add to my calendar
        </Button>
        <Button variant="ghost" asChild>
          <a href={result.manageUrl}>Change or cancel</a>
        </Button>
      </div>
    </div>
  );
}
