import { route } from "@/lib/api";
import { createMeetingType, meetingTypeSchema } from "@/server/services/bookings";

export const POST = route({ body: meetingTypeSchema }, async ({ user, body }) => ({ meetingType: await createMeetingType(user.id, body) }));
