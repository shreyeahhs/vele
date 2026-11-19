"use client";

import { Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/primitives";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { SettingsSection } from "./settings-nav";

const PHRASE = "delete my account";

export function PrivacySettings() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try {
      await apiSend("/api/account", "DELETE", { confirm: PHRASE });
      // A full load, so nothing from the deleted account stays in memory.
      window.location.replace(`${window.location.origin}/`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <>
      <SettingsSection title="What Vele keeps" description="Everything lives in this app’s own database. Nothing is sold or shared.">
        <ul className="banded grid max-w-[55ch] border-t border-rule text-small text-ink-2 [&>li]:border-b [&>li]:border-rule [&>li]:px-2 [&>li]:py-2">
          <li>Your calendars, events, guests’ names and emails, and booking pages.</li>
          <li>Your conversations with Vele, and the rules it remembers for you.</li>
          <li>
            When the full assistant is on, each message you send goes to Google’s Gemini API together with the part of your calendar it needs. Apart from that, nothing leaves the
            server except the emails you ask Vele to send.
          </li>
          <li>A security log of changes, with IP addresses stored only as hashes, and your signed-in sessions with the browser and IP address each one came from.</li>
        </ul>
      </SettingsSection>
      <SettingsSection title="Download your data" description="One JSON file with everything above.">
        <div>
          <Button variant="secondary" asChild>
            <a href="/api/account/export" download>
              <Download /> Download export
            </a>
          </Button>
        </div>
      </SettingsSection>
      <SettingsSection title="Delete your account" description="Removes your account and everything in it straight away. People who booked with you are not emailed.">
        <div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete account…
          </Button>
        </div>
      </SettingsSection>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Delete your account?" description="This can’t be undone.">
          <div className="flex gap-2.5 rounded-[2px] border border-red-ink bg-red-wash p-3 text-small font-semibold text-ink">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-ink-text" />
            Your calendars, events, bookings, conversations and settings will be permanently removed.
          </div>
          <Field label={`Type “${PHRASE}” to confirm`}>
            {(a) => <Input {...a} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button variant="danger" loading={busy} disabled={typed.trim().toLowerCase() !== PHRASE} onClick={del}>
              Delete everything
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
