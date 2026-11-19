import type { z } from "zod";
import { clientIp, route } from "@/lib/api";
import { limits } from "@/lib/rate-limit";
import { bookSchema, createBooking } from "@/server/services/bookings";

type P = { handle: string; slug: string };

/** Books a slot. The server re-validates availability; the page's slot list is never trusted. */
export const POST = route<z.infer<typeof bookSchema>, undefined, P, false>(
  { auth: false, body: bookSchema, rateLimit: { rule: limits.publicBook, key: "ip" } },
  async ({ req, params, body }) => {
    const res = await createBooking(params.handle, params.slug, body, { ip: clientIp(req) });
    // The host's address is for the server-side reply-to only.
    const { hostEmail, ...publicResult } = res;
    void hostEmail;
    return publicResult;
  },
);
