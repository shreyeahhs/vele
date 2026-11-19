import { z } from "zod";
import { route } from "@/lib/api";
import { listBookings } from "@/server/services/bookings";

export const GET = route({ query: z.object({ filter: z.enum(["upcoming", "past", "cancelled"]).default("upcoming") }) }, async ({ user, query }) => ({
  bookings: await listBookings(user.id, query.filter, 100),
}));
