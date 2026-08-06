import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useProfiles } from "@/hooks/useInspectionData";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — WGDeepInsight | WG Tech" },
      { name: "description", content: "Team directory showing inspection managers and inspectors with their access level." },
      { property: "og:title", content: "Users & Roles — WGDeepInsight" },
      { property: "og:description", content: "Team directory showing inspection managers and inspectors with their access level." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { data: people = [] } = useProfiles();
  return (
    <AppShell title="Users" subtitle="Team directory and access levels">
      <SectionCard bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-blue-subtle type-body-m font-semibold text-brand-blue">
                  {(p.name || p.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="type-body-m font-semibold text-foreground">{p.name || "Unnamed"}</p>
                  <p className="type-body-s text-muted-foreground">{p.email}</p>
                </div>
              </div>
              <span className="rounded-full border border-border bg-muted px-3 py-1 type-caption font-semibold text-muted-foreground">
                {p.role === "inspection_manager" ? "Inspection Manager" : "Inspector"}
              </span>
            </li>
          ))}
          {people.length === 0 && (
            <li className="px-5 py-14 text-center type-body-m text-muted-foreground">No users found.</li>
          )}
        </ul>
      </SectionCard>
    </AppShell>
  );
}
