import type { Metadata } from "next";
import { AvailabilitySettings } from "@/components/settings/availability";

export const metadata: Metadata = { title: "Availability" };

export default function Page() {
  return <AvailabilitySettings />;
}
