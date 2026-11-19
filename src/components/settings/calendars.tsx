"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Popover, PopoverContent, PopoverTrigger, Skeleton, Switch } from "@/components/ui/primitives";
import { qk, useCalendars, type CalendarDTO } from "@/hooks/use-api";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { calendarCode, calendarInk, cn } from "@/lib/utils";
import { SettingsSection } from "./settings-nav";

const INKS = [
  { value: "var(--ink-0)", name: "Blue-black" },
  { value: "var(--ink-1)", name: "Green" },
  { value: "var(--ink-2c)", name: "Oxblood" },
  { value: "var(--ink-3)", name: "Sepia" },
  { value: "var(--ink-4)", name: "Violet" },
  { value: "var(--ink-5)", name: "Teal" },
  { value: "var(--ink-6)", name: "Graphite" },
];

export function CalendarSettings() {
  const calendars = useCalendars();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const patch = async (c: CalendarDTO, body: Partial<CalendarDTO>) => {
    qc.setQueryData(qk.calendars, (old: CalendarDTO[] | undefined) => old?.map((x) => (x.id === c.id ? { ...x, ...body } : x)));
    try {
      await apiSend(`/api/calendars/${c.id}`, "PATCH", body);
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: qk.overview });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      void qc.invalidateQueries({ queryKey: qk.calendars });
    }
  };
  const remove = async (c: CalendarDTO) => {
    if (!window.confirm(`Delete the calendar “${c.name}”?`)) return;
    try {
      await apiSend(`/api/calendars/${c.id}`, "DELETE");
      await qc.invalidateQueries({ queryKey: qk.calendars });
      toast.success("Calendar deleted.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await apiSend("/api/calendars", "POST", { name: name.trim() });
      setName("");
      await qc.invalidateQueries({ queryKey: qk.calendars });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SettingsSection
      title="Calendars"
      description="Separate calendars on the same sheet, each with its own label colour. Turn off “counts as busy” for calendars that shouldn’t block meetings, like a shared family calendar you only glance at."
    >
      {calendars.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : calendars.isError ? (
        <p role="alert" className="font-semibold text-red-ink-text">
          {errorMessage(calendars.error)}
        </p>
      ) : (
        <ul className="banded border-y border-rule">
          {calendars.data.map((c) => (
            <CalendarRow key={c.id} calendar={c} onPatch={(b) => patch(c, b)} onDelete={() => remove(c)} />
          ))}
        </ul>
      )}
      <form onSubmit={create} className="flex max-w-md items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New calendar, e.g. Family" maxLength={60} aria-label="New calendar name" />
        <Button type="submit" variant="secondary" loading={creating} disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </SettingsSection>
  );
}

function CalendarRow({ calendar: c, onPatch, onDelete }: { calendar: CalendarDTO; onPatch: (b: Partial<CalendarDTO>) => void; onDelete: () => void }) {
  const [name, setName] = useState(c.name);
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-rule px-2 py-2.5 first:border-t-0">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="dymo w-10 shrink-0 justify-center hover:outline-2 hover:outline-offset-1 hover:outline-ink-2"
            style={{ ["--tape-color" as string]: calendarInk(c.position, c.color) }}
            aria-label={`Tape colour for ${c.name}`}
          >
            {calendarCode(c.name)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Tape colour">
            {INKS.map((ink) => {
              const selected = (c.color ?? calendarInk(c.position)) === ink.value;
              return (
                <button
                  key={ink.value}
                  role="radio"
                  aria-checked={selected}
                  title={ink.name}
                  aria-label={ink.name}
                  onClick={() => onPatch({ color: ink.value })}
                  className={cn("flex size-7 items-center justify-center rounded-[2px] text-[var(--tape-text)]", selected && "outline-2 outline-offset-2 outline-ink")}
                  style={{ background: ink.value }}
                >
                  {selected && <Check className="size-3.5" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== c.name && onPatch({ name: name.trim() })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 font-bold hover:border-rule sm:max-w-64"
        aria-label="Calendar name"
        maxLength={60}
      />
      {c.isDefault && <Badge>Default</Badge>}
      <div className="ml-auto flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-small font-semibold text-ink-2">
          <Switch checked={c.isVisible} onCheckedChange={(v) => onPatch({ isVisible: v })} /> Shown
        </label>
        <label className="flex items-center gap-2 text-small font-semibold text-ink-2">
          <Switch checked={c.includeInAvailability} onCheckedChange={(v) => onPatch({ includeInAvailability: v })} /> Counts as busy
        </label>
        <label className="flex items-center gap-2 text-small font-semibold text-ink-2" title="Personal calendars show as “busy” to anyone else, never their titles.">
          <Switch checked={c.isPersonal} onCheckedChange={(v) => onPatch({ isPersonal: v })} /> Personal
        </label>
        {!c.isDefault && (
          <Button size="icon-sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}
