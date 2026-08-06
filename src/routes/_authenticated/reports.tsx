import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useInspections, useParts } from "@/hooks/useInspectionData";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — WGDeepInsight | WG Tech" },
      { name: "description", content: "Generated inspection reports, ready to review, share and archive for traceability." },
      { property: "og:title", content: "Reports — WGDeepInsight" },
      { property: "og:description", content: "Generated inspection reports, ready to review, share and archive for traceability." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();

  return (
    <AppShell title="Reports" subtitle="Traceable inspection documentation">
      {inspections.length === 0 ? (
        <SectionCard><p className="type-body-m text-muted-foreground">No reports generated yet.</p></SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {inspections.map((i) => (
            <div key={i.id} className="surface-card p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-subtle">
                  <FileText className="size-4 text-primary" />
                </span>
                <StatusBadge status={i.status} />
              </div>
              <p className="type-body-m mt-3 font-semibold text-foreground">{i.inspection_number}</p>
              <p className="type-body-s text-muted-foreground">
                {parts.find((p) => p.id === i.part_id)?.part_name ?? "—"} · {i.inspection_date}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-4 w-full">
                <Link to="/report/$id" params={{ id: i.id }}>Open report</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
