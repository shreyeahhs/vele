"use client";

import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { useState } from "react";
import { PageHeader } from "@/components/app/shell";
import { useZone } from "@/components/app/zone";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { apiGet, errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

interface Email {
  id: string;
  type: string;
  recipient: string;
  subject: string | null;
  status: string;
  provider: string | null;
  createdAt: string;
  html: string | null;
}

/** Development: every email the app would have sent, rendered as the recipient would see it. */
export function DevOutbox() {
  const zone = useZone();
  const q = useQuery({ queryKey: ["dev-outbox"], queryFn: () => apiGet<{ emails: Email[] }>("/api/dev/outbox"), refetchInterval: 5000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = q.data?.emails.find((e) => e.id === openId) ?? q.data?.emails[0] ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Outbox" subtitle="Development only. Emails your account triggered; console-mode ones were never sent." />
      {q.isPending ? (
        <Skeleton className="m-6 h-64" />
      ) : q.isError ? (
        <p role="alert" className="m-6 font-semibold text-red-ink-text">
          {errorMessage(q.error)}
        </p>
      ) : q.data.emails.length === 0 ? (
        <p className="m-6 text-body text-graphite">Nothing yet. Invite someone to an event or book through your own link.</p>
      ) : (
        <div className="grid min-h-0 flex-1 md:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="banded min-h-0 overflow-y-auto border-r-[1.5px] border-ink-2">
            {q.data.emails.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setOpenId(e.id)}
                  className={cn(
                    "grid w-full gap-0.5 border-b border-rule px-4 py-3 text-left hover:bg-wash",
                    open?.id === e.id && "bg-ink-2 text-paper hover:bg-ink-2 [&_.meta]:text-paper/80",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-small font-bold">{e.subject ?? e.type}</span>
                    <Badge tone={e.status === "SENT" ? "green" : e.status === "FAILED" ? "red" : "pencil"}>{e.status.toLowerCase()}</Badge>
                  </span>
                  <span className="meta truncate text-small text-graphite">to {e.recipient}</span>
                  <span className="meta tnum text-micro font-semibold text-graphite">{DateTime.fromISO(e.createdAt, { zone }).toFormat("d LLL HH:mm:ss")}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-h-[60vh] bg-paper-2 p-4">
            {open?.html ? (
              <iframe title={open.subject ?? "Email"} sandbox="" srcDoc={open.html} className="h-full min-h-[60vh] w-full rounded-[2px] border-[1.5px] border-ink-2 bg-white" />
            ) : (
              <p className="text-small text-graphite">This one was sent through a real provider, so only the record is kept.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
