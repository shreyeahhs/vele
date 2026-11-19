import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="paper-grain flex min-h-dvh flex-col items-center justify-center gap-6 bg-wall px-3 py-10">
      <Wordmark />
      <div className="sheet w-full max-w-lg overflow-hidden">
        <div className="band m-1.5 rounded-[2px] px-5 pt-6 pb-5">
          <p className="tnum text-small font-bold text-band-ink-2">404</p>
          <h1 className="text-title leading-tight font-extrabold tracking-[-0.02em]">Nothing is booked at this address.</h1>
        </div>
        <div className="grid gap-4 px-5 pt-3 pb-5">
          <p className="max-w-[55ch] text-body text-ink-2">
            The link may be mistyped, or whatever it pointed to has been removed. Private booking links stop working once they’ve been used.
          </p>
          <Button asChild variant="secondary" className="justify-self-start">
            <Link href="/">Go to the front page</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
