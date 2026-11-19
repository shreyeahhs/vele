import { route } from "@/lib/api";
import { rangeQuery } from "@/lib/api-schemas";
import { conflictsForUser } from "@/server/services/availability";

export const GET = route({ query: rangeQuery }, async ({ user, query }) => conflictsForUser(user.id, query));
