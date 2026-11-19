"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select, TimeSelect } from "@/components/ui/field";
import { Skeleton, Switch } from "@/components/ui/primitives";
import { qk, useCalendars, usePreferences, type PreferencesDTO } from "@/hooks/use-api";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { IsoWeekday, WeeklyWindow } from "@/scheduling";
import { SettingsSection } from "./settings-nav";

type Win = WeeklyWindow;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function TimeInput({ value, onChange, label, invalid, emptyLabel }: { value: string; onChange: (v: string) => void; label: string; invalid?: boolean; emptyLabel?: string }) {
  return <TimeSelect value={value} onValueChange={onChange} aria-label={label} aria-invalid={invalid || undefined} emptyLabel={emptyLabel} className="h-8 text-small" />;
}

export function AvailabilitySettings() {
  const prefs = usePreferences();
  if (prefs.isPending) return <Skeleton className="h-96 w-full" />;
  if (prefs.isError) return <p className="text-red-ink-text">{errorMessage(prefs.error)}</p>;
  return <AvailabilityForm saved={prefs.data} />;
}

function AvailabilityForm({ saved }: { saved: PreferencesDTO }) {
  const calendars = useCalendars();
  const qc = useQueryClient();
  const [p, setP] = useState<PreferencesDTO>(() => structuredClone(saved));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PreferencesDTO>(key: K, value: PreferencesDTO[K]) => setP({ ...p, [key]: value });
  const bad = (w: Win) => !w.start || !w.end || w.end <= w.start;
  const invalid = [...p.workingHours, ...p.focus, ...p.blocked].some(bad) || Boolean(p.lunch && p.lunch.end <= p.lunch.start);
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        workingHours: p.workingHours.map(({ day, start, end }) => ({
          day,
          start,
          end,
        })),
        focus: p.focus.map(({ day, start, end, label }) => ({
          day,
          start,
          end,
          ...(label ? { label } : {}),
        })),
        blocked: p.blocked.map(({ day, start, end, label }) => ({
          day,
          start,
          end,
          ...(label ? { label } : {}),
        })),
        lunch: p.lunch,
        bufferBeforeMin: p.bufferBeforeMin,
        bufferAfterMin: p.bufferAfterMin,
        minimumNoticeMin: p.minimumNoticeMin,
        maxAdvanceDays: p.maxAdvanceDays,
        maxMeetingsPerDay: p.maxMeetingsPerDay,
        maxConsecutiveMeetings: p.maxConsecutiveMeetings,
        defaultDurationMin: p.defaultDurationMin,
        slotIntervalMin: p.slotIntervalMin,
        noMeetingsBefore: p.noMeetingsBefore || null,
        noMeetingsAfter: p.noMeetingsAfter || null,
        preferredDays: p.preferredDays,
        treatTentativeAsBusy: p.treatTentativeAsBusy,
        defaultCalendarId: p.defaultCalendarId,
      };
      const res = await apiSend<{ preferences: PreferencesDTO }>("/api/preferences", "PUT", body);
      qc.setQueryData(qk.preferences, res.preferences);
      setP(structuredClone(res.preferences));
      void qc.invalidateQueries({ queryKey: qk.overview });
      toast.success("Availability saved. Vele and your booking page use it right away.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const num = (v: string, fallback: number) => (v === "" ? fallback : Math.max(0, Math.round(Number(v))));
  const nullableNum = (v: string) => (v === "" ? null : Math.max(1, Math.round(Number(v))));

  return (
    <>
      <SettingsSection
        title="Working hours"
        description="When meetings can go. Vele can still put things outside these if you ask, but it will say so. Booking pages only ever offer times inside them."
      >
        <ul className="banded border-t border-rule">
          {DAYS.map((name, i) => {
            const day = (i + 1) as IsoWeekday;
            const wins = p.workingHours.map((w, idx) => ({ w, idx })).filter((x) => x.w.day === day);
            const on = wins.length > 0;
            return (
              <li key={day} className="grid grid-cols-[120px_1fr] items-start gap-3 border-b border-rule px-2 py-2 sm:grid-cols-[150px_1fr]">
                <label className="flex h-8 items-center gap-2.5 text-body font-bold">
                  <Switch
                    checked={on}
                    onCheckedChange={(v) => set("workingHours", v ? [...p.workingHours, { day, start: "09:00", end: "17:00" }] : p.workingHours.filter((w) => w.day !== day))}
                    aria-label={`Work on ${name}`}
                  />
                  <span className={cn(!on && "font-semibold text-graphite")}>{name}</span>
                </label>
                {on ? (
                  <div className="grid gap-1.5">
                    {wins.map(({ w, idx }) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <TimeInput
                          label={`${name} start`}
                          value={w.start}
                          invalid={bad(w)}
                          onChange={(v) =>
                            set(
                              "workingHours",
                              p.workingHours.map((x, j) => (j === idx ? { ...x, start: v } : x)),
                            )
                          }
                        />
                        <span className="text-graphite">to</span>
                        <TimeInput
                          label={`${name} end`}
                          value={w.end}
                          invalid={bad(w)}
                          onChange={(v) =>
                            set(
                              "workingHours",
                              p.workingHours.map((x, j) => (j === idx ? { ...x, end: v } : x)),
                            )
                          }
                        />
                        {wins.length > 1 && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Remove these hours"
                            onClick={() =>
                              set(
                                "workingHours",
                                p.workingHours.filter((_, j) => j !== idx),
                              )
                            }
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="justify-self-start text-small text-graphite underline decoration-rule-strong underline-offset-2 hover:text-ink"
                      onClick={() => {
                        const last = wins[wins.length - 1].w;
                        set("workingHours", [
                          ...p.workingHours,
                          {
                            day,
                            start: last.end < "18:00" ? "18:00" : last.end,
                            end: last.end < "20:00" ? "20:00" : "23:45",
                          },
                        ]);
                      }}
                    >
                      Add hours
                    </button>
                  </div>
                ) : (
                  <span className="flex h-8 items-center text-small text-graphite-soft">Not working</span>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <SettingsSection title="Lunch" description="Kept clear of meetings unless you say otherwise.">
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={Boolean(p.lunch)} onCheckedChange={(v) => set("lunch", v ? { start: "12:30", end: "13:30" } : null)} aria-label="Protect lunch" />
          {p.lunch ? (
            <div className="flex items-center gap-2">
              <TimeInput label="Lunch start" value={p.lunch.start} invalid={p.lunch.end <= p.lunch.start} onChange={(v) => set("lunch", { ...p.lunch!, start: v })} />
              <span className="text-graphite">to</span>
              <TimeInput label="Lunch end" value={p.lunch.end} invalid={p.lunch.end <= p.lunch.start} onChange={(v) => set("lunch", { ...p.lunch!, end: v })} />
            </div>
          ) : (
            <span className="text-small text-graphite">Lunch isn’t protected.</span>
          )}
        </div>
      </SettingsSection>

      <WindowList
        title="Focus time"
        description="Weekly blocks for deep work. Vele avoids them when looking for meeting times and treats them as busy on your booking page."
        items={p.focus}
        onChange={(v) => set("focus", v)}
        addDefault={{ day: 1, start: "09:00", end: "11:00", label: "Focus" }}
        bad={bad}
      />
      <WindowList
        title="Never available"
        description="Weekly times that are always off limits, like the school run."
        items={p.blocked}
        onChange={(v) => set("blocked", v)}
        addDefault={{ day: 1, start: "08:00", end: "09:00", label: "" }}
        bad={bad}
      />

      <SettingsSection title="Meeting rules" description="How Vele and your booking page space things out.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gap before meetings (min)">
            {(a) => <Input {...a} type="number" min={0} max={120} value={p.bufferBeforeMin} onChange={(e) => set("bufferBeforeMin", num(e.target.value, 0))} />}
          </Field>
          <Field label="Gap after meetings (min)">
            {(a) => <Input {...a} type="number" min={0} max={120} value={p.bufferAfterMin} onChange={(e) => set("bufferAfterMin", num(e.target.value, 0))} />}
          </Field>
          <Field label="Default meeting length (min)">
            {(a) => <Input {...a} type="number" min={5} max={480} value={p.defaultDurationMin} onChange={(e) => set("defaultDurationMin", Math.max(5, num(e.target.value, 30)))} />}
          </Field>
          <Field label="Start times every">
            {(a) => (
              <Select {...a} value={p.slotIntervalMin} onChange={(e) => set("slotIntervalMin", Number(e.target.value))}>
                {[5, 10, 15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n === 60 ? "hour" : `${n} minutes`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Most meetings in a day" hint="Blank for no limit.">
            {(a) => <Input {...a} type="number" min={1} max={30} value={p.maxMeetingsPerDay ?? ""} onChange={(e) => set("maxMeetingsPerDay", nullableNum(e.target.value))} />}
          </Field>
          <Field label="Most back-to-back" hint="Blank for no limit.">
            {(a) => (
              <Input {...a} type="number" min={1} max={12} value={p.maxConsecutiveMeetings ?? ""} onChange={(e) => set("maxConsecutiveMeetings", nullableNum(e.target.value))} />
            )}
          </Field>
          <div className="grid gap-1.5">
            <Label>No meetings before</Label>
            <div className="flex items-center gap-2">
              <TimeInput label="No meetings before" value={p.noMeetingsBefore ?? ""} onChange={(v) => set("noMeetingsBefore", v || null)} emptyLabel="No limit" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>No meetings after</Label>
            <div className="flex items-center gap-2">
              <TimeInput label="No meetings after" value={p.noMeetingsAfter ?? ""} onChange={(v) => set("noMeetingsAfter", v || null)} emptyLabel="No limit" />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-3 text-body">
          <Switch checked={p.treatTentativeAsBusy} onCheckedChange={(v) => set("treatTentativeAsBusy", v)} />
          Count tentative events as busy
        </label>
      </SettingsSection>

      <SettingsSection title="Booking page limits" description="Only apply to people booking through your links; you can always schedule yourself from now on.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum notice (hours)">
            {(a) => (
              <Input {...a} type="number" min={0} max={336} value={Math.round(p.minimumNoticeMin / 60)} onChange={(e) => set("minimumNoticeMin", num(e.target.value, 0) * 60)} />
            )}
          </Field>
          <Field label="Bookable up to (days ahead)">
            {(a) => <Input {...a} type="number" min={1} max={365} value={p.maxAdvanceDays} onChange={(e) => set("maxAdvanceDays", Math.max(1, num(e.target.value, 60)))} />}
          </Field>
          <Field label="New events go to">
            {(a) => (
              <Select {...a} value={p.defaultCalendarId ?? ""} onChange={(e) => set("defaultCalendarId", e.target.value || null)}>
                <option value="">Your default calendar</option>
                {(calendars.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </SettingsSection>

      {(dirty || saving) && (
        <div className="animate-pencil-in sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-[2px] border-[1.5px] border-ink-2 bg-sheet p-2 pl-4 shadow-[var(--shadow-sheet)] md:bottom-4">
          <p className={cn("mr-auto text-small font-bold", invalid ? "text-red-ink-text" : "text-ink-2")}>{invalid ? "Some times end before they start." : "Unsaved changes."}</p>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setP(structuredClone(saved))}>
              Undo changes
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty || invalid}>
            Save availability
          </Button>
        </div>
      )}
    </>
  );
}

function WindowList({
  title,
  description,
  items,
  onChange,
  addDefault,
  bad,
}: {
  title: string;
  description: string;
  items: Win[];
  onChange: (v: Win[]) => void;
  addDefault: Win;
  bad: (w: Win) => boolean;
}) {
  const update = (i: number, patch: Partial<Win>) => onChange(items.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <SettingsSection title={title} description={description}>
      {items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((w, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Select value={w.day} onChange={(e) => update(i, { day: Number(e.target.value) as IsoWeekday })} className="h-8 w-[140px] text-small" aria-label="Day">
                {DAYS.map((d, k) => (
                  <option key={d} value={k + 1}>
                    {d}
                  </option>
                ))}
              </Select>
              <TimeInput label="Start" value={w.start} invalid={bad(w)} onChange={(v) => update(i, { start: v })} />
              <span className="text-graphite">to</span>
              <TimeInput label="End" value={w.end} invalid={bad(w)} onChange={(v) => update(i, { end: v })} />
              <Input
                value={w.label ?? ""}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Label (optional)"
                maxLength={60}
                className="h-8 w-44 text-small"
                aria-label="Label"
              />
              <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button size="sm" variant="pencil" onClick={() => onChange([...items, addDefault])}>
          <Plus /> Add
        </Button>
      </div>
    </SettingsSection>
  );
}
