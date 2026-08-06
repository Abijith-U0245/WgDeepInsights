import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, Plus, ScanLine } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useInspections, useParts } from "@/hooks/useInspectionData";
import { formatTime } from "@/lib/inspection-utils";

export const Route = createFileRoute("/_authenticated/inspection/")({
  head: () => ({
    meta: [
      { title: "Inspection — WGDeepInsight | WG Tech" },
      {
        name: "description",
        content:
          "Run a guided part inspection: select part and model, capture frames, run measurement and surface defect analysis.",
      },
      { property: "og:title", content: "Run an Inspection — WGDeepInsight" },
      {
        property: "og:description",
        content: "Guided measurement and surface defect inspection workflow.",
      },
    ],
  }),
  component: InspectionHome,
});

function InspectionHome() {
  const { user } = useAuth();
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();
  const mine = inspections.filter((i) => i.inspector_id === user?.id).slice(0, 8);

  return (
    <AppShell
      title="Inspection"
      subtitle="Measurement and surface defect workflow"
      actions={
        <Button asChild size="sm">
          <Link to="/inspection/new">
            <Plus className="size-4" />
            New Inspection
          </Link>
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="surface-card flex flex-col justify-between gap-6 p-6 lg:col-span-1">
          <div>
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary-subtle">
              <ScanLine className="size-5 text-primary" />
            </span>
            <h2 className="type-h-s mt-4 text-foreground">Start a new inspection</h2>
            <p className="type-body-m mt-2 text-muted-foreground">
              Four guided steps: choose the part, load the active AI model, capture measurement and
              surface frames, then generate the traceable report.
            </p>
            <ol className="mt-5 space-y-2.5">
              {["Select part", "Select model", "Review specification", "Measure & inspect"].map(
                (step, i) => (
                  <li key={step} className="flex items-center gap-3 type-body-m text-foreground">
                    <span className="flex size-6 items-center justify-center rounded-full bg-brand-blue-subtle type-caption font-semibold text-brand-blue">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          </div>
          <Button asChild size="lg">
            <Link to="/inspection/new">
              <ClipboardCheck className="size-4" />
              New Inspection
            </Link>
          </Button>
        </div>

        <SectionCard
          title="Your recent inspections"
          subtitle="Records performed by you"
          className="lg:col-span-2"
          bodyClassName="p-0"
        >
          {mine.length === 0 ? (
            <p className="px-5 py-14 text-center type-body-m text-muted-foreground">
              You haven't completed any inspections yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {mine.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <Link
                      to="/report/$id"
                      params={{ id: i.id }}
                      className="type-body-m font-semibold text-foreground hover:text-brand-blue-interactive"
                    >
                      {i.inspection_number}
                    </Link>
                    <p className="type-body-s truncate text-muted-foreground">
                      {parts.find((p) => p.id === i.part_id)?.part_name ?? "—"} ·{" "}
                      {i.inspection_date} {formatTime(i.inspection_time)}
                    </p>
                  </div>
                  <StatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
