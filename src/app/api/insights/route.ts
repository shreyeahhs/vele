import { route } from "@/lib/api";
import { rangeQuery } from "@/lib/api-schemas";
import { insightsForUser } from "@/server/services/availability";

export const GET = route({ query: rangeQuery }, async ({ user, query }) => insightsForUser(user.id, query));
