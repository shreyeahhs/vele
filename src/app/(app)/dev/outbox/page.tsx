import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevOutbox } from "@/components/pages/dev-outbox";

export const metadata: Metadata = { title: "Outbox (development)" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevOutbox />;
}
