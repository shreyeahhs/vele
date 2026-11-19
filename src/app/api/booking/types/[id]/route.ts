import type { z } from "zod";
import { route } from "@/lib/api";
import { deleteMeetingType, meetingTypeSchema, updateMeetingType } from "@/server/services/bookings";

type P = { id: string };
const patch = meetingTypeSchema.partial();

export const PATCH = route<z.infer<typeof patch>, undefined, P>({ body: patch }, async ({ user, body, params }) => ({
  meetingType: await updateMeetingType(user.id, params.id, body),
}));

export const DELETE = route<undefined, undefined, P>({}, async ({ user, params }) => {
  await deleteMeetingType(user.id, params.id);
  return { ok: true };
});
