"use client";

import { Command } from "cmdk";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Copy,
  Keyboard,
  Link2,
  LogOut,
  MessageSquareText,
  Moon,
  PanelRight,
  Search,
  Settings2,
  Sun,
  SunMedium,
  UserRound,
} from "lucide-react";
import { DateTime } from "luxon";
import { Dialog as D } from "radix-ui";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMe, type EventDTO } from "@/hooks/use-api";
import { authClient } from "@/lib/auth-client";
import { apiGet } from "@/lib/fetcher";
import { timeRange } from "@/lib/time-client";
import { useAssistantContext } from "./assistant-context";
import { applyTheme } from "./theme";
import { useUI } from "./ui-context";
import { useZone } from "./zone";

interface SearchResult {
  events: EventDTO[];
  people: Array<{ name: string | null; email: string }>;
  bookings: Array<{ id: string; title: string; inviteeName: string; startTime: string; status: string }>;
}

/** ⌘K: every action, every destination, and search over the database. */
export function CommandPalette() {
  const ui = useUI();
  return (
    <D.Root open={ui.palette.open} onOpenChange={ui.setPaletteOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[rgb(var(--shadow-ink)/0.28)]" />
        <D.Content className="data-[state=open]:animate-pencil-in fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[3px] border-[1.5px] border-ink-2 bg-sheet shadow-[var(--shadow-sheet)]">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search your calendar or run an action</D.Description>
          {/* Mounted only while open, so every opening starts blank. */}
          <PaletteBody />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function PaletteBody() {
  const ui = useUI();
  const router = useRouter();
  const pathname = usePathname();
  const zone = useZone();
  const assistant = useAssistantContext();
  const me = useMe();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 180);
  const search = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => apiGet<SearchResult>("/api/search", { q: debounced }),
    enabled: debounced.length >= 2,
    staleTime: 15_000,
  });
  const results = query.trim().length >= 2 ? (search.data ?? null) : null;
  const searching = search.isFetching;

  const close = () => ui.setPaletteOpen(false);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const actions = useMemo(
    () => [
      { id: "create", label: "Create event", icon: CalendarPlus, hint: "C", run: () => ui.openEventDialog() },
      { id: "find", label: "Find time (check availability)", icon: CalendarClock, run: () => ui.setFindTimeOpen(true) },
      {
        id: "ask",
        label: "Ask Vele",
        icon: MessageSquareText,
        hint: "A",
        run: () => (pathname === "/today" || pathname.startsWith("/calendar") ? assistant.focusComposer() : router.push("/assistant")),
      },
      { id: "today", label: "Go to Today", icon: SunMedium, hint: "G", run: () => router.push("/today") },
      { id: "calendar", label: "Go to Calendar", icon: CalendarDays, run: () => router.push("/calendar") },
      { id: "bookings", label: "Go to Bookings", icon: Link2, run: () => router.push("/bookings") },
      { id: "settings", label: "Open settings", icon: Settings2, run: () => router.push("/settings") },
      {
        id: "copy-link",
        label: "Copy my booking link",
        icon: Copy,
        run: async () => {
          const handle = me.data?.bookingHandle;
          if (!handle) return;
          await navigator.clipboard.writeText(`${window.location.origin}/book/${handle}`);
          toast.success("Booking link copied.");
        },
      },
      {
        id: "panel",
        label: assistant.panelOpen ? "Hide the assistant panel" : "Show the assistant panel",
        icon: PanelRight,
        run: () => assistant.setPanelOpen(!assistant.panelOpen),
      },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, hint: "?", run: () => ui.setShortcutsOpen(true) },
      { id: "light", label: "Use the light theme", icon: Sun, run: () => applyTheme("light") },
      { id: "dark", label: "Use the dark theme", icon: Moon, run: () => applyTheme("dark") },
      {
        id: "signout",
        label: "Sign out",
        icon: LogOut,
        run: async () => {
          await authClient.signOut();
          window.location.replace(`${window.location.origin}/sign-in`);
        },
      },
    ],
    [ui, router, pathname, assistant, me.data?.bookingHandle],
  );

  const q = query.trim().toLowerCase();
  const visibleActions = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  const itemClass =
    "flex h-10 cursor-default select-none items-center gap-3 rounded-[2px] px-3 text-body font-semibold text-ink-2 outline-none data-[selected=true]:bg-ink-2 data-[selected=true]:text-paper [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-graphite data-[selected=true]:[&_svg]:text-paper data-[selected=true]:[&_.meta]:text-paper/80";
  const groupClass =
    "[&_[cmdk-group-heading]]:mx-1.5 [&_[cmdk-group-heading]]:mt-2 [&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:border-b-2 [&_[cmdk-group-heading]]:border-ink-2 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:text-small [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:text-ink";

  return (
    <Command shouldFilter={false} label="Command palette" loop>
      <div className="flex items-center gap-2.5 border-b-[1.5px] border-ink-2 px-3.5">
        <Search className="size-4 shrink-0 text-graphite" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={ui.palette.mode === "search" ? "Search events, people and bookings…" : "Type a command, search, or ask Vele…"}
          className="h-12 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-graphite-soft"
        />
        {searching && <span className="size-3.5 animate-spin rounded-[1px] border-2 border-graphite border-r-transparent" aria-label="Searching" />}
      </div>
      <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-body text-graphite">Nothing found.</Command.Empty>
        {q && (
          <Command.Group heading="Vele" className={groupClass}>
            <Command.Item
              value="ask-query"
              className={itemClass}
              onSelect={run(() => {
                if (pathname === "/today" || pathname.startsWith("/calendar")) {
                  assistant.setPanelOpen(true);
                  void assistant.send(query.trim());
                } else {
                  router.push("/assistant");
                  void assistant.send(query.trim());
                }
              })}
            >
              <MessageSquareText />
              <span className="truncate">
                Ask Vele: <span className="font-bold">“{query.trim()}”</span>
              </span>
            </Command.Item>
          </Command.Group>
        )}
        {results && results.events.length > 0 && (
          <Command.Group heading="Events" className={groupClass}>
            {results.events.slice(0, 8).map((e) => (
              <Command.Item
                key={e.id}
                value={`event-${e.id}`}
                className={itemClass}
                onSelect={run(() => router.push(`/calendar?view=day&date=${DateTime.fromISO(e.start, { zone }).toISODate()}&event=${encodeURIComponent(e.id)}`))}
              >
                <CalendarDays />
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <span className="meta tnum shrink-0 text-small text-graphite">
                  {DateTime.fromISO(e.start, { zone }).toFormat("ccc d LLL")} {e.isAllDay ? "" : timeRange(e.start, e.end, zone)}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {results && results.people.length > 0 && (
          <Command.Group heading="People" className={groupClass}>
            {results.people.map((p) => (
              <Command.Item
                key={p.email}
                value={`person-${p.email}`}
                className={itemClass}
                onSelect={run(() => {
                  router.push("/assistant");
                  void assistant.send(`When did I last meet ${p.name ?? p.email}?`);
                })}
              >
                <UserRound />
                <span className="min-w-0 flex-1 truncate">{p.name ?? p.email}</span>
                <span className="meta shrink-0 truncate text-small text-graphite">{p.email}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {results && results.bookings.length > 0 && (
          <Command.Group heading="Bookings" className={groupClass}>
            {results.bookings.map((b) => (
              <Command.Item key={b.id} value={`booking-${b.id}`} className={itemClass} onSelect={run(() => router.push("/bookings"))}>
                <Link2 />
                <span className="min-w-0 flex-1 truncate">
                  {b.title} with {b.inviteeName}
                </span>
                <span className="meta tnum shrink-0 text-small text-graphite">{DateTime.fromISO(b.startTime, { zone }).toFormat("d LLL")}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {visibleActions.length > 0 && (
          <Command.Group heading="Actions" className={groupClass}>
            {visibleActions.map((a) => (
              <Command.Item key={a.id} value={a.id} className={itemClass} onSelect={run(() => void a.run())}>
                <a.icon />
                <span className="flex-1">{a.label}</span>
                {a.hint && <kbd className="meta rounded-[2px] border border-current px-1.5 text-micro font-bold text-graphite">{a.hint}</kbd>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}
