import { route } from "@/lib/api";
import { listContacts } from "@/server/services/contacts";

export const GET = route({}, async ({ user }) => ({ contacts: await listContacts(user.id) }));
