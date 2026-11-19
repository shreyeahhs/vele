import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { DiaryDemo } from "@/components/marketing/diary-demo";

/** Sign-in and first-run: the form as a sheet on the desk, a week of the booking sheet beside it. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-grain grid min-h-dvh bg-wall lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-3 py-5 sm:px-10">
        <Link href="/" className="self-start rounded-[2px]" aria-label="Vele home">
          <Wordmark />
        </Link>
        <main className="flex flex-1 items-center py-8">
          <div className="sheet mx-auto w-full max-w-[420px] p-1.5">{children}</div>
        </main>
      </div>
      <aside className="relative hidden items-center justify-center overflow-hidden border-l border-wall-line p-10 lg:flex" aria-hidden>
        <div className="w-full max-w-[600px]">
          <DiaryDemo interactive={false} />
          <p className="mt-4 text-small font-semibold text-wall-ink-2">Vele writes its suggestions in marker. Only you turn them into bookings.</p>
        </div>
      </aside>
    </div>
  );
}
