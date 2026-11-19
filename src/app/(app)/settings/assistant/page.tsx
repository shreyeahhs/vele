import type { Metadata } from "next";
import { AssistantSettings } from "@/components/settings/assistant";

export const metadata: Metadata = { title: "Assistant" };

export default function Page() {
  return <AssistantSettings />;
}
