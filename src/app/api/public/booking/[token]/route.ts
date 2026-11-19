import { route } from "@/lib/api";
import { limits } from "@/lib/rate-limit";
import { getManagedBooking } from "@/server/services/bookings";

type P = { token: string };

export const GET = route<undefined, undefined, P, false>({ auth: false, rateLimit: { rule: limits.publicManage, key: "ip" } }, async ({ params }) =>
  getManagedBooking(params.token),
);
