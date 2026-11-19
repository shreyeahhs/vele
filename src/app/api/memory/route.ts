import { z } from "zod";
import { route } from "@/lib/api";
import { forgetMemory, listMemory } from "@/server/services/memory";

export const GET = route({}, async ({ user }) => ({ memory: await listMemory(user.id) }));

export const DELETE = route({ query: z.object({ key: z.string().min(1).max(120) }) }, async ({ user, query }) => {
  await forgetMemory(user.id, query.key);
  return { ok: true };
});
