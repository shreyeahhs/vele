import { route } from "@/lib/api";
import { errors } from "@/lib/errors";
import { features } from "@/lib/env";
import { db } from "@/server/db";

/**
 * Operator view for a multi-user deployment: accounts, activity, assistant
 * usage, delivery and messaging health. Aggregates and identifiers only; no
 * calendar content.
 */
export const GET = route({}, async ({ user }) => {
  if (user.role !== "admin") throw errors.forbidden();
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const started = Date.now();
  await db.$queryRaw`SELECT 1`;
  const dbLatencyMs = Date.now() - started;

  const [users, userCount, eventCount, bookings30, aiRuns, aiByStatus, notifications, identities, pendingOpen] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        createdAt: true,
        timezone: true,
        _count: { select: { events: true, bookings: true, conversations: true } },
      },
    }),
    db.user.count(),
    db.calendarEvent.count(),
    db.booking.groupBy({ by: ["status"], where: { createdAt: { gte: since30 } }, _count: true }),
    db.aiRun.aggregate({ where: { createdAt: { gte: since7 } }, _count: true, _sum: { inputTokens: true, outputTokens: true, thoughtTokens: true }, _avg: { latencyMs: true } }),
    db.aiRun.groupBy({ by: ["status", "model"], where: { createdAt: { gte: since7 } }, _count: true }),
    db.notification.groupBy({ by: ["status", "channel"], where: { createdAt: { gte: since7 } }, _count: true }),
    db.messagingIdentity.groupBy({ by: ["provider"], _count: true }),
    db.pendingAction.count({ where: { status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);

  return {
    system: { database: "ok", dbLatencyMs, features: features(), node: process.version },
    totals: { users: userCount, events: eventCount, pendingConfirmations: pendingOpen },
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      banned: Boolean(u.banned),
      timezone: u.timezone,
      createdAt: u.createdAt.toISOString(),
      events: u._count.events,
      bookings: u._count.bookings,
      conversations: u._count.conversations,
    })),
    bookings30d: bookings30.map((b) => ({ status: b.status, count: b._count })),
    ai7d: {
      runs: aiRuns._count,
      inputTokens: aiRuns._sum.inputTokens ?? 0,
      outputTokens: aiRuns._sum.outputTokens ?? 0,
      thoughtTokens: aiRuns._sum.thoughtTokens ?? 0,
      avgLatencyMs: Math.round(aiRuns._avg.latencyMs ?? 0),
      byStatus: aiByStatus.map((r) => ({ status: r.status, model: r.model, count: r._count })),
    },
    notifications7d: notifications.map((n) => ({ status: n.status, channel: n.channel, count: n._count })),
    messaging: identities.map((i) => ({ provider: i.provider, linked: i._count })),
  };
});
