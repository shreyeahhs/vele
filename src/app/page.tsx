import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { Mark, Wordmark } from "@/components/brand";
import { AskFilm } from "@/components/marketing/ask-film";
import { LinkFilm } from "@/components/marketing/link-film";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { getSessionUser } from "@/server/session";

const PROMISES = [
  { title: "It never guesses an email.", body: "It only invites addresses you’ve given it." },
  { title: "Nothing changes behind your back.", body: "Invites, moves and cancellations wait for your yes." },
  { title: "It shows its working.", body: "Every suggested time says why it fits." },
  { title: "It tells you what happened.", body: "Sent, logged or failed. Never implied." },
];

export default async function Home() {
  const user = await getSessionUser();
  const primaryHref = user ? "/today" : "/sign-in?mode=sign-up";
  const primaryLabel = user ? "Open your week" : "Create your calendar";

  return (
    <div className="paper-grain min-h-dvh bg-wall text-ink">
      <header className="mx-auto flex h-18 max-w-[1180px] items-center justify-between gap-3 px-5 md:px-8">
        <Link href="/" aria-label={`${brand.name} home`} className="rounded-[2px]">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
          <a href="#how" className="hidden rounded-[2px] px-3 py-2 text-small font-bold text-wall-ink-2 hover:text-wall-ink sm:block">
            How it works
          </a>
          {!user && (
            <Link href="/sign-in" className="rounded-[2px] px-3 py-2 text-small font-bold text-wall-ink-2 hover:text-wall-ink">
              Sign in
            </Link>
          )}
          <Button asChild size="sm" variant="primary">
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
        </nav>
      </header>

      <main>
        {/* One idea, said once. */}
        <section aria-labelledby="hero" className="mx-auto max-w-[1180px] px-5 pt-16 pb-14 md:px-8 md:pt-28 md:pb-20">
          <h1 id="hero" className="max-w-[17ch] text-headline font-extrabold tracking-[-0.03em] text-balance sm:text-display">
            Vele pencils it in. You decide what gets booked.
          </h1>
          <p className="mt-7 max-w-[34rem] text-lead leading-relaxed font-normal text-ink-2">
            Ask for time in plain words. Vele suggests times from your real week, and books nothing until you say yes.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Button asChild size="lg" variant="primary">
              <Link href={primaryHref}>
                {primaryLabel} <ArrowRight />
              </Link>
            </Button>
            <a href="#how" className="inline-flex items-center gap-2 text-body font-bold text-ink-2 hover:text-ink">
              <Play className="size-4" /> Watch it work
            </a>
          </div>
        </section>

        {/* The film does the explaining. */}
        <section id="how" aria-label="How it works" className="mx-auto max-w-[1180px] scroll-mt-6 px-3 pb-28 md:px-8 md:pb-40">
          <AskFilm />
        </section>

        {/* Booking links. */}
        <section
          aria-labelledby="links-h"
          className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-28 md:px-8 md:pb-40 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20"
        >
          <div>
            <h2 id="links-h" className="max-w-[14ch] text-title font-extrabold tracking-[-0.02em] text-balance md:text-headline">
              Share one link. Let people book themselves.
            </h2>
            <p className="mt-6 max-w-[30rem] text-lead leading-relaxed font-normal text-ink-2">
              Visitors only see times that are genuinely free, in their own time zone. Each booking lands on your sheet.
            </p>
          </div>
          <div className="-mx-2 md:mx-0">
            <LinkFilm />
          </div>
        </section>

        {/* The promises, briefly. */}
        <section aria-labelledby="promises-h" className="mx-auto max-w-[1180px] px-5 pb-28 md:px-8 md:pb-40">
          <h2 id="promises-h" className="max-w-[18ch] text-title font-extrabold tracking-[-0.02em] text-balance md:text-headline">
            An assistant with manners.
          </h2>
          <ul className="mt-12 grid gap-x-16 gap-y-10 sm:grid-cols-2">
            {PROMISES.map((p) => (
              <li key={p.title} className="border-t-2 border-ink-2 pt-4">
                <h3 className="text-lead font-extrabold tracking-[-0.01em]">{p.title}</h3>
                <p className="mt-2 text-body leading-relaxed text-ink-2">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* From a phone. */}
        <section aria-labelledby="phone-h" className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 pb-28 md:px-8 md:pb-40 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 id="phone-h" className="text-title font-extrabold tracking-[-0.02em] md:text-headline">
              Or just message it.
            </h2>
            <p className="mt-6 max-w-[30rem] text-lead leading-relaxed font-normal text-ink-2">
              Link Telegram once and ask from anywhere. The same rules apply. WhatsApp works too, once a business number is set up.
            </p>
          </div>
          <Chat />
        </section>

        {/* The close. */}
        <section aria-labelledby="start-h" className="mx-auto max-w-[1180px] px-5 pb-24 md:px-8 md:pb-32">
          <div className="sheet px-6 py-14 text-center md:py-20">
            <h2 id="start-h" className="text-title font-extrabold tracking-[-0.02em] md:text-headline">
              A fresh sheet is waiting.
            </h2>
            <p className="mx-auto mt-4 max-w-[28rem] text-lead leading-relaxed font-normal text-ink-2">Set your hours in a minute. Everything else, just ask.</p>
            <Button asChild size="lg" variant="primary" className="mt-9">
              <Link href={primaryHref}>
                {primaryLabel} <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 border-t border-wall-line px-5 py-8 text-small text-wall-ink-2 md:px-8">
        <span className="inline-flex items-center gap-2">
          <Mark className="size-5" /> {brand.name}. Your calendar stays in your own database.
        </span>
        <Link href="/sign-in" className="font-bold hover:text-wall-ink">
          Sign in
        </Link>
      </footer>
    </div>
  );
}

function Chat() {
  const log: Array<["You" | "Vele", string]> = [
    ["You", "what’s left today?"],
    ["Vele", "Demo prep at 14:30, then you’re free."],
    ["You", "block 4 to 6 for writing"],
    ["Vele", "Booked “Writing”, 16:00–18:00."],
  ];
  return (
    <figure className="sheet mx-auto w-full max-w-md overflow-hidden">
      <figcaption className="sr-only">An example Telegram conversation with Vele</figcaption>
      <div className="band m-1.5 flex items-center gap-2.5 rounded-[2px] px-3 py-2.5">
        <Mark className="size-6" />
        <p className="text-body font-extrabold">Vele</p>
        <p className="text-small font-semibold text-band-ink-2">on Telegram</p>
      </div>
      <ol className="grid gap-4 px-5 pt-4 pb-6">
        {log.map(([who, text], i) => (
          <li key={i} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
            <span className="pt-1 text-micro font-extrabold text-graphite">{who}</span>
            <p className={who === "You" ? "text-body font-bold text-ink" : "text-body text-ink-2"}>{text}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
