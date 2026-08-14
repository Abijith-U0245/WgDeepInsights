import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import {
  Camera,
  Cpu,
  Database,
  Globe,
  Monitor,
  Network,
  Server,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/design")({
  head: () => ({
    meta: [
      { title: "Solution Design — WGDeepInsight" },
      { name: "description", content: "High-level system architecture and deployment overview for the WGDeepInsight system." },
    ],
  }),
  component: DesignPage,
});

export default function DesignPage() {
  return (
    <AppShell
      title="Solution Design"
      subtitle="System architecture, component overview, and deployment flow"
    >
      <div className="space-y-6">
        {/* Architecture Diagram */}
        <SectionCard
          title="System Architecture"
          subtitle="End-to-end data flow from GigE cameras to the inspection dashboard"
        >
          <div className="overflow-x-auto py-2">
            {/* Visual architecture flow */}
            <div className="flex flex-wrap items-center justify-center gap-3 min-w-[640px]">
              {[
                { icon: Camera,  label: "GigE Camera\n(Top View)",  color: "bg-sky-500/10 border-sky-500/30 text-sky-400"      },
                { icon: Camera,  label: "GigE Camera\n(Side View)", color: "bg-sky-500/10 border-sky-500/30 text-sky-400"      },
              ].map((n, i) => (
                <ArchNode key={i} icon={n.icon} label={n.label} color={n.color} />
              ))}
              <Arrow />
              <ArchNode icon={Monitor}  label="MVS SDK\n(Windows PC)"   color="bg-violet-500/10 border-violet-500/30 text-violet-400" />
              <Arrow />
              <ArchNode icon={Server}   label="FastAPI\nBackend"         color="bg-orange-500/10 border-orange-500/30 text-orange-400" />
              <Arrow />
              <ArchNode icon={Cpu}      label="YOLO + OpenCV\nInspection"  color="bg-rose-500/10 border-rose-500/30 text-rose-400"   />
              <Arrow />
              <ArchNode icon={Globe}    label="React\nDashboard"          color="bg-emerald-500/10 border-emerald-500/30 text-emerald-400" />
              <Arrow />
              <ArchNode icon={Database} label="Supabase\nDatabase"        color="bg-amber-500/10 border-amber-500/30 text-amber-400" />
            </div>
          </div>

          {/* Deployment notes */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Network, title: "GigE Direct Connection", desc: "Cameras connect via GigE NIC directly to the inspection PC. No hub, no streaming server required. Low latency < 50 ms grab time." },
              { icon: Zap,     title: "On-Premise Processing",  desc: "All AI inference runs locally (YOLO v8 on GPU/CPU). No cloud dependency for real-time inspection. Data stored locally or Supabase." },
              { icon: Monitor, title: "Web Dashboard",          desc: "React SPA served on localhost:3000. Accessible from any browser on the same network — no installation on operator PCs." },
            ].map((card) => (
              <div key={card.title} className="rounded-xl border border-border bg-muted/20 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <card.icon className="size-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold text-foreground">{card.title}</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function ArchNode({
  icon: Icon,
  label,
  color,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  color: string;
}) {
  const lines = label.split("\n");
  return (
    <div className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 min-w-[90px] text-center ${color}`}>
      <Icon className="size-5" />
      {lines.map((l, i) => (
        <span key={i} className="text-[11px] font-semibold leading-tight">{l}</span>
      ))}
    </div>
  );
}

function Arrow() {
  return (
    <div className="text-muted-foreground text-lg font-light">→</div>
  );
}
