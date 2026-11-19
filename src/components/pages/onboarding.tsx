"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDeviceZone, useTimeZoneOptions } from "@/hooks/use-client";
import { zoneLabel } from "@/lib/zones";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, TimeSelect } from "@/components/ui/field";
import { Switch } from "@/components/ui/primitives";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "9-5", label: "09:00 – 17:00", start: "09:00", end: "17:00" },
  { id: "8-4", label: "08:00 – 16:00", start: "08:00", end: "16:00" },
  { id: "10-6", label: "10:00 – 18:00", start: "10:00", end: "18:00" },
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Onboarding({ name: initialName, timezone }: { name: string; timezone: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const device = useDeviceZone();
  const [chosenZone, setZone] = useState<string | null>(null);
  // New accounts start in Europe/London; prefer this device's zone if it differs.
  const zone = chosenZone ?? (timezone === "Europe/London" && device ? device : timezone);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [lunch, setLunch] = useState(true);
  const [video, setVideo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = useTimeZoneOptions(zone);
  const router = useRouter();

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/me", "PATCH", { name: name.trim(), timezone: zone });
      await apiSend("/api/preferences", "PUT", {
        workingHours: days.map((day) => ({ day, start, end })),
        lunch: lunch ? { start: "12:30", end: "13:30" } : null,
        ...(video.trim() ? { defaultVideoLink: video.trim() } : {}),
      });
      await apiSend("/api/me", "PATCH", { onboarded: true });
      router.replace("/today");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const steps = [
    {
      title: "First, the basics",
      body: (
        <div className="grid gap-4">
          <Field label="What should Vele call you?">{(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />}</Field>
          <Field label="Your time zone" hint="Every time is shown in this zone. Change it any time in Settings.">
            {(a) => (
              <Select {...a} value={zone} onChange={(e) => setZone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {zoneLabel(z)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      ),
      valid: name.trim().length > 0,
    },
    {
      title: "When do you usually work?",
      body: (
        <div className="grid gap-5">
          <div className="grid gap-2" role="radiogroup" aria-label="Working hours">
            {PRESETS.map((p) => {
              const on = p.start === start && p.end === end;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setStart(p.start);
                    setEnd(p.end);
                  }}
                  className={cn(
                    "tnum flex h-11 items-center justify-between rounded-[2px] border-[1.5px] border-rule bg-paper px-4 text-body font-semibold hover:border-ink-2",
                    on && "border-ink-2 bg-ink-2 font-bold text-paper hover:border-ink-2",
                  )}
                >
                  {p.label}
                  <span className={cn("size-3.5 rounded-full border-[1.5px] border-rule-strong", on && "border-[4px] border-paper")} aria-hidden />
                </button>
              );
            })}
            <div className="flex items-center gap-2 text-body text-graphite">
              Or
              <TimeSelect value={start} onValueChange={setStart} aria-label="Start" />
              to
              <TimeSelect value={end} onValueChange={setEnd} aria-label="End" />
            </div>
          </div>
          <div className="grid gap-2">
            <p className="text-small font-bold text-ink-2">On these days</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((d, i) => {
                const day = i + 1;
                const on = days.includes(day);
                return (
                  <button
                    key={d}
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((x) => x !== day) : [...days, day].sort())}
                    className={cn(
                      "h-9 w-12 rounded-[2px] border-[1.5px] border-rule text-small font-bold text-graphite hover:border-ink-2",
                      on && "border-ink-2 bg-ink-2 text-paper",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-3 text-body">
            <Switch checked={lunch} onCheckedChange={setLunch} /> Keep 12:30–13:30 free for lunch
          </label>
        </div>
      ),
      valid: days.length > 0 && end > start,
    },
    {
      title: "Do you have a video room?",
      body: (
        <div className="grid gap-3">
          <p className="text-body text-ink-2">
            If you use a personal Zoom, Google Meet or Teams link, paste it here. Vele adds it when you ask for a video call, and so does your booking page. You can skip this.
          </p>
          <Field label="Personal meeting link">{(a) => <Input {...a} type="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…" />}</Field>
        </div>
      ),
      valid: !video.trim() || /^https:\/\//i.test(video.trim()),
    },
  ];
  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div>
      <div className="band rounded-[2px] px-4 pt-4 pb-4">
        <p className="tnum text-small font-bold text-band-ink-2">
          Step {step + 1} of {steps.length}
        </p>
        <h1 className="mt-1 text-title leading-tight font-extrabold tracking-[-0.02em]">{current.title}</h1>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 bg-band-line", i <= step && "bg-ink-2")} />
          ))}
        </div>
      </div>
      <div className="grid gap-6 px-3.5 pt-5 pb-4">
        {current.body}
        {error && (
          <p role="alert" className="rounded-[2px] border border-red-ink bg-red-wash px-3 py-2 text-small font-semibold text-red-ink-text">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Back
              </Button>
            )}
          </div>
          <Button variant="primary" size="lg" disabled={!current.valid} loading={busy} onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? (video.trim() ? "Open my week" : "Skip and open my week") : "Continue"} <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
