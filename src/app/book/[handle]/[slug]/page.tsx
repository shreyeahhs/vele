import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { PublicFrame } from "@/components/public/public-frame";
import { AppError } from "@/lib/errors";
import { getPublicMeetingType } from "@/server/services/bookings";

type Params = { params: Promise<{ handle: string; slug: string }>; searchParams: Promise<{ invite?: string }> };

async function load(handle: string, slug: string, invite?: string) {
  try {
    return await getPublicMeetingType(handle, slug, invite ?? null);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const [{ handle, slug }, { invite }] = await Promise.all([params, searchParams]);
  const data = await load(handle, slug, invite);
  return { title: `${data.meetingType.title} with ${data.host.displayName}`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function Page({ params, searchParams }: Params) {
  const [{ handle, slug }, { invite }] = await Promise.all([params, searchParams]);
  const data = await load(handle, slug, invite);
  return (
    <PublicFrame>
      {!invite && (
        <Link href={`/book/${handle}`} className="mb-3 ml-1 inline-block text-small font-bold text-wall-ink-2 hover:text-wall-ink">
          <ArrowLeft className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
          All meetings with {data.host.displayName}
        </Link>
      )}
      <BookingFlow handle={handle} host={data.host} type={data.meetingType} invite={invite ?? null} />
    </PublicFrame>
  );
}
