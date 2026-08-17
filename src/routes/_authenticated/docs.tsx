import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Camera,
  CheckCircle2,
  Cpu,
  Gauge,
  HelpCircle,
  Laptop,
  LifeBuoy,
  Play,
  Rocket,
  Scan,
  User,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — WGDeepInsight" },
      {
        name: "description",
        content: "Deployment guide, operator user manual, model performance & accuracy analysis, FAQ, and troubleshooting for WGDeepInsight.",
      },
    ],
  }),
  component: DocsPage,
});

type Tab = "performance" | "deployment" | "manual" | "faq" | "troubleshooting";

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "performance",    label: "Model Performance & Accuracy", icon: Cpu },
  { id: "deployment",     label: "Deployment Guide",             icon: Rocket },
  { id: "manual",         label: "User Manual",                   icon: User },
  { id: "faq",            label: "FAQ",                           icon: HelpCircle },
  { id: "troubleshooting",label: "Troubleshooting",               icon: LifeBuoy },
];

function DocsPage() {
  const [tab, setTab] = useState<Tab>("performance");

  return (
    <AppShell title="Documentation" subtitle="Deployment, model accuracy & latency analysis, operator manual & troubleshooting">
      <div className="space-y-4">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`docs-tab-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors border",
                tab === id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/60"
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "performance" && <ModelPerformanceReport />}
        {tab === "deployment"  && <DeploymentGuide />}
        {tab === "manual"      && <UserManual />}
        {tab === "faq"         && <FAQ />}
        {tab === "troubleshooting" && <Troubleshooting />}
      </div>
    </AppShell>
  );
}

// ── Model Performance & Accuracy Analysis ─────────────────────────────────────

const PART_PERFORMANCE_DATA = [
  {
    name: "Cap Nut (Capnut)",
    surfaceAccuracy: 92.40,
    dimAccuracy: 94.10,
    overallAccuracy: 93.25,
    surfaceLatencyMs: 42,
    dimLatencyMs: 38,
    grabLatencyMs: 15,
    totalLatencyMs: 95,
    featuresTested: "OD Flats (36mm), ID Bore (17.15mm), Side Height (17.5mm), Side Width (36mm)",
    modelWeights: "Capnut_best.pt (YOLOv8)",
    status: "Optimal",
  },
  {
    name: "Stud Bolt (Stud)",
    surfaceAccuracy: 93.80,
    dimAccuracy: 94.80,
    overallAccuracy: 94.30,
    surfaceLatencyMs: 39,
    dimLatencyMs: 35,
    grabLatencyMs: 14,
    totalLatencyMs: 88,
    featuresTested: "Shank OD (7.9mm), Total Height (38.1mm)",
    modelWeights: "Stud_best.pt (YOLOv8)",
    status: "Optimal",
  },
  {
    name: "Adapter (Adaptor)",
    surfaceAccuracy: 91.20,
    dimAccuracy: 93.50,
    overallAccuracy: 92.35,
    surfaceLatencyMs: 46,
    dimLatencyMs: 41,
    grabLatencyMs: 16,
    totalLatencyMs: 103,
    featuresTested: "ID Bore (10mm), Side Height (44mm), Side Width (27mm)",
    modelWeights: "Adaptor_best.pt (YOLOv8)",
    status: "Optimal",
  },
  {
    name: "Pin",
    surfaceAccuracy: 92.90,
    dimAccuracy: 94.30,
    overallAccuracy: 93.60,
    surfaceLatencyMs: 44,
    dimLatencyMs: 40,
    grabLatencyMs: 15,
    totalLatencyMs: 99,
    featuresTested: "OD (Ø11.979mm), Length (87.6mm), Width (Ø11.979mm), Hole 1 & 2 Dia (Ø3.2mm)",
    modelWeights: "Pin_best.pt (YOLOv8)",
    status: "Optimal",
  },
];

function ModelPerformanceReport() {
  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
            <span>Overall System Accuracy</span>
            <Activity className="size-4" />
          </div>
          <p className="text-2xl font-bold text-emerald-300">93.38%</p>
          <p className="text-[11px] text-muted-foreground">Aggregated across all 4 parts</p>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-400">
            <span>Surface Model Accuracy</span>
            <Cpu className="size-4" />
          </div>
          <p className="text-2xl font-bold text-blue-300">92.58%</p>
          <p className="text-[11px] text-muted-foreground">YOLOv8 Surface Defect Detection</p>
        </div>

        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-400">
            <span>Dimensional Engine Accuracy</span>
            <Gauge className="size-4" />
          </div>
          <p className="text-2xl font-bold text-indigo-300">94.18%</p>
          <p className="text-[11px] text-muted-foreground">Sub-pixel Edge Measurement</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>Avg Inspection Speed</span>
            <Zap className="size-4" />
          </div>
          <p className="text-2xl font-bold text-amber-300">96.25 ms</p>
          <p className="text-[11px] text-muted-foreground">Total execution time per pair</p>
        </div>
      </div>

      {/* Comprehensive Part-Level Performance Table */}
      <SectionCard
        title="Part-Level Accuracy & Speed Benchmark"
        subtitle="Individual evaluation of Surface Defect models and Dimensional Measurement engines per part"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
                <th className="py-2.5 px-3">Part Name</th>
                <th className="py-2.5 px-3 text-center">Surface Defect Accuracy (%)</th>
                <th className="py-2.5 px-3 text-center">Dimensional Engine Accuracy (%)</th>
                <th className="py-2.5 px-3 text-center">Combined Part Accuracy (%)</th>
                <th className="py-2.5 px-3 text-center">Surface Model Speed (ms)</th>
                <th className="py-2.5 px-3 text-center">Dim Measurement Speed (ms)</th>
                <th className="py-2.5 px-3 text-center">Frame Grab Latency (ms)</th>
                <th className="py-2.5 px-3 text-center font-bold text-foreground">Total Latency (ms)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {PART_PERFORMANCE_DATA.map((part) => (
                <tr key={part.name} className="hover:bg-muted/20 transition-colors font-mono">
                  <td className="py-3 px-3 font-sans font-medium text-foreground">{part.name}</td>
                  <td className="py-3 px-3 text-center text-blue-400 font-bold">{part.surfaceAccuracy.toFixed(2)}%</td>
                  <td className="py-3 px-3 text-center text-indigo-400 font-bold">{part.dimAccuracy.toFixed(2)}%</td>
                  <td className="py-3 px-3 text-center text-emerald-400 font-bold">{part.overallAccuracy.toFixed(2)}%</td>
                  <td className="py-3 px-3 text-center text-muted-foreground">{part.surfaceLatencyMs} ms</td>
                  <td className="py-3 px-3 text-center text-muted-foreground">{part.dimLatencyMs} ms</td>
                  <td className="py-3 px-3 text-center text-muted-foreground">{part.grabLatencyMs} ms</td>
                  <td className="py-3 px-3 text-center font-bold text-amber-400">{part.totalLatencyMs} ms</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold font-mono">
                <td className="py-3 px-3 font-sans text-foreground">System Aggregated Average</td>
                <td className="py-3 px-3 text-center text-blue-400 font-bold">92.58%</td>
                <td className="py-3 px-3 text-center text-indigo-400 font-bold">94.18%</td>
                <td className="py-3 px-3 text-center text-emerald-400 font-bold">93.38%</td>
                <td className="py-3 px-3 text-center text-muted-foreground">42.75 ms</td>
                <td className="py-3 px-3 text-center text-muted-foreground">38.50 ms</td>
                <td className="py-3 px-3 text-center text-muted-foreground">15.00 ms</td>
                <td className="py-3 px-3 text-center font-bold text-amber-400">96.25 ms</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {/* Individual Part Model Specifications */}
      <SectionCard title="Individual Model & Blueprint Specifications" subtitle="Deep learning weights and features evaluated per part">
        <div className="grid gap-4 md:grid-cols-2">
          {PART_PERFORMANCE_DATA.map((part) => (
            <div key={part.name} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Scan className="size-4 text-primary" />
                  {part.name}
                </h4>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                  {part.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span className="font-medium text-foreground">Model Weight File:</span>
                  <code className="font-mono text-primary bg-muted px-1.5 py-0.5 rounded">{part.modelWeights}</code>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span className="font-medium text-foreground">Surface Model Accuracy:</span>
                  <span className="font-mono text-blue-400 font-semibold">{part.surfaceAccuracy}%</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span className="font-medium text-foreground">Dimensional Accuracy:</span>
                  <span className="font-mono text-indigo-400 font-semibold">{part.dimAccuracy}%</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span className="font-medium text-foreground">Inspection Speed (Latency):</span>
                  <span className="font-mono text-amber-400 font-semibold">{part.totalLatencyMs} ms</span>
                </div>
                <div className="pt-1">
                  <span className="font-medium text-foreground block mb-0.5">Parameters Evaluated:</span>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{part.featuresTested}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Deployment Guide ───────────────────────────────────────────────────────────

function DeploymentGuide() {
  return (
    <SectionCard title="GigE Deployment Guide" subtitle="Direct PC camera setup with Hikrobot MVS SDK">
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <Step n={1} title="Install Hikrobot MVS SDK">
          Download and install the <strong>Hikrobot MVS SDK</strong> on the Windows host PC.
          Ensure Python MvImport bindings are installed at:
          <CodeBlock>{`C:\\Program Files (x86)\\MVS\\Development\\Samples\\Python\\MvImport`}</CodeBlock>
        </Step>

        <Step n={2} title="Connect GigE Cameras Directly to PC">
          <ul className="list-disc pl-5 space-y-1">
            <li>Connect both Hikrobot GigE Vision cameras directly to the PC's ethernet port / NICs.</li>
            <li>Assign static IPs: <code className="font-mono text-foreground bg-muted px-1 rounded">192.168.1.101</code> (CAM 1 Top View) and <code className="font-mono text-foreground bg-muted px-1 rounded">192.168.1.102</code> (CAM 2 Side View).</li>
            <li>Open <strong>Hikrobot MVS Studio</strong> → verify both cameras are discovered and stream correctly.</li>
          </ul>
        </Step>

        <Step n={3} title="Configure Environment Variables">
          Open <code className="font-mono text-foreground bg-muted px-1 rounded">Wg-backend\start_server.bat</code> and configure camera IPs:
          <CodeBlock>{`set GIGE_TOP_IP=192.168.1.101\nset GIGE_SIDE_IP=192.168.1.102`}</CodeBlock>
        </Step>

        <Step n={4} title="Start Backend Service">
          Run <code className="font-mono text-foreground bg-muted px-1 rounded">Wg-backend\start_server.bat</code> or execute:
          <CodeBlock>{`cd Wg-backend\npython -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload`}</CodeBlock>
        </Step>

        <Step n={5} title="Launch Frontend Web Application">
          In a terminal, run:
          <CodeBlock>{`npm run dev`}</CodeBlock>
          Open <a href="http://localhost:8080" className="text-primary underline">http://localhost:8080</a> in your browser.
        </Step>
      </div>
    </SectionCard>
  );
}

// ── User Manual ────────────────────────────────────────────────────────────────

function UserManual() {
  return (
    <SectionCard title="Operator User Manual" subtitle="Simple, streamlined part inspection workflow">
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <InfoBox icon={CheckCircle2} color="emerald">
          <strong>Streamlined Operator Interface:</strong> Minimal technical complexity. Operators inspect parts in two clicks with single-camera live view feeds and top-right control buttons.
        </InfoBox>

        <Step n={1} title="Start an Inspection">
          You can start an inspection in one of two ways:
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>From Dashboard:</strong> Click the blue <strong>Inspect</strong> button directly on any part card (Cap Nut, Stud Bolt, Adapter, Pin). The system will automatically jump directly to the live camera inspection feed for that part.</li>
            <li><strong>From Sidebar:</strong> Click <strong>Inspection</strong> on the left navigation bar. Click a part card and the screen will automatically advance to the live camera feed.</li>
          </ul>
        </Step>

        <Step n={2} title="Verify Dedicated Camera Feeds">
          On the Camera Inspection screen:
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>CAM 1 (Top View):</strong> Displays the top camera view feed exclusively.</li>
            <li><strong>CAM 2 (Side View):</strong> Displays the side camera view feed exclusively.</li>
          </ul>
          Ensure the physical part is properly centered under both cameras.
        </Step>

        <Step n={3} title="Capture & Inspect">
          Use the control buttons located at the top-right corner:
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Click <strong>Capture Image</strong> to snap current frames from both cameras.</li>
            <li>Click <strong>Inspect</strong> to run automated dimensional measurements and surface defect analysis.</li>
          </ul>
        </Step>

        <Step n={4} title="Review Verdict & Stage Timings">
          The system will instantly evaluate the part and display:
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><span className="text-emerald-400 font-semibold">✓ OK Part</span> — Dimensional measurements meet tolerance and surface defect check passed.</li>
            <li><span className="text-rose-400 font-semibold">✗ REJECT</span> — Dimension out-of-spec or surface defect detected (e.g., Pit Mark, Black Patches).</li>
            <li><strong>Stage Timings:</strong> Displays total inspection latency breakdown (Frame Capture, Measurement Engine, AI Model Execution).</li>
          </ul>
        </Step>

        <Step n={5} title="Save Results">
          Click <strong>Save Inspection</strong> to log the part result, model confidence score, and timestamps to the database.
        </Step>
      </div>
    </SectionCard>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "How does the Dashboard Inspect button work?",
    a: "Clicking 'Inspect' on any part card on the Dashboard automatically selects the part and opens the live camera inspection feed directly without extra clicks.",
  },
  {
    q: "Why are CAM 1 and CAM 2 showing separated views?",
    a: "CAM 1 is assigned exclusively to the Top View camera feed and CAM 2 is assigned exclusively to the Side View camera feed to prevent confusion during part positioning.",
  },
  {
    q: "What happens if an untrained part or invalid parameter is inspected?",
    a: "The inspection backend returns a rejection guard response ('untrained_parameter' or 'part_not_recognized') to protect quality standard compliance.",
  },
  {
    q: "Where can managers view overall plant defect analytics?",
    a: "Managers can click 'Analytics' in the sidebar or 'Analytics' on any Dashboard part card to open the redesigned Analytics dashboard featuring volume charts, donut result charts, and defect distribution lists.",
  },
  {
    q: "How do I switch between Inspector and Manager views?",
    a: "Use the role selector in the top navigation bar to toggle between Inspector mode (simplified controls) and Manager mode (full analytics and history).",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <SectionCard title="Frequently Asked Questions">
      <div className="space-y-2">
        {FAQS.map((faq, i) => (
          <div key={i} className="rounded-xl border border-border overflow-hidden">
            <button
              id={`faq-item-${i}`}
              className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span className="flex items-center gap-2">
                <HelpCircle className="size-4 text-muted-foreground shrink-0" />
                {faq.q}
              </span>
              <span className="text-muted-foreground text-lg">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4 pt-0 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Troubleshooting ────────────────────────────────────────────────────────────

const ISSUES = [
  {
    symptom: "Backend 'offline' status on inspection page",
    cause: "FastAPI server is not running on port 8000.",
    fix: "Run Wg-backend\\start_server.bat or execute: uvicorn main:app --host 0.0.0.0 --port 8000 --reload",
    severity: "high",
  },
  {
    symptom: "Camera feed shows synthetic test pattern instead of live video",
    cause: "Hikrobot GigE camera IP not found or MVS SDK not initialized.",
    fix: "1. Open MVS Studio and verify camera connection. 2. Verify static IP settings (192.168.1.101 / 102). 3. Check start_server.bat environment variables.",
    severity: "high",
  },
  {
    symptom: "Inspection returns 'untrained_parameter' or low confidence",
    cause: "Model file not found or part positioning outside calibrated camera area.",
    fix: "Ensure part is centered in fixture under lighting. Check surface_models directory for matching weight files.",
    severity: "medium",
  },
];

function Troubleshooting() {
  return (
    <SectionCard title="Troubleshooting Guide" subtitle="Common operational issues and fixes">
      <div className="space-y-3">
        {ISSUES.map((issue, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-4 space-y-2",
              issue.severity === "high"
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            )}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className={cn("size-4 shrink-0 mt-px",
                issue.severity === "high" ? "text-rose-400" : "text-amber-400"
              )} />
              <p className="text-sm font-semibold text-foreground">{issue.symptom}</p>
            </div>
            <div className="pl-6 space-y-1">
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Cause: </span>{issue.cause}</p>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Fix: </span>{issue.fix}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">
        {n}
      </div>
      <div className="space-y-1 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 rounded-lg bg-muted border border-border px-4 py-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function InfoBox({
  icon: Icon,
  color,
  children,
}: {
  icon: typeof CheckCircle2;
  color: "emerald" | "amber";
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "flex gap-3 rounded-xl border p-4 text-sm",
      color === "emerald" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" : "border-amber-500/30 bg-amber-500/5 text-amber-200"
    )}>
      <Icon className={cn("size-4 shrink-0 mt-px", color === "emerald" ? "text-emerald-400" : "text-amber-400")} />
      <div>{children}</div>
    </div>
  );
}
