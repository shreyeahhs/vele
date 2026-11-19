import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/pages/onboarding";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Set up your week" };

export default async function Page() {
  const user = await requirePageUser({ allowUnonboarded: true });
  if (user.onboarded) redirect("/today");
  return <Onboarding name={user.name} timezone={user.timezone} />;
}
