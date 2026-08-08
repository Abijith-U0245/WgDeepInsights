import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Cpu,
  FileText,
  Loader2,
  PlayCircle,
  Ruler,
  ScanEye,
  ScanLine,
  ShieldAlert,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PartImage } from "@/components/common/PartImage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useModels, useParts, useSpecifications } from "@/hooks/useInspectionData";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/storage";
import { cn } from "@/lib/utils";
import {
  checkBackendHealth,
  measureStreamUrl,
  inspectStreamUrl,
  triggerMeasure,
  triggerInspect,
  runFullTest,
  toSupabaseMeasurement,
  toSupabaseDefect,
  type MeasureResult,
  type InspectResult,
  type RunTestResult,
} from "@/services/inspectionApi";

export const Route = createFileRoute("/_authenticated/inspection/new")({
  head: () => ({
    meta: [
      { title: "New Inspection — WGDeepInsight | WG Tech" },
      {
        name: "description",
        content:
          "Guided four-step inspection: part selection, AI model, specification review, capture and analysis.",
      },
      { property: "og:title", content: "New Inspection — WGDeepInsight" },
      {
        property: "og:description",
        content: "Capture frames and run dimensional plus surface defect analysis.",
      },
    ],
  }),
  component: NewInspectionPage,
});

const STEPS = [
  { label: "Part", icon: ScanLine },
  { label: "Model", icon: Cpu },
  { label: "Specification", icon: Ruler },
  { label: "Measure & Inspect", icon: FileText },
];

function NewInspectionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [partId, setPartId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [area, setArea] = useState("Line A");
  const [shift, setShift] = useState("A");
  const [remarks, setRemarks] = useState("");

  // Backend connection status
  const [backendStatus, setBackendStatus] = useState<"ready" | "demo" | "offline" | "checking">("checking");

  // Results from each stage
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [testResult, setTestResult] = useState<RunTestResult | null>(null);
  const [running, setRunning] = useState<"measure" | "inspect" | "test" | "save" | null>(null);

  // Live feed mode: "measure" shows measurement stream, "inspect" shows YOLO stream
  const [feedMode, setFeedMode] = useState<"measure" | "inspect">("measure");

  const { data: parts = [] } = useParts();
  const part = parts.find((p) => p.id === partId);

  const { data: models = [] } = useModels(undefined, part?.part_name);
  const { data: specs = [] } = useSpecifications(partId || undefined, part?.part_name);

  // Instead of showing 2 separate DB models, we unify them in the UI
  const unifiedModelId = partId ? `${partId}-unified` : "";
  const partModels = useMemo(
    () => models.filter((m) => !m.part_id || m.part_id === partId),
    [models, partId],
  );

  // Derived final verdict
  const finalStatus: "ok" | "reject" | null = testResult
    ? testResult.verdict
    : null;

  const canNext = [Boolean(partId), Boolean(modelId), specs.length >= 0, false][step];

  // Check backend health when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    setBackendStatus("checking");
    checkBackendHealth().then(setBackendStatus);
  }, [step]);

  async function handleMeasure() {
    if (!part) return;
    setRunning("measure");
    setMeasureResult(null);
    try {
      const res = await triggerMeasure(part.part_name);
      setMeasureResult(res);
      toast.success(`Measurement complete — ${res.status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Measurement failed");
    } finally {
      setRunning(null);
    }
  }

  async function handleInspect() {
    if (!part) return;
    setRunning("inspect");
    setInspectResult(null);
    setFeedMode("inspect");
    try {
      const res = await triggerInspect(part.part_name);
      setInspectResult(res);
      toast.success(`Surface inspection complete — ${res.status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Inspection failed");
    } finally {
      setRunning(null);
    }
  }

  async function handleRunTest() {
    if (!part) return;
    setRunning("test");
    setTestResult(null);
    try {
      const res = await runFullTest(part.part_name);
      setTestResult(res);
      const emoji = res.verdict === "ok" ? "✅" : "❌";
      toast.success(`${emoji} Full test complete — ${res.verdict.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Full test failed");
    } finally {
      setRunning(null);
    }
  }

  async function handleSave() {
    if (!user || !finalStatus || !testResult) return;
    setRunning("save");
    try {
      const now = new Date();
      const { data: inspection, error } = await supabase
        .from("inspections")
        .insert({
          inspector_id: user.id,
          part_id: partId,
          model_id: modelId,
          inspection_date: now.toISOString().slice(0, 10),
          inspection_time: now.toTimeString().slice(0, 8),
          shift,
          area,
          duration_seconds: Math.round(testResult.duration_ms / 1000),
          status: finalStatus,
          remarks,
        })
        .select("id, inspection_number")
        .single();
      if (error) throw error;

      const inspectionId = inspection.id as string;

      if (testResult.measurements.length) {
        await supabase.from("measurement_results").insert(
          testResult.measurements.map((m) => ({
            inspection_id: inspectionId,
            ...toSupabaseMeasurement(m),
          })),
        );
      }
      if (testResult.defects.length) {
        await supabase.from("defect_results").insert(
          testResult.defects.map((d) => ({
            inspection_id: inspectionId,
            ...toSupabaseDefect(d),
          })),
        );
      }

      // Upload captured top and side views to storage
      const imagesToUpload = [
        { b64: testResult.top_measure_b64, type: "measurement_top" },
        { b64: testResult.side_measure_b64, type: "measurement_side" },
        { b64: testResult.top_inspect_b64, type: "defect_top" },
        { b64: testResult.side_inspect_b64, type: "defect_side" },
      ];

      for (const img of imagesToUpload) {
        if (!img.b64) continue;
        try {
          const base64Data = (img.b64.includes(",") ? img.b64.split(",")[1] : img.b64) || "";
          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const file = new File([bytes], `${img.type}.jpg`, { type: "image/jpeg" });
          const ref = await uploadFile("captured-images", file, inspectionId);
          await supabase.from("captured_images").insert({
            inspection_id: inspectionId,
            image_type: img.type,
            image_url: ref,
          });
        } catch (uploadErr) {
          console.error("Failed to upload image to storage:", img.type, uploadErr);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["inspections"] });
      toast.success(`Saved ${inspection.inspection_number as string}`);
      void navigate({ to: "/report/$id", params: { id: inspectionId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save inspection");
    } finally {
      setRunning(null);
    }
  }

  return (
    <AppShell title="New Inspection" subtitle="Guided measurement and surface defect workflow">
      <div className="space-y-5">
        <Stepper step={step} />

        {step === 0 && (
          <SectionCard title="Select part" subtitle="Choose the part family being inspected">
            {parts.length === 0 ? (
              <p className="type-body-m text-muted-foreground">
                No parts configured yet. Ask an inspection manager to add parts first.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {parts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPartId(p.id)}
                    className={cn(
                      "group flex gap-4 rounded-xl border p-4 text-left transition-all",
                      partId === p.id
                        ? "border-primary bg-primary-subtle shadow-card"
                        : "border-border bg-background hover:border-brand-blue/40 hover:shadow-card",
                    )}
                  >
                    <PartImage
                      partName={p.part_name}
                      refValue={p.reference_image}
                      alt={p.part_name}
                      usePhoto={true}
                      className="size-16 shrink-0 rounded-lg object-contain p-1"
                    />
                    <div className="min-w-0">
                      <p className="type-body-m font-semibold text-foreground">{p.part_name}</p>
                      <p className="type-body-s line-clamp-2 text-muted-foreground">
                        {p.description || "No description"}
                      </p>
                    </div>
                    {partId === p.id && <Check className="ml-auto size-5 shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {step === 1 && (
          <SectionCard title="Select AI model" subtitle="Active detection model for this part">
            {!partId ? (
              <p className="type-body-m text-muted-foreground">
                Please select a part first.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setModelId(unifiedModelId)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    modelId === unifiedModelId
                      ? "border-primary bg-primary-subtle shadow-card"
                      : "border-border bg-background hover:border-brand-blue/40 hover:shadow-card",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-brand-blue-subtle">
                      <Cpu className="size-4 text-brand-blue" />
                    </span>
                    <span className="rounded-full bg-brand-green-subtle px-2 py-0.5 type-caption font-medium text-brand-green">
                      <span className="mr-1 inline-block size-1.5 rounded-full bg-brand-green"></span>
                      Active
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="type-body-m font-semibold text-foreground">
                      {part?.part_name} Unified Inspection Model
                    </p>
                    <p className="mt-0.5 type-body-s text-muted-foreground">
                      Combined measure & defect v1.0
                    </p>
                  </div>
                </button>
              </div>
            )}
          </SectionCard>
        )}

        {step === 2 && (() => {
          // Bulletproof UI fallback for specs
          let displaySpecs: any[] = specs;
          if (displaySpecs.length === 0 && part?.part_name) {
            // Hardcode the exhaustive fallback directly in UI as a failsafe
            const staticSpecs = [
              // CAPNUT
              { id: "c1", part_id: "part-1", parameter: "OD - Across Flats (hex)", expected_value: 36, tolerance: 0, unit: "mm", notes: "+0 / -0.62" },
              { id: "c2", part_id: "part-1", parameter: "OD - Across Corners (hex max)", expected_value: 39, tolerance: 0, unit: "mm", notes: "" },
              { id: "c3", part_id: "part-1", parameter: "Overall Height", expected_value: 17.5, tolerance: 0, unit: "mm", notes: "+0 / -0.1" },
              { id: "c4", part_id: "part-1", parameter: "ID - Internal Thread", expected_value: 16, tolerance: 0, unit: "mm", notes: "M16 x 1.5 blind end" },
              { id: "c5", part_id: "part-1", parameter: "Bore Step Ø1", expected_value: 17.15, tolerance: 0.20, unit: "mm", notes: "" },
              { id: "c6", part_id: "part-1", parameter: "Bore Step Ø2", expected_value: 14.575, tolerance: 0.075, unit: "mm", notes: "" },
              { id: "c7", part_id: "part-1", parameter: "Bore Step Ø3", expected_value: 10.675, tolerance: 0.075, unit: "mm", notes: "" },
              { id: "c8", part_id: "part-1", parameter: "Bore Step Ø4 (thread minor)", expected_value: 9.575, tolerance: 0.075, unit: "mm", notes: "" },
              { id: "c9", part_id: "part-1", parameter: "Boss / Collar OD (Detail Y)", expected_value: 21.9, tolerance: 0, unit: "mm", notes: "" },
              { id: "c10", part_id: "part-1", parameter: "Boss / Collar ID (Detail Y)", expected_value: 7.8, tolerance: 0, unit: "mm", notes: "" },
              { id: "c11", part_id: "part-1", parameter: "Shoulder OD (Section G-G)", expected_value: 34.7, tolerance: 0, unit: "mm", notes: "" },
              { id: "c12", part_id: "part-1", parameter: "Male Thread Boss Diameter", expected_value: 25.40, tolerance: 0.05, unit: "mm", notes: "" },
              { id: "c13", part_id: "part-1", parameter: "Male Thread", expected_value: 28.57, tolerance: 0, unit: "mm", notes: "1-1/8\"-12 UNF" },
              { id: "c14", part_id: "part-1", parameter: "Small Hole Diameter", expected_value: 4.6, tolerance: 0, unit: "mm", notes: "" },
              // STUD
              { id: "s1", part_id: "part-2", parameter: "Overall Length", expected_value: 38.10, tolerance: 0.8, unit: "mm", notes: "" },
              { id: "s2", part_id: "part-2", parameter: "Metal-End Length", expected_value: 11.60, tolerance: 0.8, unit: "mm", notes: "" },
              { id: "s3", part_id: "part-2", parameter: "Nut-End Thread Length", expected_value: 19.30, tolerance: 0, unit: "mm", notes: "" },
              { id: "s4", part_id: "part-2", parameter: "Shank OD", expected_value: 7.90, tolerance: 0, unit: "mm", notes: "" },
              { id: "s5", part_id: "part-2", parameter: "Thread (both ends)", expected_value: 7.93, tolerance: 0, unit: "mm", notes: "5/16\"-18 UNC 2A" },
              // ADAPTER
              { id: "a1", part_id: "part-3", parameter: "OD - Across Flats (hex)", expected_value: 27.00, tolerance: 0, unit: "mm", notes: "Both sides" },
              { id: "a2", part_id: "part-3", parameter: "Bore / Pilot ID", expected_value: 19.70, tolerance: 0.1, unit: "mm", notes: "" },
              { id: "a3", part_id: "part-3", parameter: "Groove / Step Width", expected_value: 2.10, tolerance: 0.1, unit: "mm", notes: "" },
              { id: "a4", part_id: "part-3", parameter: "Thread (both sides)", expected_value: 22.00, tolerance: 0, unit: "mm", notes: "M22 x 1.5" },
              // PIN
              { id: "p1", part_id: "part-4", parameter: "OD (Outer Diameter ØA)", expected_value: 11.979, tolerance: 0.021, unit: "mm", notes: "" },
              { id: "p2", part_id: "part-4", parameter: "ID (Through-hole ØD - ×2)", expected_value: 3.20, tolerance: 0, unit: "mm", notes: "" },
              { id: "p3", part_id: "part-4", parameter: "Length (L, overall)", expected_value: 87.60, tolerance: 0.20, unit: "mm", notes: "" },
              { id: "p4", part_id: "part-4", parameter: "Length (C, hole centers)", expected_value: 81.20, tolerance: 0.20, unit: "mm", notes: "" },
              { id: "p5", part_id: "part-4", parameter: "Width/Chamfer (B)", expected_value: 3.20, tolerance: 0, unit: "mm", notes: "" },
            ];
            const nameToId: Record<string, string> = { "capnut": "part-1", "stud": "part-2", "adapter": "part-3", "pin": "part-4" };
            const fallbackId = nameToId[part.part_name.toLowerCase().trim()];
            if (fallbackId) {
              displaySpecs = staticSpecs.filter(s => s.part_id === fallbackId);
            }
          }

          return (
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard
                title="Specification"
                subtitle={part ? `Tolerances for ${part.part_name}` : "Tolerances"}
                className="lg:col-span-2"
                bodyClassName="p-0"
              >
                {displaySpecs.length === 0 ? (
                  <p className="px-5 py-12 text-center type-body-m text-muted-foreground">
                    No specification parameters defined for this part.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <Th>Parameter</Th>
                          <Th>Expected</Th>
                          <Th>Tolerance</Th>
                          <Th>Unit</Th>
                          <Th>Notes</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {displaySpecs.map((s) => (
                          <tr key={s.id}>
                            <Td className="font-medium text-foreground">{s.parameter}</Td>
                            <Td className="tabular">{s.expected_value}</Td>
                            <Td className="tabular">{s.tolerance > 0 ? `±${s.tolerance}` : "—"}</Td>
                            <Td>{s.unit}</Td>
                            <Td className="text-muted-foreground">{s.notes || "—"}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>


            <SectionCard title="Reference" subtitle="Part reference imagery">
              <PartImage
                partName={part?.part_name ?? ""}
                refValue={part?.reference_image ?? null}
                alt={part?.part_name ?? "Part reference"}
                className="h-48 w-full rounded-lg object-contain p-2"
              />
            </SectionCard>
          </div>
          );
        })()}

        {step === 3 && (
          <div className="space-y-4">

            {/* ── Backend status bar ──────────────────────────────────────── */}
            <div className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium",
              backendStatus === "ready"    && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
              backendStatus === "demo"     && "border-amber-500/30  bg-amber-500/10  text-amber-400",
              backendStatus === "offline"  && "border-rose-500/30   bg-rose-500/10   text-rose-400",
              backendStatus === "checking" && "border-border bg-muted text-muted-foreground",
            )}>
              {backendStatus === "ready"    && <><Wifi className="size-4" /> Python backend connected — cameras ready</>}
              {backendStatus === "demo"     && <><Wifi className="size-4" /> Python backend connected — DEMO MODE (no cameras)</>}
              {backendStatus === "offline"  && <><WifiOff className="size-4" /> Backend offline — run <code className="mx-1 font-mono text-xs">Wg-backend/start_server.bat</code> first</>}
              {backendStatus === "checking" && <><Loader2 className="size-4 animate-spin" /> Connecting to Python backend…</>}
            </div>

            {/* ── Live camera feed strip ──────────────────────────────────── */}
            <SectionCard
              title="Live Camera Feeds"
              subtitle="Top view (left) · Side view (right) — real-time from Hikrobot GigE cameras"
              action={
                <div className="flex gap-2">
                  <button
                    onClick={() => setFeedMode("measure")}
                    className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                      feedMode === "measure" ? "bg-brand-blue text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >📐 Measure feed</button>
                  <button
                    onClick={() => setFeedMode("inspect")}
                    className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                      feedMode === "inspect" ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >🔍 Inspect feed</button>
                </div>
              }
            >
              {backendStatus !== "offline" ? (
                <img
                  src={feedMode === "measure"
                    ? measureStreamUrl(part?.part_name ?? "capnut")
                    : inspectStreamUrl(part?.part_name ?? "capnut")
                  }
                  alt="Live camera feed — top and side view"
                  className="w-full rounded-xl border border-border object-contain bg-muted"
                  style={{ maxHeight: 320 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="flex h-52 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30">
                  <div className="text-center">
                    <Camera className="mx-auto mb-2 size-10 text-muted-foreground/40" />
                    <p className="type-body-s text-muted-foreground">Camera feed unavailable — backend offline</p>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ── Action buttons ──────────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Measure */}
              <button
                id="btn-capture-measure"
                onClick={handleMeasure}
                disabled={running !== null || backendStatus === "offline"}
                className={cn(
                  "group flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all",
                  measureResult
                    ? measureResult.status === "PASS"
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-rose-500/50 bg-rose-500/10"
                    : "border-border bg-card hover:border-brand-blue/50 hover:bg-brand-blue-subtle",
                  (running !== null || backendStatus === "offline") && "cursor-not-allowed opacity-60",
                )}
              >
                {running === "measure" ? (
                  <Loader2 className="size-10 animate-spin text-brand-blue" />
                ) : measureResult ? (
                  measureResult.status === "PASS"
                    ? <CheckCircle2 className="size-10 text-emerald-400" />
                    : <XCircle className="size-10 text-rose-400" />
                ) : (
                  <Ruler className="size-10 text-brand-blue transition-transform duration-200 group-hover:scale-110" />
                )}
                <div>
                  <p className="type-body-m font-bold text-foreground">📷 Capture & Measure</p>
                  <p className="type-caption text-muted-foreground mt-1">Snapshot → dimensional analysis</p>
                  {measureResult && (
                    <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold",
                      measureResult.status === "PASS" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                    )}>
                      {measureResult.status}
                    </span>
                  )}
                </div>
              </button>

              {/* Inspect */}
              <button
                id="btn-capture-inspect"
                onClick={handleInspect}
                disabled={running !== null || backendStatus === "offline"}
                className={cn(
                  "group flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all",
                  inspectResult
                    ? inspectResult.status === "pass"
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-rose-500/50 bg-rose-500/10"
                    : "border-border bg-card hover:border-rose-500/50 hover:bg-rose-500/5",
                  (running !== null || backendStatus === "offline") && "cursor-not-allowed opacity-60",
                )}
              >
                {running === "inspect" ? (
                  <Loader2 className="size-10 animate-spin text-rose-400" />
                ) : inspectResult ? (
                  inspectResult.status === "pass"
                    ? <CheckCircle2 className="size-10 text-emerald-400" />
                    : <XCircle className="size-10 text-rose-400" />
                ) : (
                  <ScanEye className="size-10 text-rose-400 transition-transform duration-200 group-hover:scale-110" />
                )}
                <div>
                  <p className="type-body-m font-bold text-foreground">🔍 Capture & Inspect</p>
                  <p className="type-caption text-muted-foreground mt-1">Snapshot → YOLO surface defects</p>
                  {inspectResult && (
                    <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold",
                      inspectResult.status === "pass" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                    )}>
                      {inspectResult.status === "pass" ? "NO DEFECTS" : `${inspectResult.defects.length} DEFECT(S)`}
                    </span>
                  )}
                </div>
              </button>

              {/* Run Full Test */}
              <button
                id="btn-run-test"
                onClick={handleRunTest}
                disabled={running !== null || backendStatus === "offline"}
                className={cn(
                  "group flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all",
                  testResult
                    ? testResult.verdict === "ok"
                      ? "border-emerald-500/60 bg-emerald-500/15"
                      : "border-rose-500/60 bg-rose-500/15"
                    : "border-dashed border-brand-blue/50 bg-brand-blue-subtle hover:border-brand-blue hover:bg-brand-blue/10",
                  (running !== null || backendStatus === "offline") && "cursor-not-allowed opacity-60",
                )}
              >
                {running === "test" ? (
                  <Loader2 className="size-10 animate-spin text-brand-blue" />
                ) : testResult ? (
                  testResult.verdict === "ok"
                    ? <CheckCircle2 className="size-10 text-emerald-400" />
                    : <XCircle className="size-10 text-rose-400" />
                ) : (
                  <PlayCircle className="size-10 text-brand-blue transition-transform duration-200 group-hover:scale-110" />
                )}
                <div>
                  <p className="type-body-m font-bold text-foreground">▶ Run Full Test</p>
                  <p className="type-caption text-muted-foreground mt-1">Measure + Inspect → final verdict</p>
                  {testResult && (
                    <span className={cn("mt-2 inline-block rounded-full px-3 py-0.5 text-sm font-bold",
                      testResult.verdict === "ok" ? "bg-emerald-500/25 text-emerald-300" : "bg-rose-500/25 text-rose-300"
                    )}>
                      {testResult.verdict.toUpperCase()}
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* ── Results panels ──────────────────────────────────────────── */}
            <AnimatePresence>

              {/* Measurement results */}
              {measureResult && (
                <motion.div
                  key="measure-results"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                >
                  <SectionCard
                    title="Dimensional Measurement Results"
                    subtitle={`${measureResult.measurements.filter(m=>m.pass).length}/${measureResult.measurements.length} parameters within tolerance · ${measureResult.duration_ms}ms`}
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* Annotated images */}
                      <div className="space-y-2">
                        <p className="type-caption text-muted-foreground">Top View — annotated</p>
                        <img src={`data:image/jpeg;base64,${measureResult.top_annotated_b64}`}
                          alt="Top view measurement" className="w-full rounded-lg border border-border object-contain bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <p className="type-caption text-muted-foreground">Side View — annotated</p>
                        <img src={`data:image/jpeg;base64,${measureResult.side_annotated_b64}`}
                          alt="Side view measurement" className="w-full rounded-lg border border-border object-contain bg-muted" />
                      </div>
                    </div>
                    {/* Table */}
                    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-muted/40">
                            <Th>Parameter</Th><Th>Measured</Th><Th>Expected</Th><Th>Tolerance</Th><Th>Status</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {measureResult.measurements.map((m) => {
                            const dev = Number((m.measured - m.expected).toFixed(4));
                            return (
                              <tr key={m.parameter} className={m.pass ? "" : "bg-rose-500/5"}>
                                <Td className="font-medium">{m.parameter}</Td>
                                <Td className={cn("tabular font-semibold", m.pass ? "text-emerald-400" : "text-rose-400")}>{m.measured} {m.unit}</Td>
                                <Td className="tabular text-muted-foreground">{m.expected} {m.unit}</Td>
                                <Td className="tabular text-muted-foreground">±{m.tolerance} {m.unit}</Td>
                                <Td>{m.pass ? <CheckCircle2 className="size-4 text-emerald-400" /> : <XCircle className="size-4 text-rose-400" />}</Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </motion.div>
              )}

              {/* Inspect results */}
              {inspectResult && (
                <motion.div
                  key="inspect-results"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                >
                  <SectionCard
                    title="Surface Defect Inspection Results"
                    subtitle={inspectResult.status === "pass" ? "No defects detected" : `${inspectResult.defects.length} defect(s) found · ${inspectResult.duration_ms}ms`}
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <p className="type-caption text-muted-foreground">Top View — YOLO annotated</p>
                        <img src={`data:image/jpeg;base64,${inspectResult.top_annotated_b64}`}
                          alt="Top view defect" className="w-full rounded-lg border border-border object-contain bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <p className="type-caption text-muted-foreground">Side View — YOLO annotated</p>
                        <img src={`data:image/jpeg;base64,${inspectResult.side_annotated_b64}`}
                          alt="Side view defect" className="w-full rounded-lg border border-border object-contain bg-muted" />
                      </div>
                    </div>
                    {inspectResult.defects.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {inspectResult.defects.map((d, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2.5">
                            <div>
                              <p className="type-body-m font-semibold text-rose-300">{d.name}</p>
                              <p className="type-caption text-muted-foreground">{d.cam} · Confidence {(d.confidence * 100).toFixed(1)}% · Box [{d.bbox.join(", ")}]</p>
                            </div>
                            <AlertTriangle className="size-5 text-rose-400 shrink-0" />
                          </li>
                        ))}
                      </ul>
                    )}
                    {inspectResult.status === "pass" && (
                      <p className="mt-3 flex items-center gap-2 type-body-m text-emerald-400">
                        <CheckCircle2 className="size-5" /> No surface defects detected on either camera.
                      </p>
                    )}
                  </SectionCard>
                </motion.div>
              )}

              {/* Full test result verdict */}
              {testResult && (
                <motion.div
                  key="test-result"
                  initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                >
                  <div className={cn(
                    "rounded-2xl border-2 p-6 text-center",
                    testResult.verdict === "ok" ? "border-emerald-500/60 bg-emerald-500/10" : "border-rose-500/60 bg-rose-500/10",
                  )}>
                    {testResult.verdict === "ok" ? (
                      <CheckCircle2 className="mx-auto mb-3 size-16 text-emerald-400" />
                    ) : (
                      <XCircle className="mx-auto mb-3 size-16 text-rose-400" />
                    )}
                    <h2 className={cn("text-3xl font-black tracking-tight",
                      testResult.verdict === "ok" ? "text-emerald-300" : "text-rose-300"
                    )}>
                      {testResult.verdict === "ok" ? "✅ PART ACCEPTED" : "❌ PART REJECTED"}
                    </h2>
                    <p className="mt-2 type-body-m text-muted-foreground">
                      Measurement: <span className={testResult.measure_status === "PASS" ? "text-emerald-400" : "text-rose-400"}>{testResult.measure_status}</span>
                      {" · "}
                      Defects: <span className={testResult.inspect_status === "pass" ? "text-emerald-400" : "text-rose-400"}>{testResult.inspect_status === "pass" ? "None" : `${testResult.defects.length} found`}</span>
                      {" · "}
                      <span className="text-muted-foreground">{testResult.duration_ms}ms</span>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Inspection record ───────────────────────────────────────── */}
            <SectionCard title="Inspection record" subtitle="Context saved with this result">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="area">Area / line</Label>
                  <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shift">Shift</Label>
                  <Select value={shift} onValueChange={setShift}>
                    <SelectTrigger id="shift"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["A", "B", "C"].map((s) => (
                        <SelectItem key={s} value={s}>Shift {s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Final verdict</Label>
                  <div className="flex h-9 items-center">
                    {finalStatus ? (
                      <StatusBadge status={finalStatus} />
                    ) : (
                      <span className="type-body-s text-muted-foreground">Run Full Test to get a verdict</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="remarks">Remarks</Label>
                  <Textarea
                    id="remarks"
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Operator notes, rework instructions, batch reference…"
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || running !== null}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={!finalStatus || running !== null}>
              {running === "save" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              Save & generate report
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="surface-card flex flex-wrap items-center gap-3 p-4">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={s.label} className="flex flex-1 items-center gap-3">
            <motion.span
              animate={{ scale: active ? 1.05 : 1 }}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border",
                done && "border-success/30 bg-success/10 text-success",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "border-border bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : <s.icon className="size-4" />}
            </motion.span>
            <div className="min-w-0">
              <p className="type-caption text-muted-foreground">Step {i + 1}</p>
              <p
                className={cn(
                  "type-body-m truncate font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 type-body-m", className)}>{children}</td>;
}
