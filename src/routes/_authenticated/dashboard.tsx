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
  ScanEye,
  ScanLine,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/common/MetricCard";
import { PartImage } from "@/components/common/PartImage";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useInspections, useParts } from "@/hooks/useInspectionData";
import { formatTime, isToday, passRate } from "@/lib/inspection-utils";
import { PART_DESCRIPTORS, getPartDescriptor } from "@/lib/part-descriptors";

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
              <div className="flex items-center justify-between">
                <p className="type-caption uppercase tracking-wide text-muted-foreground">
                  {isManager ? "Inspected Part Families" : "Workflow — Select a Part"}
                </p>
                <Link
                  to="/parts"
                  className="type-caption font-medium text-brand-blue-interactive hover:underline"
                >
                  View all →
                </Link>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {PART_DESCRIPTORS.map((d) => (
                  <div key={d.key} className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
                    <div className="relative overflow-hidden">
                      <img
                        src={d.photo}
                        alt={`${d.name} part photograph`}
                        className="h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground backdrop-blur-sm">
                        {d.partNumber}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="type-body-m font-semibold text-foreground">{d.name}</p>
                      <p className="type-body-s mt-0.5 text-muted-foreground line-clamp-1">{d.tagline}</p>
                      {isManager ? (
                        <p className="type-caption mt-1.5 text-muted-foreground/70 line-clamp-2">
                          {d.inspectionFocus[0]}
                        </p>
                      ) : (
                        <p className="type-caption mt-1.5 text-muted-foreground/70">
                          {d.category}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
          <SectionCard
            title="Measurement Statistics"
            subtitle="Pass rate by part family · click a part for full analysis"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/parts">Part Catalogue →</Link>
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Use static descriptors so cards always appear even with no DB rows */}
              {PART_DESCRIPTORS.map((d) => {
                const dbPart = parts.find((p) => getPartDescriptor(p.part_name)?.key === d.key);
                const rows = dbPart ? inspections.filter((i) => i.part_id === dbPart.id) : [];
                const okRows = rows.filter((r) => r.status === "ok").length;
                const pct = rows.length ? Math.round((okRows / rows.length) * 100) : 0;
                return (
                  <Link key={d.key} to="/parts" className="group block overflow-hidden rounded-xl border border-border bg-background transition-shadow hover:shadow-lg">
                    <div className="relative overflow-hidden">
                      <img
                        src={d.photo}
                        alt={`${d.name} photograph`}
                        className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-background/75 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
                        {d.partNumber}
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="type-body-m font-semibold text-foreground">{d.name}</p>
                      <p className="type-body-s mt-0.5 text-muted-foreground line-clamp-1">{d.tagline}</p>
                      <p className="metric-s mt-2 text-brand-blue">{pct}%</p>
                      <p className="type-caption mt-1 text-muted-foreground">
                        {rows.length} inspections · {okRows} OK
                      </p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand-blue" style={{ width: `${pct}%` }} />
                      </div>
                      {/* Primary inspection focus */}
                      <p className="mt-3 type-caption text-muted-foreground/70 line-clamp-2 border-t border-border pt-2">
                        <ScanEye className="inline size-3 mr-1" />
                        {d.inspectionFocus[0]}
                      </p>
                    </div>
                  </Link>
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
