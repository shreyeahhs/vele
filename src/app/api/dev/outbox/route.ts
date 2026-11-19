import { route } from "@/lib/api";
import { errors } from "@/lib/errors";
import { db } from "@/server/db";

/** Development only: emails the console provider logged instead of sending. */
export const GET = route({}, async ({ user }) => {
  if (process.env.NODE_ENV === "production") throw errors.notFound("The outbox");
  const rows = await db.notification.findMany({
    where: { userId: user.id, channel: "EMAIL" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, recipient: true, subject: true, status: true, provider: true, createdAt: true, payload: true },
  });
  return {
    emails: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      html: r.provider === "console" ? ((r.payload as { html?: string } | null)?.html ?? null) : null,
      payload: undefined,
    })),
  };
});
