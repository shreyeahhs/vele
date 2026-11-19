"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, KeyRound, MapPin, MoreHorizontal, PenLine, Phone, Plus, Trash2, Video, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/shell";
import { useZone } from "@/components/app/zone";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SectionHead, Segmented, Skeleton, Switch } from "@/components/ui/primitives";
import { qk, useBookings, useBookingSettings, useCalendars, type BookingDTO, type BookingSettings, type MeetingTypeDTO } from "@/hooks/use-api";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { dt, durationText, timeRange } from "@/lib/time-client";
import { cn } from "@/lib/utils";

async function copy(text: string, what = "Link") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error("Couldn’t copy. Select the link and copy it yourself.");
  }
}

const LOCATION_LABEL: Record<string, string> = { NONE: "Decide later", IN_PERSON: "In person", PHONE: "Phone call", VIDEO_LINK: "Video call" };

export function BookingsPage() {
  const settings = useBookingSettings();
  const [editingProfile, setEditingProfile] = useState(false);
  const [typeDialog, setTypeDialog] = useState<{ open: boolean; type: MeetingTypeDTO | null }>({ open: false, type: null });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Bookings" subtitle="Let people pick a time that already works for you.">
        <Button size="sm" variant="primary" onClick={() => setTypeDialog({ open: true, type: null })}>
          <Plus /> New meeting type
        </Button>
      </PageHeader>
      <div className="mx-auto grid max-w-4xl gap-10 px-4 pt-6 pb-10 md:px-8">
        {settings.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : settings.isError ? (
          <p role="alert" className="text-body font-semibold text-red-ink-text">
            {errorMessage(settings.error)}
          </p>
        ) : (
          <>
            <ProfileCard settings={settings.data} onEdit={() => setEditingProfile(true)} />
            <MeetingTypes settings={settings.data} onEdit={(type) => setTypeDialog({ open: true, type })} onCreate={() => setTypeDialog({ open: true, type: null })} />
            <ProfileDialog open={editingProfile} onOpenChange={setEditingProfile} settings={settings.data} />
          </>
        )}
        <BookingList />
      </div>
      <MeetingTypeDialog state={typeDialog} onOpenChange={(open) => setTypeDialog((s) => ({ ...s, open }))} />
    </div>
  );
}

