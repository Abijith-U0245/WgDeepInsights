import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  PieChart as PieIcon,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAllDefectResults, useInspections, useParts } from "@/hooks/useInspectionData";
import { formatTime, passRate } from "@/lib/inspection-utils";
import { PART_DESCRIPTORS } from "@/lib/part-descriptors";

type SearchParams = {
  part?: string;
};

export const Route = createFileRoute("/_authenticated/analytics")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    part: typeof search.part === "string" ? search.part : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Analytics — WGDeepInsight | WG Tech" },
      {
        name: "description",
        content:
          "Quality analytics: pass rate trends, defect categories, and daily inspection performance across part families.",
      },
      { property: "og:title", content: "Analytics — WGDeepInsight" },
      {
        property: "og:description",
        content: "Detailed quality analytics and defect distribution dashboard.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const PART_OPTIONS = [
  { id: "all", label: "All Parts" },
  { id: "Cap Nut", label: "Cap Nut" },
  { id: "Stud Bolt", label: "Stud Bolt" },
  { id: "Adapter", label: "Adapter" },
  { id: "Pin", label: "Pin" },
];

/** Strict Defect Name Sanitizer:
 * Removes 'Pair #X · ', '(TOP VIEW)', '[latency...]', pure numbers, and filters out 'okay' / 'ok' non-defects.
 */
