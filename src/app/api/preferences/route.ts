import { route } from "@/lib/api";
import { getPreferences, preferencesSchema, updatePreferences } from "@/server/services/preferences";

export const GET = route({}, async ({ user }) => ({ preferences: await getPreferences(user.id) }));

export const PUT = route({ body: preferencesSchema }, async ({ user, body }) => ({ preferences: await updatePreferences(user.id, body, "user") }));
