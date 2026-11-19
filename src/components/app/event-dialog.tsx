"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/primitives";
import { useCalendars, type CalendarDTO, type EventDTO } from "@/hooks/use-api";
import { apiGet, apiSend, errorMessage } from "@/lib/fetcher";
import { presetFromRule, repeatRule, REPEAT_LABELS, type RepeatPreset } from "@/lib/repeat";
import { useUI } from "./ui-context";
import { useZone } from "./zone";

interface FormState {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  endDate: string;
  allDay: boolean;
  calendarId: string;
  repeat: RepeatPreset;
  location: string;
  meetingUrl: string;
  guests: string;
  sendInvitations: boolean;
  kind: "EVENT" | "FOCUS" | "BLOCKED";
  description: string;
  scope: "occurrence" | "series";
}

function roundedNow(zone: string) {
  const n = DateTime.now().setZone(zone);
  return n.plus({ minutes: 30 - (n.minute % 30) }).set({ second: 0, millisecond: 0 });
}

function initialState(
  zone: string,
  draft: { start?: string; end?: string; title?: string; calendarId?: string | null; isAllDay?: boolean } | null,
  event: EventDTO | null,
  defaultCalendarId: string,
): FormState {
  if (event) {
    const s = DateTime.fromISO(event.start, { zone });
    const e = DateTime.fromISO(event.end, { zone });
    return {
      title: event.title,
      date: s.toISODate()!,
      startTime: s.toFormat("HH:mm"),
      endTime: e.toFormat("HH:mm"),
      endDate: event.isAllDay ? e.minus({ days: 1 }).toISODate()! : e.toISODate()!,
      allDay: event.isAllDay,
      calendarId: event.calendarId,
      repeat: presetFromRule(event.recurrence),
      location: event.location ?? "",
      meetingUrl: event.meetingUrl ?? "",
      guests: event.attendees
        .map((a) => a.email)
        .filter(Boolean)
        .join(", "),
      sendInvitations: true,
      kind: event.kind === "FOCUS" ? "FOCUS" : event.kind === "BLOCKED" ? "BLOCKED" : "EVENT",
      description: event.description ?? "",
      scope: "occurrence",
    };
  }
  const s = draft?.start ? DateTime.fromISO(draft.start, { zone }) : roundedNow(zone);
  const e = draft?.end ? DateTime.fromISO(draft.end, { zone }) : s.plus({ minutes: 30 });
  return {
    title: draft?.title ?? "",
    date: s.toISODate()!,
    startTime: s.toFormat("HH:mm"),
    endTime: e.toFormat("HH:mm"),
    endDate: s.toISODate()!,
    allDay: Boolean(draft?.isAllDay),
    calendarId: draft?.calendarId ?? defaultCalendarId,
    repeat: "none",
    location: "",
    meetingUrl: "",
    guests: "",
    sendInvitations: true,
    kind: "EVENT",
    description: "",
    scope: "occurrence",
  };
}

/** Create or edit an event by hand. Everything the assistant can do is also possible here. */
export function EventDialog() {
  const ui = useUI();
  const open = ui.eventDialog.open;
  const draft = ui.eventDialog.draft;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && ui.closeEventDialog()}>
      {open && <EventForm key={draft?.id ?? draft?.start ?? "new"} id={draft?.id} draft={draft} onDone={ui.closeEventDialog} />}
    </Dialog>
  );
}

