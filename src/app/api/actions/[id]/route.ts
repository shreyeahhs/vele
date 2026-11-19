import { z } from "zod";
import { route } from "@/lib/api";
import { declinePendingAction, executePendingAction } from "@/server/ai/actions";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type P = { id: string };

/** The "Confirm" / "Discard" buttons on a pencilled-in change. */
export const POST = route<{ decision: "confirm" | "decline" }, undefined, P>({ body: z.object({ decision: z.enum(["confirm", "decline"]) }) }, async ({ user, body, params }) => {
  if (body.decision === "decline") return { action: await declinePendingAction(user.id, params.id) };
  const res = await executePendingAction(user.id, params.id, "ui");
  // Record the outcome in the conversation so the transcript stays truthful.
  const action = await db.pendingAction.findFirst({ where: { id: params.id, userId: user.id }, select: { conversationId: true } });
  if (action?.conversationId) {
    const logged = res.invitations.some((i) => i.status === "logged");
    const sent = res.invitations.filter((i) => i.status === "sent").map((i) => i.email);
    const failed = res.invitations.filter((i) => i.status === "failed").map((i) => i.email);
    const text = [
      `${res.message}.`,
      ...(sent.length ? [`Invitation sent to ${sent.join(", ")}.`] : []),
      ...(logged ? ["Invitations were logged in development mode, not actually sent."] : []),
      ...(failed.length ? [`Sending to ${failed.join(", ")} failed.`] : []),
    ].join(" ");
    await db.conversationMessage.create({
      data: {
        conversationId: action.conversationId,
        userId: user.id,
        role: "ASSISTANT",
        text,
        blocks: [],
        ui: { trace: [], proposals: [], actions: [res.action], created: [], changed: true } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return res;
});
