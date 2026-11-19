import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { errors } from "@/lib/errors";
import { auth } from "./auth";
import { db } from "./db";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: string;
  timezone: string;
  onboarded: boolean;
}

/** The signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session?.user) return null;
  // Profile fields come from our table so changes apply immediately.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, image: true, role: true, timezone: true, onboardedAt: true, banned: true },
  });
  if (!user || user.banned) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role ?? "user",
    timezone: user.timezone,
    onboarded: user.onboardedAt != null,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw errors.unauthorized();
  return user;
}

/** For server components: redirect to sign-in instead of throwing. */
export async function requirePageUser(opts: { allowUnonboarded?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!opts.allowUnonboarded && !user.onboarded) redirect("/onboarding");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw errors.forbidden();
  return user;
}