function ProfileCard({ settings, onEdit }: { settings: BookingSettings; onEdit: () => void }) {
  const p = settings.profile;
  return (
    <section aria-labelledby="page-link">
      <SectionHead
        id="page-link"
        title="Your booking page"
        action={
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <PenLine /> Edit
          </Button>
        }
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-body text-ink-2">
          Shown as <span className="font-bold text-ink">{p.displayName}</span>
          {p.headline ? <span className="text-graphite"> · {p.headline}</span> : null}
        </p>
        {p.visibility !== "PUBLIC" && <Badge tone="pencil">{p.visibility === "PRIVATE" ? "Private" : "Unlisted"}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[2px] border-[1.5px] border-ink-2 bg-paper-2 p-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-small font-medium text-ink">{p.url}</code>
        <Button size="sm" variant="secondary" onClick={() => copy(p.url)}>
          <Copy /> Copy
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={p.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Open
          </a>
        </Button>
      </div>
      <p className="mt-2 max-w-[55ch] text-small text-graphite">
        {p.visibility === "PUBLIC"
          ? "Anyone with this link sees your public meeting types. Times come from your working hours, minus anything already on your calendars."
          : p.visibility === "UNLISTED"
            ? "The page lists nothing; people need a direct link to a meeting type."
            : "Only private links work. Create one per person from a meeting type’s menu."}
      </p>
    </section>
  );
}

function LocationIcon({ type }: { type: string }) {
  const Icon = type === "VIDEO_LINK" ? Video : type === "PHONE" ? Phone : type === "IN_PERSON" ? MapPin : null;
  return Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null;
}

function MeetingTypes({ settings, onEdit, onCreate }: { settings: BookingSettings; onEdit: (t: MeetingTypeDTO) => void; onCreate: () => void }) {
  const qc = useQueryClient();
  const [privateLink, setPrivateLink] = useState<{ url: string; title: string } | null>(null);
  const update = async (t: MeetingTypeDTO, body: Partial<MeetingTypeDTO>) => {
    try {
      await apiSend(`/api/booking/types/${t.id}`, "PATCH", body);
      await qc.invalidateQueries({ queryKey: qk.booking });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const remove = async (t: MeetingTypeDTO) => {
    if (!window.confirm(`Delete “${t.title}”? Existing bookings stay on your calendar.`)) return;
    try {
      await apiSend(`/api/booking/types/${t.id}`, "DELETE");
      await qc.invalidateQueries({ queryKey: qk.booking });
      toast.success("Meeting type deleted.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const makePrivate = async (t: MeetingTypeDTO) => {
    try {
      const res = await apiSend<{ url: string; meetingType: string }>("/api/booking/links", "POST", { meetingTypeId: t.id, singleUse: true, expiresInDays: 30 });
      setPrivateLink({ url: res.url, title: res.meetingType });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section aria-labelledby="types">
      <SectionHead
        id="types"
        title="Meeting types"
        action={
          settings.meetingTypes.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={onCreate}>
              <Plus /> Add
            </Button>
          ) : null
        }
      />
      {settings.meetingTypes.length === 0 ? (
        <div className="mt-2 grid justify-items-start gap-2 rounded-[2px] border-[1.5px] border-dashed border-pencil p-5">
          <p className="text-body font-bold">No meeting types yet.</p>
          <p className="text-small text-graphite">A meeting type is one kind of slot people can book, like a 30 minute intro call.</p>
          <Button size="sm" variant="primary" onClick={onCreate}>
            <Plus /> Create one
          </Button>
        </div>
      ) : (
        <ul className="banded border-b border-rule">
          {settings.meetingTypes.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 border-t border-rule px-2 py-3 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-body font-bold", !t.isActive && "text-graphite")}>{t.title}</p>
                  {t.visibility !== "PUBLIC" && <Badge tone="pencil">{t.visibility === "PRIVATE" ? "Private" : "Unlisted"}</Badge>}
                  {!t.isActive && <Badge>Off</Badge>}
                </div>
                <p className="flex flex-wrap items-center gap-x-3 text-small text-graphite">
                  <span className="tnum font-semibold text-ink-2">{durationText(t.durationMin)}</span>
                  <span className="inline-flex items-center gap-1">
                    <LocationIcon type={t.locationType} /> {LOCATION_LABEL[t.locationType]}
                  </span>
                  <span className="truncate font-mono text-micro">/{t.slug}</span>
                </p>
              </div>
              <Switch checked={t.isActive} onCheckedChange={(v) => update(t, { isActive: v })} aria-label={t.isActive ? `Turn off ${t.title}` : `Turn on ${t.title}`} />
              <Button size="sm" variant="secondary" onClick={() => copy(t.url)} disabled={!t.isActive}>
                <Copy /> Copy link
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`More for ${t.title}`}>
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => onEdit(t)}>
                    <PenLine /> Edit
                  </MenuItem>
                  <MenuItem onSelect={() => makePrivate(t)} disabled={!t.isActive}>
                    <KeyRound /> Create a one-time private link
                  </MenuItem>
                  <MenuItem asChild>
                    <a href={t.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Preview
                    </a>
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => remove(t)}>
                    <Trash2 /> Delete
                  </MenuItem>
                </MenuContent>
              </Menu>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(privateLink)} onOpenChange={(o) => !o && setPrivateLink(null)}>
        {privateLink && (
          <DialogContent
            title="Private link ready"
            description={`For “${privateLink.title}”. It works once and expires in 30 days. It’s only shown now, so copy it before closing.`}
          >
            <div className="flex items-center gap-2 rounded-[2px] border-[1.5px] border-ink-2 bg-paper-2 p-1.5 pl-3">
              <code className="min-w-0 flex-1 font-mono text-small font-medium break-all">{privateLink.url}</code>
              <Button size="sm" variant="primary" onClick={() => copy(privateLink.url)}>
                <Copy /> Copy
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function ProfileDialog({ open, onOpenChange, settings }: { open: boolean; onOpenChange: (o: boolean) => void; settings: BookingSettings }) {
  const qc = useQueryClient();
  const p = settings.profile;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await apiSend("/api/booking/settings", "PATCH", {
        handle: String(f.get("handle")).trim().toLowerCase(),
        displayName: String(f.get("displayName")).trim(),
        headline: String(f.get("headline")).trim() || null,
        welcomeMessage: String(f.get("welcomeMessage")).trim() || null,
        visibility: f.get("visibility"),
      });
      await qc.invalidateQueries({ queryKey: qk.booking });
      await qc.invalidateQueries({ queryKey: qk.me });
      onOpenChange(false);
      toast.success("Booking page updated.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Your booking page" description="What people see before they pick a time.">
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Link name" hint={`Your page lives at /book/${p.handle}. Changing this breaks links you’ve already shared.`}>
            {(a) => <Input {...a} name="handle" defaultValue={p.handle} required pattern="[a-z0-9-]{2,40}" autoCapitalize="none" spellCheck={false} />}
          </Field>
          <Field label="Name shown">{(a) => <Input {...a} name="displayName" defaultValue={p.displayName} required maxLength={80} />}</Field>
          <Field label="Headline" hint="Optional. One line, like your role.">
            {(a) => <Input {...a} name="headline" defaultValue={p.headline ?? ""} maxLength={120} />}
          </Field>
          <Field label="Welcome note" hint="Optional.">
            {(a) => <Textarea {...a} name="welcomeMessage" defaultValue={p.welcomeMessage ?? ""} maxLength={600} />}
          </Field>
          <Field label="Who can see the page">
            {(a) => (
              <Select {...a} name="visibility" defaultValue={p.visibility}>
                <option value="PUBLIC">Public: lists your public meeting types</option>
                <option value="UNLISTED">Unlisted: direct meeting links only</option>
                <option value="PRIVATE">Private: one-off private links only</option>
              </Select>
            )}
          </Field>
          {error && (
            <p role="alert" className="text-small font-semibold text-red-ink-text">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

function MeetingTypeDialog({ state, onOpenChange }: { state: { open: boolean; type: MeetingTypeDTO | null }; onOpenChange: (o: boolean) => void }) {
  const t = state.type;
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent title={t ? `Edit “${t.title}”` : "New meeting type"} description="One kind of meeting people can book with you." wide>
        {/* Keyed so the form resets between types. */}
        <MeetingTypeForm key={t?.id ?? "new"} type={t} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function numOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function MeetingTypeForm({ type: t, onDone }: { type: MeetingTypeDTO | null; onDone: () => void }) {
  const qc = useQueryClient();
  const calendars = useCalendars();
  const [locationType, setLocationType] = useState<string>(t?.locationType ?? "VIDEO_LINK");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const noticeHours = numOrNull(f.get("noticeHours"));
    const body = {
      title: String(f.get("title")).trim(),
      ...(String(f.get("slug") ?? "").trim() ? { slug: String(f.get("slug")).trim().toLowerCase() } : {}),
      description: String(f.get("description") ?? "").trim() || null,
      durationMin: Number(f.get("duration")),
      locationType,
      locationValue: locationType === "NONE" ? null : String(f.get("locationValue") ?? "").trim() || null,
      bufferBeforeMin: numOrNull(f.get("bufferBefore")),
      bufferAfterMin: numOrNull(f.get("bufferAfter")),
      minimumNoticeMin: noticeHours == null ? null : noticeHours * 60,
      maxAdvanceDays: numOrNull(f.get("maxAdvanceDays")),
      maxPerDay: numOrNull(f.get("maxPerDay")),
      destinationCalendarId: String(f.get("destination") ?? "") || null,
      visibility: f.get("visibility"),
    };
    setSaving(true);
    setError(null);
    try {
      if (t) await apiSend(`/api/booking/types/${t.id}`, "PATCH", body);
      else await apiSend("/api/booking/types", "POST", body);
      await qc.invalidateQueries({ queryKey: qk.booking });
      toast.success(t ? "Saved." : "Meeting type created.");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <Field label="Name">{(a) => <Input {...a} name="title" defaultValue={t?.title ?? ""} placeholder="Intro call" required maxLength={80} autoFocus />}</Field>
        <Field label="Length">
          {(a) => (
            <Select {...a} name="duration" defaultValue={String(t?.durationMin ?? 30)}>
              {[...new Set([...DURATIONS, t?.durationMin ?? 30])]
                .sort((x, y) => x - y)
                .map((d) => (
                  <option key={d} value={d}>
                    {durationText(d)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Description" hint="Optional. Shown on the booking page.">
        {(a) => <Textarea {...a} name="description" defaultValue={t?.description ?? ""} maxLength={500} className="min-h-16" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field label="Where">
          {(a) => (
            <Select {...a} value={locationType} onChange={(e) => setLocationType(e.target.value)}>
              <option value="VIDEO_LINK">Video call</option>
              <option value="IN_PERSON">In person</option>
              <option value="PHONE">Phone call</option>
              <option value="NONE">Decide later</option>
            </Select>
          )}
        </Field>
        {locationType !== "NONE" && (
          <Field
            label={locationType === "VIDEO_LINK" ? "Video link" : locationType === "PHONE" ? "Phone number" : "Address"}
            hint={locationType === "VIDEO_LINK" ? "Your personal Zoom, Meet or Teams room. Leave empty to use the default link from Settings." : "Shared only after someone books."}
          >
            {(a) => (
              <Input
                {...a}
                name="locationValue"
                defaultValue={t?.locationValue ?? ""}
                type={locationType === "VIDEO_LINK" ? "url" : "text"}
                placeholder={locationType === "VIDEO_LINK" ? "https://…" : ""}
                maxLength={500}
              />
            )}
          </Field>
        )}
      </div>
      <details className="group rounded-[2px] border border-rule">
        <summary className="cursor-pointer px-3 py-2 text-small font-bold text-ink-2 select-none hover:bg-wash">Limits and buffers</summary>
        <div className="grid gap-4 border-t border-rule px-3 py-3 sm:grid-cols-2">
          <Field label="Gap before (min)" hint="Blank uses your default.">
            {(a) => <Input {...a} name="bufferBefore" type="number" min={0} max={120} defaultValue={t?.bufferBeforeMin ?? ""} />}
          </Field>
          <Field label="Gap after (min)">{(a) => <Input {...a} name="bufferAfter" type="number" min={0} max={120} defaultValue={t?.bufferAfterMin ?? ""} />}</Field>
          <Field label="Minimum notice (hours)">
            {(a) => <Input {...a} name="noticeHours" type="number" min={0} max={720} defaultValue={t?.minimumNoticeMin != null ? Math.round(t.minimumNoticeMin / 60) : ""} />}
          </Field>
          <Field label="Book up to (days ahead)">{(a) => <Input {...a} name="maxAdvanceDays" type="number" min={1} max={365} defaultValue={t?.maxAdvanceDays ?? ""} />}</Field>
          <Field label="Most per day">{(a) => <Input {...a} name="maxPerDay" type="number" min={1} max={50} defaultValue={t?.maxPerDay ?? ""} />}</Field>
          <Field label="Add bookings to">
            {(a) => (
              <Select {...a} name="destination" defaultValue={t?.destinationCalendarId ?? ""}>
                <option value="">Default calendar</option>
                {(calendars.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </details>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who can book">
          {(a) => (
            <Select {...a} name="visibility" defaultValue={t?.visibility ?? "PUBLIC"}>
              <option value="PUBLIC">Listed on your page</option>
              <option value="UNLISTED">Anyone with the direct link</option>
              <option value="PRIVATE">Only via private links</option>
            </Select>
          )}
        </Field>
        <Field label="Link ending" hint="Optional. Made from the name if empty.">
          {(a) => <Input {...a} name="slug" defaultValue={t?.slug ?? ""} pattern="[a-z0-9-]{2,40}" placeholder="intro-call" autoCapitalize="none" spellCheck={false} />}
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-small font-semibold text-red-ink-text">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {t ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}

function BookingList() {
  const [filter, setFilter] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const bookings = useBookings(filter);
  return (
    <section aria-labelledby="booked">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3 border-t-2 border-ink-2 pt-2 pb-1">
        <h2 id="booked" className="text-lead font-extrabold tracking-[-0.01em] text-ink">
          Booked with you
        </h2>
        <Segmented
          label="Which bookings"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>
      {bookings.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : bookings.isError ? (
        <p role="alert" className="text-body font-semibold text-red-ink-text">
          {errorMessage(bookings.error)}
        </p>
      ) : !bookings.data.length ? (
        <p className="max-w-[55ch] border-b border-rule py-4 text-body text-graphite">
          {filter === "upcoming"
            ? "Nobody has booked yet. Share your link and bookings will show up here and on your calendar."
            : filter === "past"
              ? "No past bookings."
              : "No cancelled bookings."}
        </p>
      ) : (
        <ul className="banded border-b border-rule">
          {bookings.data.map((b) => (
            <BookingRow key={b.id} booking={b} cancellable={filter === "upcoming"} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingRow({ booking: b, cancellable }: { booking: BookingDTO; cancellable: boolean }) {
  const zone = useZone();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = async () => {
    setBusy(true);
    try {
      const res = await apiSend<{ emailStatus?: string }>(`/api/bookings/${b.id}/cancel`, "POST", { reason: reason.trim() || null });
      toast.success(
        res.emailStatus === "sent"
          ? `Cancelled. ${b.inviteeName} has been emailed.`
          : res.emailStatus === "logged"
            ? "Cancelled. The email was logged (development mode), not sent."
            : "Cancelled.",
      );
      void qc.invalidateQueries({ queryKey: ["bookings"] });
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: qk.overview });
      setConfirming(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const inviteeTime = b.inviteeTimezone !== zone ? `${dt(b.start, b.inviteeTimezone).toFormat("HH:mm")} for them (${b.inviteeTimezone.replace(/_/g, " ")})` : null;
  return (
    <li className="border-t border-rule px-2 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="tnum w-28 shrink-0">
          <p className="text-small font-extrabold">{dt(b.start, zone).toFormat("ccc d LLL")}</p>
          <p className="text-small font-semibold text-ink-2">{timeRange(b.start, b.end, zone)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-body font-bold", b.status === "CANCELLED" && "text-graphite line-through decoration-red-ink")}>
            {b.title} with {b.inviteeName}
          </p>
          <p className="truncate text-small text-graphite">
            {b.inviteeEmail}
            {inviteeTime ? ` · ${inviteeTime}` : ""}
          </p>
          {b.message && <p className="mt-1 max-w-[55ch] text-small whitespace-pre-wrap text-ink-2">“{b.message}”</p>}
        </div>
        {cancellable && !confirming && (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <X /> Cancel
          </Button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 grid gap-2 border-t border-rule pt-3">
          <Field label={`Tell ${b.inviteeName} why (optional)`}>
            {(a) => <Input {...a} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Something came up…" />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" loading={busy} onClick={cancel}>
              <Check /> Cancel booking and email {b.inviteeName.split(" ")[0]}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
