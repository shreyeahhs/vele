import { route } from "@/lib/api";
import { getConversation } from "@/server/ai/agent";
import { db } from "@/server/db";

type P = { id: string };

export const GET = route<undefined, undefined, P>({}, async ({ user, params }) => getConversation(user.id, params.id));

export const DELETE = route<undefined, undefined, P>({}, async ({ user, params }) => {
  await db.conversation.deleteMany({ where: { id: params.id, userId: user.id } });
  return { ok: true };
});
