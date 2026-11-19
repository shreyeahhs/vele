import { AppShell } from "@/components/app/shell";
import { requirePageUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return <AppShell user={{ name: user.name, email: user.email, role: user.role, timezone: user.timezone }}>{children}</AppShell>;
}
