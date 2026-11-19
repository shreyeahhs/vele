import type { Metadata } from "next";
import { CalendarSettings } from "@/components/settings/calendars";

export const metadata: Metadata = { title: "Calendars" };

export default function Page() {
  return <CalendarSettings />;
}
