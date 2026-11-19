import { route } from "@/lib/api";
import { bookingProfileSchema, getBookingSettings, updateBookingProfile } from "@/server/services/bookings";

export const GET = route({}, async ({ user }) => getBookingSettings(user.id));

export const PATCH = route({ body: bookingProfileSchema }, async ({ user, body }) => updateBookingProfile(user.id, body));
