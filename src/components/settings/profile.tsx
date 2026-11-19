"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { applyTheme, useTheme } from "@/components/app/theme";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/primitives";
import { useMe } from "@/hooks/use-api";
import { useDeviceZone, useTimeZoneOptions } from "@/hooks/use-client";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { zoneLabel } from "@/lib/zones";
import { SettingsSection } from "./settings-nav";

export function ProfileSettings() {
  const me = useMe();
  if (me.isPending) return <Skeleton className="h-64 w-full" />;
  if (me.isError) return <p className="text-red-ink-text">{errorMessage(me.error)}</p>;
  const u = me.data.user;
  return <ProfileForm key={`${u.name}|${u.timezone}`} user={u} />;
}

function ProfileForm({ user }: { user: { name: string; email: string; timezone: string } }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [zone, setZone] = useState(user.timezone);
  const [saving, setSaving] = useState(false);
  const theme = useTheme();
  const deviceZone = useDeviceZone();
  const zones = useTimeZoneOptions(zone);

  const dirty = name.trim() !== user.name || zone !== user.timezone;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiSend("/api/me", "PATCH", { name: name.trim(), timezone: zone });
      await qc.invalidateQueries();
      router.refresh(); // the whole app renders in the profile's zone
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSection title="Profile">
        <form className="grid max-w-lg gap-4" onSubmit={save}>
          <Field label="Name">{(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />}</Field>
          <Field label="Email" hint="Used to sign in. Invitations you send come from Vele with this as the reply-to.">
            {(a) => <Input {...a} value={user.email} readOnly disabled />}
          </Field>
          <Field
            label="Time zone"
            hint={
              deviceZone && deviceZone !== zone ? (
                <>
                  This device is set to {deviceZone.replace(/_/g, " ")}.{" "}
                  <button type="button" className="font-medium text-ink underline decoration-rule-strong underline-offset-2" onClick={() => setZone(deviceZone)}>
                    Use that
                  </button>
                </>
              ) : (
                "Every time in Vele is shown in this zone, wherever you open it."
              )
            }
          >
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
          <div>
            <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
              Save profile
            </Button>
          </div>
        </form>
      </SettingsSection>
      <SettingsSection title="Appearance" description="Light, dark, or whatever your system is set to. Saved on this device.">
        <div className="inline-flex flex-wrap justify-self-start overflow-hidden rounded-[2px] border-[1.5px] border-ink-2" role="radiogroup" aria-label="Theme">
          {(
            [
              ["system", "Match system", Monitor],
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              onClick={() => applyTheme(value)}
              className={cn(
                "flex h-9 items-center gap-2 border-l-[1.5px] border-ink-2 px-3.5 text-small font-bold text-ink-2 first:border-l-0 hover:bg-wash",
                theme === value && "bg-ink-2 text-paper hover:bg-ink-2",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </SettingsSection>
    </>
  );
}