function cleanDefectName(rawName: string): string | null {
  if (!rawName) return null;

  let str = rawName.trim();

  // 1. Filter out latency, duration, metadata logs, numbers, and bracket terms
  if (
    /latency/i.test(str) ||
    /duration/i.test(str) ||
    /fps/i.test(str) ||
    /^\[/.test(str) ||
    /\]$/.test(str) ||
    /^\d+$/.test(str) || // Pure numbers like 85, 6838, 6733, 1
    /^\d+\.\d+$/.test(str) ||
    /ms$/i.test(str) ||
    /sec$/i.test(str)
  ) {
    return null;
  }

  // 2. Remove "Pair #1 · ", "Pair #2 • ", "Pair 3 - ", etc. & camera view tags
  str = str
    .replace(/^Pair\s*#?\d+[\s\u00B7•\-\:\.·]*/gi, "")
    .replace(/\s*\([^)]*VIEW\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/_/g, " ")
    .trim();

  if (!str) return null;

  const lower = str.toLowerCase();

  // 3. Filter out non-defect terms (OK / PASS / GOOD / OKAY / CLEAN)
  if (
    lower === "okay" ||
    lower === "ok" ||
    lower === "pass" ||
    lower === "good" ||
    lower === "none" ||
    lower === "normal" ||
    lower === "no defect" ||
    lower === "no defects" ||
    lower === "no_defect" ||
    lower === "clean" ||
    lower === "-" ||
    lower === "—" ||
    lower === "n/a" ||
    /^\d+$/.test(lower)
  ) {
    return null;
  }

  // 4. Standardize defect category names
  if (lower.includes("blackpatch") || lower.includes("black patch")) return "Black Patch";
  if (lower.includes("whitepatch") || lower.includes("white patch")) return "White Patch";
  if (lower.includes("hexout") || lower.includes("hex outage") || lower.includes("hex out")) return "Hex Outage";
  if (lower.includes("hexdamage") || lower.includes("hex damage")) return "Hex Damage";
  if (lower.includes("drillpoint") || lower.includes("drill point")) return "Drill Point";
  if (lower.includes("threadburr") || lower.includes("thread burr") || lower.includes("white paint")) return "Thread Burr";
  if (lower.includes("rustpatch") || lower.includes("rust patch")) return "Rust Patch";

  // 5. Title Case for remaining valid defect names
  return str
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Format remarks string for table display removing okay status & metadata */
function formatRemarks(remarks?: string | null): string {
  if (!remarks) return "—";
  const parts = remarks.split(/[,;|\n]/);
  const items = parts
    .map((r) => cleanDefectName(r))
    .filter((item): item is string => Boolean(item));
  if (items.length === 0) return "—";
  return Array.from(new Set(items)).join(", ");
}

function AnalyticsPage() {
  const { part: queryPart } = Route.useSearch();
  const navigate = useNavigate();
  const { data: inspections = [] } = useInspections();
  const { data: parts = [] } = useParts();
  const { data: allDefects = [] } = useAllDefectResults();

  const [selectedPart, setSelectedPart] = useState<string>(queryPart || "all");

  // Filter 100% real inspections from database by selected part (handling space/hyphen variations)
  const filteredInspections = useMemo(() => {
    if (selectedPart === "all" || !selectedPart) return inspections;

    const targetNorm = selectedPart.toLowerCase().replace(/[\s\-_]/g, "");

    // Find DB part by fuzzy normalized name
    const dbPart = parts.find((p) => {
      const pNorm = p.part_name.toLowerCase().replace(/[\s\-_]/g, "");
      return pNorm.includes(targetNorm) || targetNorm.includes(pNorm);
    });

    return inspections.filter((i) => {
      // 1. Direct part_id match
      if (dbPart && i.part_id === dbPart.id) return true;

      // 2. Part name match from parts relation
      const iPartName = parts.find((p) => p.id === i.part_id)?.part_name ?? "";
      if (iPartName) {
        const iPartNorm = iPartName.toLowerCase().replace(/[\s\-_]/g, "");
        if (iPartNorm.includes(targetNorm) || targetNorm.includes(iPartNorm)) return true;
      }

      // 3. Inspection number / remarks text match
      const remarksNorm = (i.remarks || "").toLowerCase().replace(/[\s\-_]/g, "");
      const numNorm = (i.inspection_number || "").toLowerCase().replace(/[\s\-_]/g, "");

      if (remarksNorm.includes(targetNorm) || numNorm.includes(targetNorm)) return true;

      // 4. Keyword family matching (cap, stud, adapter, pin)
      if (targetNorm.includes("cap") && (numNorm.includes("cap") || remarksNorm.includes("cap"))) return true;
      if (targetNorm.includes("stud") && (numNorm.includes("std") || numNorm.includes("stud") || remarksNorm.includes("stud"))) return true;
      if (targetNorm.includes("adapter") && (numNorm.includes("adp") || numNorm.includes("adapter") || remarksNorm.includes("adapter"))) return true;
      if (targetNorm.includes("pin") && (numNorm.includes("pin") || remarksNorm.includes("pin"))) return true;

      return false;
    });
  }, [inspections, parts, selectedPart]);

  // 100% Real aggregate stats from database
  const totalInspected = filteredInspections.length;
  const okCount = filteredInspections.filter(
    (i) => i.status?.toLowerCase() === "ok" || i.status?.toLowerCase() === "pass"
  ).length;
  const defectCount = filteredInspections.filter(
    (i) => i.status?.toLowerCase() === "reject" || i.status?.toLowerCase() === "fail"
  ).length;

  const goodPct = totalInspected > 0 ? Math.round((okCount / totalInspected) * 1000) / 10 : 0;
  const defectPct = totalInspected > 0 ? Math.round((defectCount / totalInspected) * 1000) / 10 : 0;

  const pieData = useMemo(() => {
    if (totalInspected === 0) {
      return [{ name: "No Inspections", value: 1, color: "var(--muted)" }];
    }
    return [
      { name: "Good parts", value: okCount, color: "#10b981" },
      { name: "Defected Parts", value: defectCount, color: "#1d4ed8" },
    ];
  }, [totalInspected, okCount, defectCount]);

  // 100% Real hourly volume calculated from actual inspection timestamps
  const hourlyVolume = useMemo(() => {
    const hours = [
      "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
      "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"
    ];
    const counts: Record<string, number> = {};
    hours.forEach((h) => (counts[h] = 0));

    filteredInspections.forEach((i) => {
      const timeStr = i.inspection_time || i.created_at;
      if (timeStr) {
        const partsTime = timeStr.split(":");
        if (partsTime.length >= 1) {
          const hourKey = `${partsTime[0].padStart(2, "0")}:00`;
          if (counts[hourKey] !== undefined) {
            counts[hourKey] += 1;
          }
        }
      }
    });

    return hours.map((hour) => ({ hour, volume: counts[hour] }));
  }, [filteredInspections]);

  // Cleaned real defect breakdown without Pair #, camera view tags, latency logs, or 'okay' entries
  const defectList = useMemo(() => {
    const filteredIds = new Set(filteredInspections.map((i) => i.id));
    const countsMap = new Map<string, number>();

    const addDefect = (raw: string) => {
      const parts = raw.split(/[,;|\n]/);
      parts.forEach((p) => {
        const cleaned = cleanDefectName(p);
        if (cleaned) {
          countsMap.set(cleaned, (countsMap.get(cleaned) || 0) + 1);
        }
      });
    };

    allDefects.forEach((d) => {
      if (filteredIds.has(d.inspection_id) && d.defect_name) {
        addDefect(d.defect_name);
      }
    });

    // Also parse remarks for defect tags
    filteredInspections.forEach((i) => {
      if (i.remarks && (i.status === "reject" || i.status === "fail")) {
        addDefect(i.remarks);
      }
    });

    const list = Array.from(countsMap.entries()).map(([name, count]) => ({ name, count }));
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [allDefects, filteredInspections]);

  const maxDefectCount = useMemo(
    () => Math.max(...defectList.map((d) => d.count), 1),
    [defectList]
  );

  // 100% Real daily inspection performance calculated from database timestamps
  const dailyPerformance = useMemo(() => {
    const daysOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const map = new Map<string, { total: number; defects: number }>();
    daysOrder.forEach((d) => map.set(d, { total: 0, defects: 0 }));

    filteredInspections.forEach((i) => {
      const dateObj = new Date(i.inspection_date || i.created_at);
      if (!isNaN(dateObj.getTime())) {
        const dayIdx = (dateObj.getDay() + 6) % 7; // Monday = index 0
        const dayName = daysOrder[dayIdx];
        const existing = map.get(dayName) || { total: 0, defects: 0 };
        const isDefect = i.status?.toLowerCase() === "reject" || i.status?.toLowerCase() === "fail";
        map.set(dayName, {
          total: existing.total + 1,
          defects: existing.defects + (isDefect ? 1 : 0),
        });
      }
    });

    const rows = daysOrder.map((day) => {
      const data = map.get(day) || { total: 0, defects: 0 };
      const pct = data.total > 0 ? Math.round((data.defects / data.total) * 1000) / 10 : 0;
      return { day, inspections: data.total, defectPct: pct };
    });

    const maxInspections = Math.max(...rows.map((r) => r.inspections), 1);
    return rows.map((r) => ({ ...r, maxInspections }));
  }, [filteredInspections]);

  return (
    <AppShell title="Analytics" subtitle="Real-time quality performance & surface defect distribution">
      <div className="space-y-6">
        {/* ── Top Bar: Part Selector & Header ─────────────────────────────── */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Detection:</span>
            <Select value={selectedPart} onValueChange={(val) => setSelectedPart(val)}>
              <SelectTrigger className="w-[200px] bg-background font-semibold text-foreground">
                <SelectValue placeholder="Select part family" />
              </SelectTrigger>
              <SelectContent>
                {PART_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-right sm:text-right">
            <h2 className="type-h-m text-foreground font-bold">
              {selectedPart === "all" ? "All Parts" : selectedPart} • Defect Detection
            </h2>
            <p className="type-body-s text-muted-foreground">
              Real-Time Feed • {totalInspected} Inspection Records
            </p>
          </div>
        </div>

        {/* ── Stat Cards Row ─────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Inspected
            </p>
            <p className="mt-2 text-3xl font-bold text-foreground">{totalInspected}</p>
            <p className="mt-1 text-xs text-muted-foreground">Real-time DB records</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Good Parts
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{okCount}</p>
            <p className="mt-1 text-xs text-emerald-600/80 font-medium">
              {goodPct}% of inspections
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Defective Parts
            </p>
            <p className="mt-2 text-3xl font-bold text-brand-blue">{defectCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {defectList.length} defect categories
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Defect Rate
            </p>
            <p className="mt-2 text-3xl font-bold text-foreground">{defectPct}%</p>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              Top: {defectList[0]?.name ?? "None"}
            </p>
          </div>
        </div>

        {/* ── Middle Row: Hourly Volume & Result Donut Chart ──────────────── */}
        <div className="grid gap-5 lg:grid-cols-3">
          <SectionCard
            title="Inspection Volume Over Time"
            subtitle="Real-time hourly throughput (06:00 to 17:00)"
            className="lg:col-span-2"
          >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyVolume} margin={{ left: -20, right: 10, top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 13 }}
                  />
                  <Bar dataKey="volume" name="Inspections" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Inspection Result" subtitle="Good vs Defected parts breakdown">
            <div className="flex h-[260px] flex-col items-center justify-center">
              <div className="relative h-[180px] w-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={totalInspected > 0 ? 3 : 0}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 13 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-foreground">{goodPct}%</span>
                  <span className="text-[11px] font-medium text-emerald-600">Good parts</span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-center gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Good parts ({okCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-brand-blue" />
                  <span className="text-muted-foreground">Defected Parts ({defectCount})</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Third Row: Defect Distribution & Inspection Performance ──────── */}
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard
            title="Defect Distribution"
            subtitle={`${selectedPart} — defect categories`}
          >
            {defectList.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No surface defects recorded in real-time inspection runs.
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {defectList.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-foreground">{item.name}</span>
                      <span className="text-muted-foreground">{item.count}</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-rose-500/85 transition-all duration-500"
                        style={{ width: `${(item.count / maxDefectCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Inspection Performance"
            subtitle="Daily inspection count and defect rate"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-semibold">DAY</th>
                    <th className="py-2.5 px-3 font-semibold">INSPECTIONS</th>
                    <th className="py-2.5 px-3 text-right font-semibold">COUNT DEFECT %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {dailyPerformance.map((row) => (
                    <tr key={row.day} className="hover:bg-muted/30">
                      <td className="py-3 px-3 font-semibold text-foreground">{row.day}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-brand-blue"
                              style={{ width: `${(row.inspections / row.maxInspections) * 100}%` }}
                            />
                          </div>
                          <span className="font-semibold text-foreground">{row.inspections}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-rose-500">
                        {row.defectPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* ── Bottom Section: Inspection History Table ────────────────────── */}
        <SectionCard
          title="Inspection History"
          subtitle="Real-time inspection records and verification log"
          action={
            <Button asChild variant="default" size="sm" className="bg-brand-blue hover:bg-brand-blue/90 text-white">
              <Link to="/history">
                View History <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          }
          bodyClassName="p-0"
        >
          {filteredInspections.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No real-time inspections logged for this part filter. Perform an inspection to see live entries.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">PART</th>
                    <th className="py-3 px-4 font-semibold">DATE / TIME</th>
                    <th className="py-3 px-4 font-semibold">RESULT</th>
                    <th className="py-3 px-4 font-semibold">DEFECT / REMARKS</th>
                    <th className="py-3 px-4 font-semibold">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredInspections.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {parts.find((p) => p.id === row.part_id)?.part_name ?? selectedPart}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {row.inspection_date} · {formatTime(row.inspection_time)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold">
                        <span className={row.status === "ok" || row.status === "pass" ? "text-emerald-600" : "text-rose-500"}>
                          {row.status === "ok" || row.status === "pass" ? "OK Part" : "Defective"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground font-mono">
                        {formatRemarks(row.remarks)}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
