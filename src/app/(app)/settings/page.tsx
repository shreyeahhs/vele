import type { Metadata } from "next";
import { ProfileSettings } from "@/components/settings/profile";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <ProfileSettings />;
}
