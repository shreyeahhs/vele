"use client";

import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { PageHeader } from "@/components/app/shell";
import { Badge, SectionHead, Skeleton } from "@/components/ui/primitives";
import { apiGet, errorMessage } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

interface AdminOverview {
  system: { database: string; dbLatencyMs: number; features: Record<string, boolean>; node: string };
  totals: { users: number; events: number; pendingConfirmations: number };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string | null;
    banned: boolean;
    timezone: string;
    createdAt: string;
    events: number;
    bookings: number;
    conversations: number;
  }>;
  bookings30d: Array<{ status: string; count: number }>;
  ai7d: { runs: number; inputTokens: number; outputTokens: number; thoughtTokens: number; avgLatencyMs: number; byStatus: Array<{ status: string; model: string; count: number }> };
  notifications7d: Array<{ status: string; channel: string; count: number }>;
  messaging: Array<{ provider: string; linked: number }>;
}

const fmt = new Intl.NumberFormat("en-GB");

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="border-b border-rule px-3 py-3 sm:border-b-0 sm:border-l sm:first:border-l-0 lg:[&:nth-child(3)]:border-l">
      <dt className="text-small font-bold text-ink-2">{label}</dt>
      <dd className="tnum mt-0.5 text-title leading-tight font-extrabold tracking-[-0.02em]">{value}</dd>
      {note ? <dd className="text-micro font-semibold text-graphite">{note}</dd> : null}
    </div>
  );
}

export function AdminPage() {
  const q = useQuery({ queryKey: ["admin"], queryFn: () => apiGet<AdminOverview>("/api/admin/overview"), refetchInterval: 30_000 });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Admin" subtitle="Accounts and system health. Aggregates only; no calendar content." />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-6 pb-10 md:px-8">
        {q.isPending ? (
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : q.isError ? (
          <p role="alert" className="font-semibold text-red-ink-text">
            {errorMessage(q.error)}
          </p>
        ) : (
          <>
            <dl className="grid border-y-2 border-ink-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Accounts" value={fmt.format(q.data.totals.users)} />
              <Stat label="Events stored" value={fmt.format(q.data.totals.events)} />
              <Stat label="Assistant turns (7 days)" value={fmt.format(q.data.ai7d.runs)} note={q.data.ai7d.runs ? `avg ${fmt.format(q.data.ai7d.avgLatencyMs)} ms` : undefined} />
              <Stat
                label="Database"
                value={q.data.system.database === "ok" ? "Healthy" : "Down"}
                note={`${q.data.system.dbLatencyMs} ms round trip · Node ${q.data.system.node}`}
              />
            </dl>

            <section className="grid gap-3">
              <SectionHead title="Integrations" />
              <div className="flex flex-wrap gap-2">
                {Object.entries(q.data.system.features).map(([k, on]) => (
                  <Badge key={k} tone={on ? "green" : "pencil"}>
                    {k}: {on ? "on" : "off"}
                  </Badge>
                ))}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
              <Table
                title="Assistant, last 7 days"
                head={["Model", "Result", "Turns"]}
                rows={q.data.ai7d.byStatus.map((r) => [r.model, r.status, fmt.format(r.count)])}
                foot={`${fmt.format(q.data.ai7d.inputTokens)} in · ${fmt.format(q.data.ai7d.outputTokens)} out · ${fmt.format(q.data.ai7d.thoughtTokens)} thinking tokens`}
              />
              <Table title="Deliveries, last 7 days" head={["Channel", "Status", "Count"]} rows={q.data.notifications7d.map((n) => [n.channel, n.status, fmt.format(n.count)])} />
              <Table
                title="Bookings, last 30 days"
                head={["Status", "Count"]}
                rows={q.data.bookings30d.map((b) => [b.status, fmt.format(b.count)])}
                foot={q.data.messaging.length ? `Linked chats: ${q.data.messaging.map((m) => `${m.provider.toLowerCase()} ${m.linked}`).join(", ")}` : undefined}
              />
            </div>

            <section className="grid gap-1">
              <SectionHead title="Accounts" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-small">
                  <thead className="band text-small">
                    <tr>
                      <th className="px-4 py-1.5 font-extrabold">Name</th>
                      <th className="px-4 py-1.5 font-extrabold">Email</th>
                      <th className="px-4 py-1.5 font-extrabold">Time zone</th>
                      <th className="px-4 py-1.5 text-right font-extrabold">Events</th>
                      <th className="px-4 py-1.5 text-right font-extrabold">Bookings</th>
                      <th className="px-4 py-1.5 text-right font-extrabold">Chats</th>
                      <th className="px-4 py-1.5 font-extrabold">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="banded">
                    {q.data.users.map((u) => (
                      <tr key={u.id} className={cn("border-b border-rule", u.banned && "text-graphite line-through")}>
                        <td className="px-4 py-2 font-bold">
                          {u.name} {u.role === "admin" && <Badge className="ml-1">admin</Badge>}
                        </td>
                        <td className="px-4 py-2">{u.email}</td>
                        <td className="px-4 py-2 text-graphite">{u.timezone}</td>
                        <td className="tnum px-4 py-2 text-right">{fmt.format(u.events)}</td>
                        <td className="tnum px-4 py-2 text-right">{fmt.format(u.bookings)}</td>
                        <td className="tnum px-4 py-2 text-right">{fmt.format(u.conversations)}</td>
                        <td className="tnum px-4 py-2 text-graphite">{DateTime.fromISO(u.createdAt).toFormat("d LLL yyyy")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Table({ title, head, rows, foot }: { title: string; head: string[]; rows: string[][]; foot?: string }) {
  return (
    <section className="grid content-start gap-1">
      <SectionHead title={title} />
      <div>
        {rows.length === 0 ? (
          <p className="border-b border-rule px-2 py-3 text-small text-graphite">Nothing yet.</p>
        ) : (
          <table className="w-full text-left text-small">
            <thead className="band text-small">
              <tr>
                {head.map((h, i) => (
                  <th key={h} className={cn("px-2 py-1.5 font-extrabold", i === head.length - 1 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="banded">
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-rule">
                  {r.map((c, j) => (
                    <td key={j} className={cn("px-2 py-1.5", j === r.length - 1 && "tnum text-right font-bold")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {foot && <p className="px-2 py-2 text-micro font-semibold text-graphite">{foot}</p>}
      </div>
    </section>
  );
}
