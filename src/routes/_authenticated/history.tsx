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

function HistoryPage() {
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();
  const { data: people = [] } = useProfiles();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedInspector, setSelectedInspector] = useState("all");
  const [selectedPart, setSelectedPart] = useState("all");
  const [selectedShift, setSelectedShift] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");

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

  return (
    <AppShell title="History" subtitle="Complete inspection archive"
      actions={
        <Button size="sm" variant="outline" onClick={() => downloadCsv("inspection-history.csv", csvData)}>
          <Download className="size-4" />
          Export CSV
        </Button>
      }
    >
      <SectionCard bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 border-b border-border p-4 bg-card">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search inspection, part or area" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
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

          <Select value={selectedArea} onValueChange={setSelectedArea}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Areas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              <SelectItem value="Production Block">Production Block</SelectItem>
              <SelectItem value="Line A">Line A</SelectItem>
              <SelectItem value="Line B">Line B</SelectItem>
              <SelectItem value="Assembly Line">Assembly Line</SelectItem>
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
                  {["Inspection", "Inspector", "Part", "Date", "Time", "Shift", "Area", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
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