function EventForm({ id, draft, onDone }: { id?: string; draft: ReturnType<typeof useUI>["eventDialog"]["draft"]; onDone: () => void }) {
  const zone = useZone();
  const { data: calendars } = useCalendars();
  const existing = useQuery({
    queryKey: ["event", id],
    queryFn: async () => (await apiGet<{ event: EventDTO }>(`/api/events/${encodeURIComponent(id!)}`)).event,
    enabled: Boolean(id),
  });
  if (existing.isError) {
    return (
      <DialogContent title="Edit event">
        <p className="text-body text-red-ink-text">{errorMessage(existing.error)}</p>
      </DialogContent>
    );
  }
  if (!calendars || (id && !existing.data)) {
    return (
      <DialogContent title={id ? "Edit event" : "New event"}>
        <div className="h-64 animate-pulse rounded-[2px] bg-paper-2" />
      </DialogContent>
    );
  }
  const defaultCalendarId = calendars.find((c) => c.isDefault)?.id ?? calendars[0]?.id ?? "";
  const event = existing.data ?? null;
  return <EventFormBody id={id} event={event} calendars={calendars} initial={initialState(zone, draft, event, defaultCalendarId)} onDone={onDone} />;
}

function EventFormBody({ id, event, calendars, initial, onDone }: { id?: string; event: EventDTO | null; calendars: CalendarDTO[]; initial: FormState; onDone: () => void }) {
  const zone = useZone();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const editing = Boolean(id);
  const guestList = useMemo(
    () =>
      form.guests
        .split(/[\s,;]+/)
        .map((g) => g.trim())
        .filter(Boolean),
    [form.guests],
  );

  const toIso = (date: string, time: string) => DateTime.fromISO(`${date}T${time}`, { zone }).toUTC().toISO()!;

  const save = async () => {
    setError(null);
    if (!form.title.trim()) return setError("Give the event a title.");
    const badGuest = guestList.find((g) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g));
    if (badGuest) return setError(`"${badGuest}" isn't a valid email address.`);
    if (form.meetingUrl && !/^https:\/\//i.test(form.meetingUrl)) return setError("Meeting links must start with https://");
    const start = form.allDay ? toIso(form.date, "00:00") : toIso(form.date, form.startTime);
    const end = form.allDay ? DateTime.fromISO(form.endDate, { zone }).plus({ days: 1 }).startOf("day").toUTC().toISO()! : toIso(form.date, form.endTime);
    if (!form.allDay && end <= start) return setError("The event must end after it starts.");
    const startLocal = DateTime.fromISO(start, { zone });
    const body = {
      title: form.title.trim(),
      calendarId: form.calendarId,
      start,
      end,
      isAllDay: form.allDay,
      location: form.location || null,
      description: form.description || null,
      meetingUrl: form.meetingUrl || null,
      attendees: guestList.map((email) => ({ email })),
      recurrence: repeatRule(form.repeat, { weekday: startLocal.weekday, day: startLocal.day }),
      kind: form.kind,
      showAs: form.allDay && form.kind === "EVENT" ? ("FREE" as const) : ("BUSY" as const),
      sendInvitations: form.sendInvitations,
    };
    setSaving(true);
    try {
      if (editing && id) {
        const changes: Record<string, unknown> = { ...body, scope: event?.isRecurring ? form.scope : undefined, notify: form.sendInvitations };
        if (!(event?.isRecurring && form.scope === "series")) delete changes.recurrence;
        const res = await apiSend<{ invitations: Array<{ status: string }> }>(`/api/events/${encodeURIComponent(id)}`, "PATCH", changes);
        toast.success(res.invitations.some((i) => i.status === "logged") ? "Saved. Guests' updates were logged (development mode)." : "Saved.");
      } else {
        const res = await apiSend<{ invitations: Array<{ status: string; email: string }> }>("/api/events", "POST", body);
        const logged = res.invitations.some((i) => i.status === "logged");
        toast.success(
          res.invitations.length
            ? logged
              ? "Added. Invitations were logged (development mode), not sent."
              : `Added and invited ${res.invitations.length}.`
            : "Added to your calendar.",
        );
      }
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await apiSend(`/api/events/${encodeURIComponent(id)}?scope=${event?.isRecurring ? form.scope : "series"}&notify=${form.sendInvitations}`, "DELETE");
      toast.success("Deleted.");
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent title={editing ? "Edit event" : "New event"} wide>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Title">
          {(p) => <Input {...p} autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Lunch with Mom" maxLength={200} />}
        </Field>

        <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
          <Field label="Date">{(p) => <Input {...p} type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />}</Field>
          {form.allDay ? (
            <Field label="Until" className="sm:col-span-2">
              {(p) => <Input {...p} type="date" value={form.endDate} min={form.date} onChange={(e) => set("endDate", e.target.value)} />}
            </Field>
          ) : (
            <>
              <Field label="Starts">{(p) => <Input {...p} type="time" step={300} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} required />}</Field>
              <Field label="Ends">{(p) => <Input {...p} type="time" step={300} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} required />}</Field>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} />
            All day
          </label>
          <span className="text-graphite">Times in {zone.replace(/_/g, " ")}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Calendar">
            {(p) => (
              <Select {...p} value={form.calendarId} onChange={(e) => set("calendarId", e.target.value)}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Repeat">
            {(p) => (
              <Select
                {...p}
                value={form.repeat}
                onChange={(e) => set("repeat", e.target.value as RepeatPreset)}
                disabled={editing && !(event?.isRecurring && form.scope === "series") && Boolean(event?.isRecurring)}
              >
                {(Object.keys(REPEAT_LABELS) as RepeatPreset[]).map((k) => (
                  <option key={k} value={k}>
                    {REPEAT_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Type">
            {(p) => (
              <Select {...p} value={form.kind} onChange={(e) => set("kind", e.target.value as FormState["kind"])}>
                <option value="EVENT">Event</option>
                <option value="FOCUS">Focus time</option>
                <option value="BLOCKED">Unavailable</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location">{(p) => <Input {...p} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Room, address or phone" />}</Field>
          <Field label="Meeting link" hint="Paste a Teams, Meet or Zoom link to get a Join button.">
            {(p) => <Input {...p} type="url" inputMode="url" value={form.meetingUrl} onChange={(e) => set("meetingUrl", e.target.value)} placeholder="https://…" />}
          </Field>
        </div>

        <Field label="Guests" hint={guestList.length ? `${guestList.length} guest${guestList.length === 1 ? "" : "s"}` : "Email addresses, separated by commas"}>
          {(p) => <Input {...p} value={form.guests} onChange={(e) => set("guests", e.target.value)} placeholder="sarah@example.com, john@example.com" />}
        </Field>
        {guestList.length > 0 && (
          <label className="-mt-2 flex items-center gap-2 text-small">
            <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={form.sendInvitations} onChange={(e) => set("sendInvitations", e.target.checked)} />
            Email guests an invitation (.ics) {editing ? "about the change" : ""}
          </label>
        )}

        <Field label="Notes">{(p) => <Textarea {...p} value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={5000} />}</Field>

        {editing && event?.isRecurring && (
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-small font-bold text-ink-2">This is a repeating event</legend>
            <div className="flex flex-wrap gap-4 text-small">
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" className="accent-[var(--ink)]" checked={form.scope === "occurrence"} onChange={() => set("scope", "occurrence")} />
                Only this one
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" className="accent-[var(--ink)]" checked={form.scope === "series"} onChange={() => set("scope", "series")} />
                All events in the series
              </label>
            </div>
          </fieldset>
        )}

        {error && (
          <p className="rounded-[2px] border border-red-ink bg-red-wash px-3 py-2 text-small font-semibold text-red-ink-text" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {editing &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-small text-red-ink-text">
                {event && event.attendees.length > 0 ? `Cancel for ${event.attendees.length} guest${event.attendees.length === 1 ? "" : "s"}?` : "Delete this event?"}
                <Button type="button" size="sm" variant="danger" onClick={remove} loading={saving}>
                  Delete
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button type="button" size="sm" variant="ghost" className="text-red-ink-text" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            ))}
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {editing ? "Save" : "Add to calendar"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
