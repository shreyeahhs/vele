"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { Features } from "@/lib/env";
import type { PendingActionDTO } from "@/server/ai/actions";
import type { BookingDTO, MeetingTypeDTO } from "@/server/services/bookings";
import type { CalendarDTO, EventDTO } from "@/server/services/events";
import type { MemoryEntry } from "@/server/services/memory";
import type { PreferencesDTO } from "@/server/services/preferences";
import type { DayLoad } from "@/scheduling";

export type { BookingDTO, CalendarDTO, EventDTO, MeetingTypeDTO, PendingActionDTO, PreferencesDTO };

export interface Me {
  user: { id: string; name: string; email: string; image: string | null; role: string; timezone: string; onboarded: boolean };
  bookingHandle: string | null;
  hasVideoLink: boolean;
  features: Features;
}

export const qk = {
  me: ["me"] as const,
  calendars: ["calendars"] as const,
  events: (start: string, end: string) => ["events", start, end] as const,
  overview: ["overview"] as const,
  preferences: ["preferences"] as const,
  booking: ["booking-settings"] as const,
  bookings: (filter: string) => ["bookings", filter] as const,
  memory: ["memory"] as const,
  conversations: ["conversations"] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messaging: ["messaging"] as const,
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => apiGet<Me>("/api/me"), staleTime: 60_000 });
}

export function useCalendars() {
  return useQuery({ queryKey: qk.calendars, queryFn: async () => (await apiGet<{ calendars: CalendarDTO[] }>("/api/calendars")).calendars });
}

export function useEvents(range: { start: Date; end: Date }) {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  return useQuery({
    queryKey: qk.events(start, end),
    queryFn: async () => (await apiGet<{ events: EventDTO[] }>("/api/events", { start, end })).events,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export interface Overview {
  timezone: string;
  firstName: string | null;
  now: string;
  today: {
    date: string;
    isWorkingDay: boolean;
    events: EventDTO[];
    meetingCount: number;
    openTime: Array<{ start: string; end: string; minutes: number }>;
    freeMinutesLeft: number;
    freeMinutesTotal: number;
  };
  next: EventDTO | null;
  week: { start: string; meetingCount: number; meetingMinutes: number; focusMinutes: number; freeMinutes: number; observations: string[]; days: DayLoad[] };
  conflicts: Array<{
    type: string;
    message: string;
    start: number;
    end: number;
    severity: string;
    events: Array<{ id: string; title: string; start: string; end: string; calendarName: string }>;
  }>;
  pending: PendingActionDTO[];
  bookings: BookingDTO[];
}

export function useOverview() {
  return useQuery({ queryKey: qk.overview, queryFn: () => apiGet<Overview>("/api/overview"), refetchInterval: 60_000 });
}

export function usePreferences() {
  return useQuery({ queryKey: qk.preferences, queryFn: async () => (await apiGet<{ preferences: PreferencesDTO }>("/api/preferences")).preferences });
}

export interface BookingSettings {
  profile: { handle: string; displayName: string; headline: string | null; welcomeMessage: string | null; visibility: "PUBLIC" | "UNLISTED" | "PRIVATE"; url: string };
  meetingTypes: MeetingTypeDTO[];
}

export function useBookingSettings() {
  return useQuery({ queryKey: qk.booking, queryFn: () => apiGet<BookingSettings>("/api/booking/settings") });
}

export function useBookings(filter: "upcoming" | "past" | "cancelled") {
  return useQuery({ queryKey: qk.bookings(filter), queryFn: async () => (await apiGet<{ bookings: BookingDTO[] }>("/api/bookings", { filter })).bookings });
}

export function useMemory() {
  return useQuery({ queryKey: qk.memory, queryFn: async () => (await apiGet<{ memory: MemoryEntry[] }>("/api/memory")).memory });
}
