import { route } from "@/lib/api";
import { getOverview } from "@/server/services/overview";

export const GET = route({}, async ({ user }) => getOverview(user.id));
