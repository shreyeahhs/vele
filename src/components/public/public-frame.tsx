import Link from "next/link";
import { Mark } from "@/components/brand";
import { brand } from "@/config/brand";

/** The frame around pages people outside the account see: the host's sheet on the desk, and nothing louder. */
export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-grain flex min-h-dvh flex-col bg-wall">
      <main className="mx-auto w-full max-w-[960px] flex-1 px-2 py-6 sm:px-4 md:py-12">{children}</main>
      <footer className="pb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2 rounded-[2px] px-2 py-1 text-small font-semibold text-wall-ink-2 hover:text-wall-ink">
          <Mark className="size-5" /> Scheduling by {brand.name}
        </Link>
      </footer>
    </div>
  );
}
