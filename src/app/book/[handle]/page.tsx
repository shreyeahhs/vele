import { ArrowRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocationLine } from "@/components/booking/booking-flow";
import { PublicFrame } from "@/components/public/public-frame";
import { AppError } from "@/lib/errors";
import { durationText } from "@/lib/time-client";
import { getPublicProfile } from "@/server/services/bookings";

type Params = { params: Promise<{ handle: string }> };

async function load(handle: string) {
  try {
    return await getPublicProfile(handle);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const profile = await load(handle);
  return { title: `Book time with ${profile.displayName}`, robots: { index: false, follow: false } };
}

export default async function Page({ params }: Params) {
  const { handle } = await params;
  const profile = await load(handle);
  return (
    <PublicFrame>
      <div className="sheet mx-auto max-w-2xl overflow-hidden">
        <header className="band m-1.5 rounded-[2px] px-5 pt-6 pb-5">
          <h1 className="text-title leading-tight font-extrabold tracking-[-0.02em]">Book time with {profile.displayName}</h1>
          {profile.headline && <p className="mt-1 text-body font-semibold text-band-ink-2">{profile.headline}</p>}
        </header>
        {profile.welcomeMessage && <p className="max-w-[55ch] px-5 pt-4 text-body whitespace-pre-wrap text-ink-2">{profile.welcomeMessage}</p>}
        {profile.meetingTypes.length === 0 ? (
          <p className="px-5 pt-4 pb-6 text-body text-graphite">There’s nothing to book here right now. If someone sent you a link to a specific meeting, use that.</p>
        ) : (
          <ul className="banded mx-5 mt-4 mb-6 border-t-2 border-ink-2">
            {profile.meetingTypes.map((t) => (
              <li key={t.slug} className="border-b border-rule">
                <Link href={`/book/${handle}/${t.slug}`} className="group flex items-center gap-4 px-2 py-4 transition-colors hover:bg-wash">
                  <div className="min-w-0 flex-1">
                    <p className="text-lead font-extrabold tracking-[-0.01em]">{t.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small font-semibold text-ink-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-4 text-graphite" aria-hidden /> {durationText(t.durationMin)}
                      </span>
                      <LocationLine type={t.locationType} hint={t.locationHint} />
                    </p>
                    {t.description && <p className="mt-1.5 line-clamp-2 max-w-[55ch] text-small text-graphite">{t.description}</p>}
                  </div>
                  <ArrowRight className="size-5 shrink-0 text-ink-2 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicFrame>
  );
}
