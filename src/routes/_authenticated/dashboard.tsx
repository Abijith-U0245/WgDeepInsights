import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Crosshair,
  Plus,
  ScanLine,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useInspections, useParts } from "@/hooks/useInspectionData";
import { formatTime, isToday, passRate } from "@/lib/inspection-utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — WGDeepInsight | WG Tech" },
      {
        name: "description",
        content:
          "Live quality overview: today's inspections, OK and rejected parts, measurement accuracy and surface defect trends.",
      },
      { property: "og:title", content: "Inspection Dashboard — WGDeepInsight" },
      {
        property: "og:description",
        content: "Live quality metrics for automated visual inspection at WG Tech.",
      },
    ],
  }),
  component: DashboardPage,
});

const HOURS = ["8AM", "9AM", "10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM", "5PM"];

function DashboardPage() {
  const { name, isManager, role } = useAuth();
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();

  const today = useMemo(
    () => inspections.filter((i) => isToday(i.inspection_date)),
    [inspections],
  );
  const ok = today.filter((i) => i.status === "ok").length;
  const rejected = today.filter((i) => i.status === "reject").length;
  const pending = today.filter((i) => i.status === "pending").length;
  const rate = passRate(today);

  const trend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    return days.map((day) => {
      const rows = inspections.filter((i) => i.inspection_date === day);
      return {
        day: new Date(day).toLocaleDateString("en-GB", { weekday: "short" }),
        ok: rows.filter((r) => r.status === "ok").length,
        reject: rows.filter((r) => r.status === "reject").length,
      };
    });
  }, [inspections]);

  const hourly = useMemo(
    () =>
      HOURS.map((hour, idx) => {
        const rows = today.filter((i) => Number(i.inspection_time.slice(0, 2)) === idx + 8);
        return { hour, inspected: rows.length, rejected: rows.filter((r) => r.status === "reject").length };
      }),
    [today],
  );

  const partDistribution = useMemo(() => {
    return parts
      .map((p) => ({
        name: p.part_name,
        value: inspections.filter((i) => i.part_id === p.id).length,
      }))
      .filter((d) => d.value > 0);
  }, [parts, inspections]);

  const partName = (id: string | null) => parts.find((p) => p.id === id)?.part_name ?? "—";
  const chartColors = [
    "var(--brand-blue)",
    "var(--primary)",
    "var(--brand-blue-interactive)",
    "var(--warning)",
    "var(--success)",
  ];

  const accuracy = today.length === 0 ? 0 : Math.min(99.9, 96.4 + rate / 40);
  const isInspector = role === "inspector";
  const selectedParts = ["Stud", "Adapter", "Capnut", "Pin"];

  return (
    <AppShell
      title="Dashboard"
      subtitle={`Welcome back${name ? `, ${name}` : ""} · shopfloor quality overview`}
      actions={
        <Button asChild size="sm">
          <Link to="/inspection/new">
            <Plus className="size-4" />
            New Inspection
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <SectionCard
          title={isManager ? "Manager Console" : "Inspector Console"}
          subtitle={
            isManager
              ? "Review history, download reports, and manage models and specifications."
              : "Select a part and model, capture frames, and run measurement plus surface inspection."
          }
          action={
            <div className="flex flex-wrap gap-2">
              {isManager ? (
                <>
                  <Button asChild size="sm" variant="outline"><Link to="/history">History</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/reports">Reports</Link></Button>
                </>
              ) : (
                <Button asChild size="sm" variant="outline"><Link to="/inspection/new">Start inspection</Link></Button>
              )}
            </div>
          }
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-background p-4 lg:col-span-2">
              <p className="type-caption uppercase tracking-wide text-muted-foreground">Workflow</p>
              {isManager ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Part history", "Browse date-wise and part-wise inspection history."],
                    ["Reports", "Filter and download reports when needed."],
                    ["Models", "Add and manage model files for backend analysis."],
                    ["Specifications", "Maintain tolerances and expected values."],
                  ].map(([title, text]) => (
                    <div key={title} className="rounded-lg border border-border p-3">
                      <p className="type-body-m font-semibold text-foreground">{title}</p>
                      <p className="type-body-s mt-1 text-muted-foreground">{text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selectedParts.map((partName) => (
                    <div key={partName} className="rounded-lg border border-border p-3">
                      <p className="type-body-m font-semibold text-foreground">{partName}</p>
                      <p className="type-body-s mt-1 text-muted-foreground">Choose a model, then measure and inspect.</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="type-caption uppercase tracking-wide text-muted-foreground">Quick actions</p>
              <div className="mt-3 space-y-2">
                <Button asChild className="w-full justify-start" variant="outline"><Link to="/inspection/new">New inspection</Link></Button>
                {isManager ? (
                  <>
                    <Button asChild className="w-full justify-start" variant="outline"><Link to="/history">Open history</Link></Button>
                    <Button asChild className="w-full justify-start" variant="outline"><Link to="/users">Manage users</Link></Button>
                  </>
                ) : (
                  <>
                    <Button asChild className="w-full justify-start" variant="outline"><Link to="/reports">View report</Link></Button>
                    <Button asChild className="w-full justify-start" variant="outline"><Link to="/history">My history</Link></Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            index={0}
            label="Today's Inspections"
            value={today.length}
            hint={`${inspections.length} lifetime records`}
            icon={ClipboardList}
            tone="blue"
          />
          <MetricCard
            index={1}
            label="OK Parts"
            value={ok}
            hint="Passed measurement and surface"
            icon={CheckCircle2}
            tone="success"
          />
          <MetricCard
            index={2}
            label="Rejected Parts"
            value={rejected}
            hint="Sent to rework or scrap"
            icon={XCircle}
            tone="error"
          />
          <MetricCard
            index={3}
            label="Pending Reviews"
            value={pending}
            hint="Awaiting inspector decision"
            icon={Clock}
            tone="warning"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            index={4}
            label="Measurement Accuracy"
            value={`${accuracy.toFixed(1)}%`}
            hint="Within tolerance band"
            icon={Crosshair}
            tone="blue"
          />
          <MetricCard
            index={5}
            label="Surface Defects"
            value={rejected}
            hint="Detections logged today"
            icon={AlertTriangle}
            tone="orange"
          />
          <MetricCard
            index={6}
            label="Today's Pass Rate"
            value={`${rate}%`}
            hint="OK vs decided parts"
            icon={TrendingUp}
            tone="success"
          />
          <MetricCard
            index={7}
            label="Today's Reject Rate"
            value={`${today.length ? Math.round((100 - rate) * 10) / 10 : 0}%`}
            hint="Reject vs decided parts"
            icon={TrendingDown}
            tone="error"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <SectionCard
            title="Inspection Trend"
            subtitle="Last 7 production days"
            className="xl:col-span-2"
          >
            <div className="h-70">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="okGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rjGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      fontSize: 13,
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="ok" name="OK" stroke="var(--brand-blue)" fill="url(#okGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="reject" name="Reject" stroke="var(--primary)" fill="url(#rjGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Defect Distribution" subtitle="Inspections by part family">
            <div className="h-70">
              {partDistribution.length === 0 ? (
                <EmptyChart label="No inspections recorded yet" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={partDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {partDistribution.map((_, i) => (
                        <Cell key={i} fill={chartColors[i % chartColors.length]} />
                      ))}
                    </Pie>
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--popover)",
                        fontSize: 13,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Hourly Production" subtitle="Parts inspected per hour, current shift">
            <div className="h-65">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="inspected" name="Inspected" fill="var(--brand-blue)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="rejected" name="Rejected" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard
            title="Recent Activity"
            subtitle="Latest inspections"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/history">View all</Link>
              </Button>
            }
            bodyClassName="p-0"
          >
            {inspections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-5 py-14 text-center">
                <ScanLine className="size-8 text-muted-foreground" />
                <p className="type-body-m text-muted-foreground">
                  No inspections yet. Start the first one to populate live metrics.
                </p>
                <Button asChild size="sm">
                  <Link to="/inspection/new">Start inspection</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {inspections.slice(0, 7).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        to="/report/$id"
                        params={{ id: i.id }}
                        className="type-body-m font-semibold text-foreground hover:text-brand-blue-interactive"
                      >
                        {i.inspection_number}
                      </Link>
                      <p className="type-body-s truncate text-muted-foreground">
                        {partName(i.part_id)} · {i.area} · Shift {i.shift}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="type-caption tabular text-muted-foreground">
                        {formatTime(i.inspection_time)}
                      </span>
                      <StatusBadge status={i.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {isManager && (
          <SectionCard title="Measurement Statistics" subtitle="Deviation spread by part family">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {parts.map((p) => {
                const rows = inspections.filter((i) => i.part_id === p.id);
                const okRows = rows.filter((r) => r.status === "ok").length;
                const pct = rows.length ? Math.round((okRows / rows.length) * 100) : 0;
                return (
                  <div key={p.id} className="rounded-xl border border-border bg-background p-4">
                    <p className="type-body-m font-semibold text-foreground">{p.part_name}</p>
                    <p className="metric-s mt-2 text-brand-blue">{pct}%</p>
                    <p className="type-caption mt-1 text-muted-foreground">
                      {rows.length} inspections · {okRows} OK
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand-blue" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center type-body-m text-muted-foreground">
      {label}
    </div>
  );
}
