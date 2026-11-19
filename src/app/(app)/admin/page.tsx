import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/pages/admin-page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Admin" };

export default async function Page() {
  const user = await requirePageUser();
  if (user.role !== "admin") notFound();
  return <AdminPage />;
}
