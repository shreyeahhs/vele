import type { Metadata } from "next";
import { TodayPage } from "@/components/pages/today-page";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return <TodayPage />;
}
