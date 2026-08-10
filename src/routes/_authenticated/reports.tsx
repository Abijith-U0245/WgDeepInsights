import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Search } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInspections, useParts, useProfiles } from "@/hooks/useInspectionData";

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

  return (
    <AppShell title="Reports" subtitle="Traceable inspection documentation">
      <SectionCard bodyClassName="p-0 mb-6">
        <div className="flex flex-wrap gap-3 p-4 bg-card rounded-xl">
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
      </SectionCard>

      {rows.length === 0 ? (
        <SectionCard><p className="type-body-m text-muted-foreground py-10 text-center">No reports match your filters.</p></SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((i) => (
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
              <p className="type-caption mt-1.5 text-muted-foreground/80">
                Inspector: {people.find((p) => p.id === i.inspector_id)?.name ?? i.inspector_id} · Shift: {i.shift}
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
