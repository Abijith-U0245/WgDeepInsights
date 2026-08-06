import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useParts, useSpecifications } from "@/hooks/useInspectionData";

export const Route = createFileRoute("/_authenticated/specifications")({
  head: () => ({
    meta: [
      { title: "Specifications — WGDeepInsight | WG Tech" },
      { name: "description", content: "Dimensional parameters, expected values and tolerance bands for every inspected part." },
      { property: "og:title", content: "Specifications — WGDeepInsight" },
      { property: "og:description", content: "Dimensional parameters, expected values and tolerance bands for every inspected part." },
    ],
  }),
  component: SpecificationsPage,
});

function SpecificationsPage() {
  const { data: specs = [] } = useSpecifications();
  const { data: parts = [] } = useParts();
  return (
    <AppShell title="Specifications" subtitle="Tolerance definitions per part">
      <SectionCard bodyClassName="p-0">
        {specs.length === 0 ? (
          <p className="px-5 py-14 text-center type-body-m text-muted-foreground">No specifications defined.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Part", "Parameter", "Expected", "Tolerance", "Unit", "Notes"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {specs.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 type-body-m font-medium text-foreground">{parts.find((p) => p.id === s.part_id)?.part_name ?? "—"}</td>
                    <td className="px-4 py-3 type-body-m">{s.parameter}</td>
                    <td className="px-4 py-3 type-body-m tabular">{s.expected_value}</td>
                    <td className="px-4 py-3 type-body-m tabular">±{s.tolerance}</td>
                    <td className="px-4 py-3 type-body-m">{s.unit}</td>
                    <td className="px-4 py-3 type-body-m text-muted-foreground">{s.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
