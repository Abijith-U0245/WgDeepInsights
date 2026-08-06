import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — WGDeepInsight | WG Tech" },
      { name: "description", content: "Account details, role information and inspection station preferences for WGDeepInsight." },
      { property: "og:title", content: "Settings — WGDeepInsight" },
      { property: "og:description", content: "Account details, role information and inspection station preferences for WGDeepInsight." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { name, user, role } = useAuth();
  return (
    <AppShell title="Settings" subtitle="Account and station preferences">
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Account" subtitle="Your WGDeepInsight profile">
          <dl className="space-y-3">
            {[
              ["Name", name || "—"],
              ["Email", user?.email || "—"],
              ["Role", role === "inspection_manager" ? "Inspection Manager" : "Inspector"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                <dt className="type-body-m text-muted-foreground">{k}</dt>
                <dd className="type-body-m font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
        <SectionCard title="Inference services" subtitle="Endpoints used by the inspection flow">
          <ul className="space-y-2">
            {["POST /api/measure — dimensional measurement", "POST /api/inspect — surface defect detection", "POST /api/report — report generation"].map((s) => (
              <li key={s} className="rounded-lg border border-border bg-background px-3 py-2.5 type-body-s text-muted-foreground">{s}</li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}
