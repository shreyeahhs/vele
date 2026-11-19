import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/pages/sign-in-form";
import { features } from "@/lib/env";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(user.onboarded ? "/today" : "/onboarding");
  const { mode, error } = await searchParams;
  const f = features();
  return <SignInForm initialMode={mode === "sign-up" ? "sign-up" : "sign-in"} emailLive={f.email} linkError={error ?? null} />;
}
