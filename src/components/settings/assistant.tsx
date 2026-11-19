"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { DateTime } from "luxon";
import { useState } from "react";
import { toast } from "sonner";
import { useZone } from "@/components/app/zone";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/primitives";
import { qk, useMe, useMemory, usePreferences, type PreferencesDTO } from "@/hooks/use-api";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { classifyMeetingUrl, MEETING_PROVIDER_LABEL } from "@/lib/meeting-links";
import { SettingsSection } from "./settings-nav";

export function AssistantSettings() {
  const me = useMe();
  return (
    <>
      {me.data && !me.data.features.ai && (
        <div className="rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper-2 p-4 text-small text-ink-2">
          <p className="text-body font-bold text-ink">Vele is running in basic mode.</p>
          <p className="mt-1 max-w-[55ch]">
            No AI key is configured on the server, so Vele understands simple requests with fixed rules. Set GEMINI_API_KEYS to switch on the full assistant.
          </p>
        </div>
      )}
      <VideoLink />
      <Memory />
    </>
  );
}

function VideoLink() {
  const prefs = usePreferences();
  const saved = prefs.data?.defaultVideoLink ?? "";
  return (
    <SettingsSection
      title="Your video link"
      description="Vele doesn’t create meetings in Zoom, Meet or Teams. Paste your personal room link here and Vele adds it when you ask for a video call; booking pages use it too."
    >
      {prefs.isPending ? <Skeleton className="h-20 w-full max-w-lg" /> : <VideoLinkForm key={saved} saved={saved} />}
    </SettingsSection>
  );
}

function VideoLinkForm({ saved }: { saved: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detected = value.trim() ? classifyMeetingUrl(value.trim()) : "NONE";
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiSend<{ preferences: PreferencesDTO }>("/api/preferences", "PUT", { defaultVideoLink: value.trim() || null });
      qc.setQueryData(qk.preferences, res.preferences);
      void qc.invalidateQueries({ queryKey: qk.me });
      toast.success(value.trim() ? "Video link saved." : "Video link removed.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid max-w-lg gap-3">
      <Field
        label="Personal meeting room"
        error={error}
        hint={
          detected !== "NONE" && detected !== "OTHER"
            ? `Recognised as ${MEETING_PROVIDER_LABEL[detected]}.`
            : "For example https://zoom.us/j/1234567890 or https://meet.google.com/abc-defg-hij"
        }
      >
        {(a) => <Input {...a} type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" maxLength={500} />}
      </Field>
      <div>
        <Button type="submit" variant="primary" size="sm" loading={saving} disabled={saved === value.trim()}>
          Save link
        </Button>
      </div>
    </form>
  );
}

function Memory() {
  const memory = useMemory();
  const qc = useQueryClient();
  const zone = useZone();
  const forget = async (key: string) => {
    try {
      await apiSend(`/api/memory?key=${encodeURIComponent(key)}`, "DELETE");
      await qc.invalidateQueries({ queryKey: qk.memory });
      toast.success("Forgotten. The rule it set stays in your availability settings until you change it.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <SettingsSection
      title="What Vele remembers"
      description={
        <>Things you’ve asked Vele to keep in mind, like “no meetings before 10”. Tell it something new in chat (“remember I don’t take calls on Fridays”) and it appears here.</>
      }
    >
      {memory.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : memory.isError ? (
        <p role="alert" className="font-semibold text-red-ink-text">
          {errorMessage(memory.error)}
        </p>
      ) : memory.data.length === 0 ? (
        <p className="border-b border-rule py-3 text-small text-graphite">Nothing yet.</p>
      ) : (
        <ul className="banded border-y border-rule">
          {memory.data.map((m) => (
            <li key={m.key} className="flex items-start gap-3 border-t border-rule px-2 py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold">{m.statement ?? m.key}</p>
                <p className="text-micro font-semibold text-graphite">
                  {m.source === "assistant" ? "Learned in chat" : "Set by you"} · {DateTime.fromISO(m.updatedAt, { zone }).toFormat("d LLL yyyy")}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label="Forget this" onClick={() => forget(m.key)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
