import type { Metadata } from "next";
import { AssistantPage } from "@/components/pages/assistant-page";

export const metadata: Metadata = { title: "Vele" };

export default function Page() {
  return <AssistantPage />;
}
