"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Link2, LogOut, Monitor, Moon, PanelRight, Plus, Search, Settings2, ShieldCheck, Sun, SunMedium } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import { Mark, Wordmark } from "@/components/brand";
import { MiniMonth } from "@/components/calendar/mini-month";
import { Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tape, Tip } from "@/components/ui/primitives";
import { qk, useCalendars, useMe } from "@/hooks/use-api";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { authClient } from "@/lib/auth-client";
import { apiSend, errorMessage } from "@/lib/fetcher";
import { calendarCode, calendarInk, cn, initials } from "@/lib/utils";
import { AssistantProvider, useAssistantContext } from "./assistant-context";
import { CommandPalette } from "./command-palette";
import { EventDialog } from "./event-dialog";
import { FindTimeDialog } from "./find-time-dialog";
import { PencilProvider } from "./pencil-context";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { applyTheme, useTheme, type ThemeChoice } from "./theme";
import { UIProvider, useUI } from "./ui-context";
import { ZoneProvider } from "./zone";
import { VeleMargin } from "@/components/assistant/vele-margin";

export interface ShellUser {
  name: string;
  email: string;
  role: string;
  timezone: string;
}

const NAV = [
  { href: "/today", label: "Today", icon: SunMedium },
  { href: "/calendar", label: "Week", icon: CalendarDays },
  { href: "/bookings", label: "Bookings", icon: Link2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  return (
    <ZoneProvider zone={user.timezone}>
      <UIProvider>
        <PencilProvider>
          <AssistantProvider>
            <ShellFrame user={user}>{children}</ShellFrame>
          </AssistantProvider>
        </PencilProvider>
      </UIProvider>
    </ZoneProvider>
  );
}

/** Pages where Vele's memo sheet is pinned beside the page on wide screens. */
function hasMargin(pathname: string) {
  return pathname === "/today" || pathname.startsWith("/calendar");
}

/**
 * The desk: the directory on the left and the page as a sheet laid on it. Vele's memo sheet is pinned
 * beside the page on wide screens.
 */
function ShellFrame({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const ui = useUI();
  const assistant = useAssistantContext();
  const showMargin = hasMargin(pathname) && assistant.panelOpen;

  useShortcuts({
    "mod+k": () => ui.openPalette("all"),
    "/": () => ui.openPalette("search"),
    c: () => ui.openEventDialog(),
    a: () => (hasMargin(pathname) ? assistant.focusComposer() : router.push("/assistant")),
    "?": () => ui.setShortcutsOpen(true),
    g: () => router.push("/today"),
  });

  return (
    <div className="paper-grain flex h-dvh gap-0 overflow-hidden bg-wall md:gap-3 md:p-3">
      <Rail user={user} />
      <main id="main" className="sheet flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(60px+env(safe-area-inset-bottom))] max-md:rounded-none max-md:shadow-none md:pb-0">
        {children}
      </main>
      {showMargin && (
        <aside className="sheet hidden w-[372px] shrink-0 overflow-hidden lg:flex lg:flex-col" aria-label="Vele assistant">
          <VeleMargin />
        </aside>
      )}
      <BottomNav />
      <CommandPalette />
      <ShortcutsDialog />
      <EventDialog />
      <FindTimeDialog />
    </div>
  );
}

const railItem =
  "flex h-9 items-center gap-3 rounded-[2px] px-2.5 text-body font-semibold text-wall-ink-2 transition-colors hover:bg-wall-hover hover:text-wall-ink max-xl:justify-center max-xl:px-0";

function Rail({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const ui = useUI();
  const assistant = useAssistantContext();
  return (
    <nav aria-label="Main" className="hidden w-[52px] shrink-0 flex-col text-wall-ink md:flex xl:w-[228px]">
      <div className="flex h-12 items-center xl:px-1">
        <Link href="/today" className="rounded-[2px]" aria-label="Vele, today">
          <Wordmark className="hidden xl:inline-flex" />
          <Mark className="size-8 xl:hidden" />
        </Link>
      </div>

      <button
        onClick={() => ui.openPalette("all")}
        className="mt-2 flex h-9 w-full items-center gap-2.5 rounded-[2px] border border-wall-line px-2.5 text-small font-medium text-wall-ink-2 transition-colors hover:border-wall-ink-2 hover:text-wall-ink max-xl:justify-center max-xl:px-0"
        aria-label="Search or jump to"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left xl:inline">Search or jump to</span>
        <Kbd className="hidden border-wall-line bg-transparent text-wall-ink-2 xl:inline-flex">⌘K</Kbd>
      </button>

      <ul className="mt-4 grid gap-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/today" && pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(railItem, active && "bg-sheet text-ink shadow-[var(--shadow-lift)] hover:bg-sheet hover:text-ink")}
              >
                <item.icon className="size-[18px] shrink-0" strokeWidth={2} />
                <span className="hidden xl:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
        {user.role === "admin" && (
          <li>
            <Link href="/admin" className={cn(railItem, pathname.startsWith("/admin") && "bg-sheet text-ink shadow-[var(--shadow-lift)] hover:bg-sheet hover:text-ink")}>
              <ShieldCheck className="size-[18px] shrink-0" strokeWidth={2} />
              <span className="hidden xl:inline">Admin</span>
            </Link>
          </li>
        )}
        {hasMargin(pathname) && (
          <li className="hidden lg:block">
            <button onClick={() => assistant.setPanelOpen(!assistant.panelOpen)} aria-pressed={assistant.panelOpen} className={cn(railItem, "w-full")}>
              <PanelRight className="size-[18px] shrink-0" strokeWidth={2} />
              <span className="hidden flex-1 text-left xl:inline">{assistant.panelOpen ? "Unpin Vele" : "Pin Vele"}</span>
            </button>
          </li>
        )}
      </ul>

      <button
        onClick={() => ui.openEventDialog()}
        className="mt-4 flex h-10 w-full items-center gap-2 rounded-[2px] bg-ink px-3 text-body font-bold text-paper transition-colors hover:bg-ink-2 active:translate-y-px max-xl:justify-center max-xl:px-0"
      >
        <Plus className="size-4 shrink-0" strokeWidth={2.5} />
        <span className="hidden flex-1 text-left xl:inline">New booking</span>
        <Kbd className="hidden border-paper/30 bg-transparent text-paper xl:inline-flex">C</Kbd>
      </button>

      <div className="mt-6 hidden min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-3 xl:flex">
        <Suspense fallback={null}>
          <RailMonth timezone={user.timezone} />
        </Suspense>
        <CalendarList />
      </div>

      <div className="mt-auto border-t border-wall-line pt-3 pb-1">
        <UserMenu user={user} />
      </div>
    </nav>
  );
}

function RailMonth({ timezone }: { timezone: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = DateTime.now().setZone(timezone);
  const selected = params.get("date") ? DateTime.fromISO(params.get("date")!, { zone: timezone }) : today;
  const view = params.get("view") ?? "week";
  return (
    <MiniMonth
      selected={selected.isValid ? selected : today}
      today={today}
      highlightWeek={pathname.startsWith("/calendar") && view === "week"}
      onSelect={(d) => router.push(`/calendar?view=${pathname.startsWith("/calendar") ? view : "week"}&date=${d.toISODate()}`)}
    />
  );
}

function CalendarList() {
  const { data: calendars } = useCalendars();
  const qc = useQueryClient();
  const toggle = async (id: string, isVisible: boolean) => {
    qc.setQueryData(qk.calendars, (old: typeof calendars) => old?.map((c) => (c.id === id ? { ...c, isVisible } : c)));
    try {
      await apiSend(`/api/calendars/${id}`, "PATCH", { isVisible });
    } catch (err) {
      toast.error(errorMessage(err));
      void qc.invalidateQueries({ queryKey: qk.calendars });
    }
  };
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span className="text-small font-bold text-wall-ink">Calendars</span>
        <Link href="/settings/calendars" className="text-micro font-semibold text-wall-ink-2 underline decoration-wall-line underline-offset-2 hover:text-wall-ink">
          Manage
        </Link>
      </div>
      <ul className="grid gap-1">
        {(calendars ?? []).map((c) => (
          <li key={c.id}>
            <label
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2.5 rounded-[2px] px-1 text-small font-medium text-wall-ink hover:bg-wall-hover",
                !c.isVisible && "text-wall-ink-2",
              )}
            >
              <input type="checkbox" className="peer sr-only" checked={c.isVisible} onChange={(e) => toggle(c.id, e.target.checked)} />
              <Tape
                color={calendarInk(c.position, c.color)}
                className={cn("w-9 justify-center peer-focus-visible:outline-2 peer-focus-visible:outline-wall-ink", !c.isVisible && "opacity-35")}
              >
                {calendarCode(c.name)}
              </Tape>
              <span className={cn("min-w-0 flex-1 truncate", !c.isVisible && "line-through decoration-wall-ink-2")}>{c.name}</span>
              {!c.includeInAvailability && <span className="text-micro text-wall-ink-2">not counted</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const theme = useTheme();
  const choose = (t: ThemeChoice) => applyTheme(t);
  const signOut = async () => {
    await authClient.signOut();
    // A full load, so nothing from this account stays in memory.
    window.location.replace(`${window.location.origin}/sign-in`);
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-[2px] p-1 text-left hover:bg-wall-hover max-xl:justify-center" aria-label="Account menu">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[2px] bg-ink text-micro font-extrabold text-paper">{initials(user.name)}</span>
          <span className="hidden min-w-0 flex-1 xl:block">
            <span className="block truncate text-small font-bold text-wall-ink">{user.name}</span>
            <span className="block truncate text-micro text-wall-ink-2">{user.email}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>Appearance</MenuLabel>
        {(
          [
            ["system", "Match system", Monitor],
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
          ] as const
        ).map(([value, label, Icon]) => (
          <MenuItem key={value} onSelect={() => choose(value)}>
            <Icon />
            <span className="flex-1">{label}</span>
            {theme === value && <span className="size-2 rounded-[1px] bg-current" aria-label="selected" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/settings">
            <Settings2 /> Settings
          </Link>
        </MenuItem>
        <MenuItem onSelect={signOut}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/today", label: "Today", icon: SunMedium },
    { href: "/calendar", label: "Week", icon: CalendarDays },
    { href: "/assistant", label: "Vele", primary: true },
    { href: "/bookings", label: "Bookings", icon: Link2 },
    { href: "/settings", label: "Settings", icon: Settings2 },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-wall-line bg-wall pb-[env(safe-area-inset-bottom)] text-wall-ink-2 md:hidden">
      <ul className="grid h-[60px] grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/today" && pathname.startsWith(item.href));
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex flex-1 flex-col items-center justify-center gap-1 text-micro font-bold", active && "text-wall-ink")}
              >
                {active && <span className="absolute inset-x-4 top-0 h-[3px] bg-wall-ink" aria-hidden />}
                {item.primary ? <Mark className="size-7" /> : item.icon ? <item.icon className="size-5" strokeWidth={2} /> : null}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The printed band that heads every sheet: the page's name set large in
 * white, with the sheet's actions alongside.
 */
export function PageHeader({ title, children, subtitle }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="band m-1.5 mb-0 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-[2px] px-4 pt-5 pb-3.5 md:m-2 md:mb-0 md:px-5">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-title font-extrabold tracking-[-0.02em]">{title}</h1>
        {subtitle ? <p className="mt-1 truncate text-small font-medium text-band-ink-2">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function useMeTimezone(fallback: string): string {
  const me = useMe();
  return me.data?.user.timezone ?? fallback;
}

export { Tip };
