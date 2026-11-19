"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <div role="alert" className="grid w-full max-w-md gap-3 border-t-2 border-red-ink pt-3">
        <h1 className="text-title leading-tight font-extrabold tracking-[-0.02em]">This page hit a snag while loading.</h1>
        <p className="text-body text-ink-2">Nothing in your calendar was changed. Try again; if it keeps happening, reload the page.</p>
        {error.digest && <p className="font-mono text-micro text-graphite">Reference {error.digest}</p>}
        <Button variant="primary" className="justify-self-start" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
