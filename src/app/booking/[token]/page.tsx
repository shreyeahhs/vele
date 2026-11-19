import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManageBooking } from "@/components/booking/manage-booking";
import { PublicFrame } from "@/components/public/public-frame";
import { AppError } from "@/lib/errors";
import { getManagedBooking } from "@/server/services/bookings";

type Params = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: Params) {
  const { token } = await params;
  let booking;
  try {
    booking = await getManagedBooking(token);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  return (
    <PublicFrame>
      <ManageBooking token={token} initial={booking} />
    </PublicFrame>
  );
}
