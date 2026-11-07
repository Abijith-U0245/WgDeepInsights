import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Search, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useInspections, useParts, useProfiles } from "@/hooks/useInspectionData";
import { downloadCsv, formatTime } from "@/lib/inspection-utils";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Inspection History — WGDeepInsight | WG Tech" },
      { name: "description", content: "Searchable archive of every completed inspection with part, inspector, shift and verdict." },
      { property: "og:title", content: "Inspection History — WGDeepInsight" },
      { property: "og:description", content: "Searchable archive of every completed inspection with part, inspector, shift and verdict." },
    ],
  }),
  component: HistoryPage,
});

async function apiDeleteInspection(id: string): Promise<boolean> {
  const res = await fetch(`http://localhost:8000/api/inspections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.ok;
}

function HistoryPage() {
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();
  const { data: people = [] } = useProfiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedInspector, setSelectedInspector] = useState("all");
  const [selectedPart, setSelectedPart] = useState("all");
  const [selectedShift, setSelectedShift] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const rows = inspections.filter((i) => {
    const partName = parts.find((p) => p.id === i.part_id)?.part_name ?? "";
    const inspectorName = people.find((p) => p.id === i.inspector_id)?.name ?? i.inspector_id ?? "";
    const matchQ =
      !q ||
      `${i.inspection_number} ${partName} ${i.area} ${inspectorName}`.toLowerCase().includes(q.toLowerCase());
    const matchStatus = status === "all" || i.status === status;
    const matchInspector = selectedInspector === "all" || i.inspector_id === selectedInspector;
    const matchPart = selectedPart === "all" || i.part_id === selectedPart;
    const matchShift = selectedShift === "all" || i.shift === selectedShift;
    const matchArea = selectedArea === "all" || i.area === selectedArea;
    const matchDate = !selectedDate || i.inspection_date === selectedDate;
    return matchQ && matchStatus && matchInspector && matchPart && matchShift && matchArea && matchDate;
  });

  const csvData = rows.map((r) => ({
    "Inspection": r.inspection_number,
    "Inspector": people.find((p) => p.id === r.inspector_id)?.name ?? r.inspector_id,
    "Part": parts.find((p) => p.id === r.part_id)?.part_name ?? "—",
    "Date": r.inspection_date,
    "Time": formatTime(r.inspection_time),
    "Shift": r.shift,
    "Area": r.area,
    "Status": r.status.toUpperCase(),
    "Remarks": r.remarks,
  }));

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await apiDeleteInspection(deleteTarget.id);
      if (ok) {
        toast.success(`Deleted ${deleteTarget.number}`);
        queryClient.invalidateQueries({ queryKey: ["inspections"] });
      } else {
        toast.error("Could not delete — backend returned an error.");
      }
    } catch {
      toast.error("Delete failed. Is the backend running?");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <AppShell
      title="History"
      subtitle="Complete inspection archive"
      actions={
        <Button size="sm" variant="outline" onClick={() => downloadCsv("inspection-history.csv", csvData)}>
          <Download className="size-4" />
          Export CSV
        </Button>
      }
    >
      <SectionCard bodyClassName="p-0">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 border-b border-border p-4 bg-card">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search inspection, part or area" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PASS">Pass</SelectItem>
              <SelectItem value="FAIL">Fail</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="reject">Reject</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedInspector} onValueChange={setSelectedInspector}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Inspectors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Inspectors</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPart} onValueChange={setSelectedPart}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Parts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Parts</SelectItem>
              {parts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.part_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedShift} onValueChange={setSelectedShift}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="All Shifts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shifts</SelectItem>
              <SelectItem value="A">Shift A</SelectItem>
              <SelectItem value="B">Shift B</SelectItem>
              <SelectItem value="C">Shift C</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative w-[150px]">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-sm"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center type-body-m text-muted-foreground">No inspections match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Inspection", "Inspector", "Part", "Date", "Time", "Shift", "Area", "Status", "", ""].map((h, idx) => (
                    <th key={idx} className="px-4 py-2.5 text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40 group">
                    <td className="px-4 py-3 type-body-m font-medium text-foreground">{i.inspection_number}</td>
                    <td className="px-4 py-3 type-body-m">{people.find((p) => p.id === i.inspector_id)?.name ?? i.inspector_id}</td>
                    <td className="px-4 py-3 type-body-m">{parts.find((p) => p.id === i.part_id)?.part_name ?? "—"}</td>
                    <td className="px-4 py-3 type-body-m tabular">{i.inspection_date}</td>
                    <td className="px-4 py-3 type-body-m tabular">{formatTime(i.inspection_time)}</td>
                    <td className="px-4 py-3 type-body-m">{i.shift}</td>
                    <td className="px-4 py-3 type-body-m">{i.area}</td>
                    <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/report/$id" params={{ id: i.id }}>View</Link>
                      </Button>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        title="Delete this inspection"
                        onClick={() => setDeleteTarget({ id: i.id, number: i.inspection_number })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center size-8 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-rose-500" />
              Delete Inspection Record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deleteTarget?.number}</span> and all its
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
              {isDeleting ? "Deleting…" : "Yes, Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
