import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInspections, useParts } from "@/hooks/useInspectionData";
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

function HistoryPage() {
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const rows = inspections.filter((i) => {
    const partName = parts.find((p) => p.id === i.part_id)?.part_name ?? "";
    const matchQ =
      !q ||
      `${i.inspection_number} ${partName} ${i.area}`.toLowerCase().includes(q.toLowerCase());
    return matchQ && (status === "all" || i.status === status);
  });

  return (
    <AppShell title="History" subtitle="Complete inspection archive"
      actions={
        <Button size="sm" variant="outline" onClick={() => downloadCsv("inspection-history.csv", rows)}>
          <Download className="size-4" />
          Export CSV
        </Button>
      }
    >
      <SectionCard bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search inspection, part or area" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="reject">Reject</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center type-body-m text-muted-foreground">No inspections match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Inspection", "Part", "Date", "Time", "Shift", "Area", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 type-body-m font-medium text-foreground">{i.inspection_number}</td>
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
