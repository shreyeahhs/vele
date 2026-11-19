import type { Metadata } from "next";
import { MessagingSettings } from "@/components/settings/messaging";

export const metadata: Metadata = { title: "Messaging" };

export default function Page() {
  return <MessagingSettings />;
}
