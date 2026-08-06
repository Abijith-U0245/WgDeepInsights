import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useInspections, useParts } from "@/hooks/useInspectionData";
import { passRate } from "@/lib/inspection-utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — WGDeepInsight | WG Tech" },
      { name: "description", content: "Quality analytics: pass rate trends, reject reasons and throughput across parts and shifts." },
      { property: "og:title", content: "Analytics — WGDeepInsight" },
      { property: "og:description", content: "Quality analytics: pass rate trends, reject reasons and throughput across parts and shifts." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();

  const byPart = parts.map((p) => {
    const rows = inspections.filter((i) => i.part_id === p.id);
    return {
      name: p.part_name,
      ok: rows.filter((r) => r.status === "ok").length,
      reject: rows.filter((r) => r.status === "reject").length,
    };
  });

  const byShift = ["A", "B", "C"].map((s) => {
    const rows = inspections.filter((i) => i.shift === s);
    return { shift: `Shift ${s}`, rate: passRate(rows) };
  });

  return (
    <AppShell title="Analytics" subtitle="Quality performance across parts and shifts">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Outcome by part" subtitle="OK vs rejected units">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPart} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 13 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ok" name="OK" fill="var(--brand-blue)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="reject" name="Reject" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Pass rate by shift" subtitle="Percentage of OK parts">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byShift} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="shift" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 13 }} />
                <Line type="monotone" dataKey="rate" name="Pass rate %" stroke="var(--brand-blue)" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
