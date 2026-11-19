"use client";

import { Check, TriangleAlert, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import type { PendingActionDTO } from "@/hooks/use-api";
import { errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

/**
 * A hold: what Vele has written on the sheet in dry-wipe marker. It stays in
 * marker, inside a dashed outline, until the person chooses. Confirmed, it
 * prints (typeset, ruled in navy); discarded, it is struck through and left
 * on the sheet, because nothing disappears, it cancels.
 */
export function ActionCard({ action, onResolve }: { action: PendingActionDTO; onResolve: (decision: "confirm" | "decline") => Promise<unknown> }) {
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const s = action.summary;
  const pending = action.status === "PENDING";
  const done = action.status === "EXECUTED";
  const declined = action.status === "DECLINED" || action.status === "EXPIRED" || action.status === "FAILED";

  const act = async (decision: "confirm" | "decline") => {
    setBusy(decision);
    try {
      await onResolve(decision);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[2px] p-3.5",
        pending && "pencil-hatch border-[1.5px] border-dashed border-pencil",
        done && "border-[1.5px] border-ink-2 bg-paper",
        declined && "border-[1.5px] border-dashed border-rule",
      )}
    >
      {done && <div className="animate-ink-in pointer-events-none absolute inset-0 bg-wash" aria-hidden />}
      <div className="relative grid gap-2">
        <div className={cn(declined && "line-through decoration-red-ink decoration-2")}>
          {/* In marker while it is only a hold; typeset once it is booked. */}
          <p className={cn(done ? "text-lead font-extrabold tracking-[-0.01em] text-ink" : "font-hand text-lead font-bold text-hand")}>{s.title}</p>
          <p className={cn("tnum", done ? "text-small font-semibold text-ink-2" : "font-hand text-body text-hand")}>{s.when}</p>
          {s.calendar ? <p className="text-small text-graphite">{s.calendar}</p> : null}
        </div>
        {s.attendees && s.attendees.length > 0 && (
          <p className="flex items-start gap-1.5 text-small text-ink-2">
            <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="break-words">{s.attendees.join(", ")}</span>
          </p>
        )}
        {s.notes.length > 0 && (
          <ul className="grid gap-0.5 border-l-[1.5px] border-rule pl-2.5 text-small text-graphite">
            {s.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {s.warnings.length > 0 && (
          <ul className="grid gap-1 text-small font-semibold text-red-ink-text">
            {s.warnings.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        )}
        {action.error && <p className="text-small font-semibold text-red-ink-text">{action.error}</p>}
        {pending ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => act("confirm")} loading={busy === "confirm"} disabled={busy !== null}>
              {s.heading}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act("decline")} loading={busy === "decline"} disabled={busy !== null}>
              {action.kind === "cancel_event" ? "Keep it" : "Discard"}
            </Button>
            <span className="text-micro font-semibold text-graphite">Held in marker until you choose.</span>
          </div>
        ) : done ? (
          <p className="flex items-center gap-1.5 text-small font-bold text-green-ok">
            <Check className="size-4" aria-hidden /> Booked
          </p>
        ) : (
          <div>
            <Badge tone="red">{action.status === "EXPIRED" ? "Expired" : action.status === "FAILED" ? "Didn't go through" : "Discarded"}</Badge>
          </div>
        )}
      </div>
    </div>
  );
}
