"use client";

import { DateTime } from "luxon";
import { useMemo, useSyncExternalStore } from "react";
import { timeZones } from "@/lib/zones";

/**
 * Browser-only values (media queries, the device's zone, the clock, saved
 * preferences) read through useSyncExternalStore: the server render uses a
 * fixed fallback and the client switches over without a hydration mismatch
 * or a set-state-in-effect round trip.
 */

const noSubscribe = () => () => {};

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** The browser's IANA zone, or null during the server render. */
export function useDeviceZone(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    () => null,
  );
}

/* ── Clock ───────────────────────────────────────────────────────────────── */

const TICK_MS = 30_000;
let tick = 0;
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function currentTick() {
  // Stable within a 30 s window, so the snapshot only changes when time has moved on.
  const t = Math.floor(Date.now() / TICK_MS) * TICK_MS;
  if (t !== tick) tick = t;
  return tick;
}

function subscribeTick(onChange: () => void) {
  tickListeners.add(onChange);
  if (!tickTimer) tickTimer = setInterval(() => tickListeners.forEach((l) => l()), 5_000);
  return () => {
    tickListeners.delete(onChange);
    if (!tickListeners.size && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

/** "Now" in the given zone, refreshed every 30 seconds; null during the server render. */
export function useNow(zone: string): DateTime | null {
  const ms = useSyncExternalStore(subscribeTick, currentTick, () => 0);
  return useMemo(() => (ms ? DateTime.fromMillis(ms, { zone }) : null), [ms, zone]);
}

/* ── Small persisted settings ────────────────────────────────────────────── */

const STORE_EVENT = "vele-store";

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORE_EVENT, onChange);
  };
}

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes (or clears) a device-local setting and tells every reader on the page. */
export function writeStored(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): the setting lasts for this page only
  }
  window.dispatchEvent(new Event(STORE_EVENT));
}

export function useStored(key: string, serverValue: string | null = null): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => readStored(key),
    () => serverValue,
  );
}

/** False during the server render and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Zone choices for a picker. The full list is browser-specific (each ICU
 * version knows a slightly different set), so it appears after hydration;
 * until then only the current value is offered.
 */
export function useTimeZoneOptions(current: string): string[] {
  const hydrated = useHydrated();
  return useMemo(() => {
    if (!hydrated) return [current];
    const all = timeZones();
    return all.includes(current) ? all : [current, ...all];
  }, [hydrated, current]);
}
