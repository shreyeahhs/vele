import { PageHeader } from "@/components/app/shell";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Settings" />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10 md:px-8">
        <SettingsNav />
        <div className="grid min-w-0 content-start gap-10 pb-6">{children}</div>
      </div>
    </div>
  );
}
