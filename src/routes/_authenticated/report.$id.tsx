import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Printer, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StorageImage } from "@/components/common/StorageImage";
import { useInspectionDetail, useParts } from "@/hooks/useInspectionData";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/report/$id")({
  head: () => ({
    meta: [
      { title: "Inspection Report — WGDeepInsight | WG Tech" },
      { name: "description", content: "Full inspection report with measurement table, detected surface defects and captured frames." },
      { property: "og:title", content: "Inspection Report — WGDeepInsight" },
      { property: "og:description", content: "Full inspection report with measurement table, detected surface defects and captured frames." },
    ],
  }),
  component: ReportDetailPage,
});

async function apiDeleteInspection(id: string): Promise<boolean> {
  const res = await fetch(`http://localhost:8000/api/inspections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.ok;
}

function ReportDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useInspectionDetail(id);
  const { data: parts = [] } = useParts();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (isLoading) {
    return (
      <AppShell title="Report" subtitle="Loading inspection record">
        <SectionCard><p className="type-body-m text-muted-foreground">Loading…</p></SectionCard>
      </AppShell>
    );
  }

  const inspection = data?.inspection;
  if (!inspection) {
    return (
      <AppShell title="Report" subtitle="Not found">
        <SectionCard><p className="type-body-m text-muted-foreground">This inspection record could not be found.</p></SectionCard>
      </AppShell>
    );
  }

  const partName = parts.find((p) => p.id === inspection.part_id)?.part_name ?? "—";

  async function handleConfirmDelete() {
    setIsDeleting(true);
    try {
      const ok = await apiDeleteInspection(id);
      if (ok) {
        toast.success(`Deleted ${inspection!.inspection_number}`);
        queryClient.invalidateQueries({ queryKey: ["inspections"] });
        navigate({ to: "/history" });
      } else {
        toast.error("Could not delete — backend returned an error.");
      }
    } catch {
      toast.error("Delete failed. Is the backend running?");
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <AppShell
      title={inspection.inspection_number}
      subtitle={`${partName} · ${inspection.inspection_date} · Shift ${inspection.shift}`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-rose-500/40 text-rose-500 hover:bg-rose-500/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SectionCard title="Summary">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Part", partName],
              ["Area", inspection.area],
              ["Duration", `${inspection.duration_seconds}s`],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="type-caption text-muted-foreground">{k}</p>
                <p className="type-body-m mt-1 font-semibold text-foreground">{v}</p>
              </div>
            ))}
            <div>
              <p className="type-caption text-muted-foreground">Verdict</p>
              <div className="mt-1"><StatusBadge status={inspection.status} /></div>
            </div>
          </div>
          {inspection.remarks && (
            <p className="type-body-m mt-4 rounded-lg border border-border bg-background p-3 text-muted-foreground">
              {inspection.remarks}
            </p>
          )}
        </SectionCard>

        <SectionCard title="Measurement results" bodyClassName="p-0">
          {data.measurements.length === 0 ? (
            <p className="px-5 py-10 text-center type-body-m text-muted-foreground">No measurements recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Parameter", "Expected", "Actual", "Deviation", "Tolerance", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.measurements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 type-body-m font-medium text-foreground">{m.parameter}</td>
                      <td className="px-4 py-3 type-body-m tabular">{m.expected} {m.unit}</td>
                      <td className="px-4 py-3 type-body-m tabular">{m.actual} {m.unit}</td>
                      <td className="px-4 py-3 type-body-m tabular">{m.deviation}</td>
                      <td className="px-4 py-3 type-body-m tabular">±{m.tolerance}</td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Surface defects">
            {data.defects.length === 0 ? (
              <p className="type-body-m text-muted-foreground">No surface defects detected.</p>
            ) : (
              <ul className="space-y-3">
                {data.defects.map((d) => (
                  <li key={d.id} className="space-y-2 rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="type-body-m font-medium text-foreground">{d.defect_name}</p>
                        <p className="type-caption text-muted-foreground">Confidence {(Number(d.confidence) * 100).toFixed(1)}%</p>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    {d.annotated_image && (
                      <div className="mt-2 overflow-hidden rounded-md border border-border bg-black">
                        <StorageImage
                          refValue={d.annotated_image}
                          alt={d.defect_name}
                          className="h-36 w-full object-contain"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Captured frames">
            {data.images.length === 0 ? (
              <p className="type-body-m text-muted-foreground">No frames stored for this inspection.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.images.map((img) => (
                  <div key={img.id} className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-mono font-medium text-foreground capitalize">
                        {img.image_type.replace(/_/g, " ")}
                      </p>
                      <span className="text-[10px] font-mono text-muted-foreground">LIVE CAPTURE</span>
                    </div>
                    <div className="overflow-hidden rounded-md border border-border bg-black">
                      <StorageImage
                        refValue={img.image_url}
                        alt={img.image_type}
                        className="h-44 w-full object-contain"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-rose-500" />
              Delete This Report?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{inspection.inspection_number}</span> and all its
              associated measurement results, surface defect data, and captured images.
              <br /><br />
              <span className="text-rose-500 font-medium">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting ? "Deleting…" : "Yes, Delete Report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
