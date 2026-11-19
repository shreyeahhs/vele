import { route } from "@/lib/api";
import { listConversations } from "@/server/ai/agent";

export const GET = route({}, async ({ user }) => ({ conversations: await listConversations(user.id) }));
