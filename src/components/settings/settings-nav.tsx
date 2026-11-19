"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/availability", label: "Availability" },
  { href: "/settings/calendars", label: "Calendars" },
  { href: "/settings/assistant", label: "Assistant" },
  { href: "/settings/messaging", label: "Messaging" },
  { href: "/settings/privacy", label: "Privacy & data" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:grid md:gap-0 md:border-t-2 md:border-ink-2">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="shrink-0 md:border-b md:border-rule">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-[2px] px-2.5 text-small font-semibold whitespace-nowrap text-ink-2 hover:bg-wash hover:text-ink md:rounded-none",
                  active && "bg-ink-2 font-bold text-paper hover:bg-ink-2 hover:text-paper",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsSection({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <div className="border-t-2 border-ink-2 pt-2">
        <h2 className="text-lead font-extrabold tracking-[-0.01em]">{title}</h2>
        {description ? <p className="mt-0.5 max-w-[55ch] text-small text-graphite">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
