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
  Info,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  { label: "Select Part", icon: ScanLine },
  { label: "Capture & Inspect", icon: Camera },
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

  // Captured runs list (combining both measure and inspect)
  const [testRuns, setTestRuns] = useState<RunTestResult[]>([]);
  const [running, setRunning] = useState<"inspect" | "save" | null>(null);

  // Selected run index for detail view
  const [selectedRunIdx, setSelectedRunIdx] = useState<number>(0);

  // Toggle for images in detail view: "measure" or "inspect" (defect)
  const [detailImageMode, setDetailImageMode] = useState<"measure" | "inspect">("measure");

  // Live feed stream mode (measure or inspect)
  const [feedMode, setFeedMode] = useState<"measure" | "inspect">("measure");

  // Dialog state for specifications popup
  const [activeSpecPart, setActiveSpecPart] = useState<any | null>(null);
  const [isSpecDialogOpen, setIsSpecDialogOpen] = useState(false);

  const { data: parts = [], error: partsError, isLoading: partsLoading } = useParts();
  const part = parts.find((p) => p.id === partId);

  const { data: models = [], error: modelsError, isLoading: modelsLoading } = useModels(undefined, part?.part_name);
  const { data: specs = [], error: specsError, isLoading: specsLoading } = useSpecifications(partId || undefined, part?.part_name);

  // Auto-select model ID in background
  useEffect(() => {
    if (partId && models.length > 0) {
      const matchingModel = models.find((m) => m.part_id === partId);
      if (matchingModel) {
        setModelId(matchingModel.id);
      } else {
        setModelId(`${partId}-unified`);
      }
    }
  }, [partId, models]);

  // Check backend health when entering step 1
  useEffect(() => {
    if (step !== 1) return;
    setBackendStatus("checking");
    checkBackendHealth().then(setBackendStatus);
  }, [step]);

  // Reset results if part changes
  useEffect(() => {
    setTestRuns([]);
    setSelectedRunIdx(0);
  }, [partId]);

  async function handleInspectPart() {
    if (!part) return;
    if (testRuns.length >= 5) {
      toast.error("Maximum 5 captures reached for this inspection.");
      return;
    }
    setRunning("inspect");
    try {
      const res = await runFullTest(part.part_name);
      setTestRuns((prev) => {
        const next = [...prev, res];
        setSelectedRunIdx(next.length - 1); // auto-select the latest run
        return next;
      });
      toast.success(`Check ${testRuns.length + 1} complete.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Inspection failed");
    } finally {
      setRunning(null);
    }
  }

  // Compile final results across all captured runs
  const allMeasurements = useMemo(() => testRuns.flatMap((r) => r.measurements), [testRuns]);
  const allDefects = useMemo(() => testRuns.flatMap((r) => r.defects), [testRuns]);

  const allMeasuresPass = useMemo(() => 
    allMeasurements.length > 0 ? allMeasurements.every((m) => m.pass) : true
  , [allMeasurements]);
  
  const hasDefects = useMemo(() => allDefects.length > 0, [allDefects]);
  
  const finalStatus = useMemo(() => 
    testRuns.length > 0 ? (allMeasuresPass && !hasDefects ? "ok" : "reject") : null
  , [testRuns, allMeasuresPass, hasDefects]);

  const canNext = [Boolean(partId), false][step];

  const activeSpecs = useMemo(() => {
    if (!activeSpecPart) return [];
    const partSpecs = specs.filter((s) => s.part_id === activeSpecPart.id);
    if (partSpecs.length > 0) return partSpecs;

    const staticSpecs = [
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
      { id: "s1", part_id: "part-2", parameter: "Overall Length", expected_value: 38.10, tolerance: 0.8, unit: "mm", notes: "" },
      { id: "s2", part_id: "part-2", parameter: "Metal-End Length", expected_value: 11.60, tolerance: 0.8, unit: "mm", notes: "" },
      { id: "s3", part_id: "part-2", parameter: "Nut-End Thread Length", expected_value: 19.30, tolerance: 0, unit: "mm", notes: "" },
      { id: "s4", part_id: "part-2", parameter: "Shank OD", expected_value: 7.90, tolerance: 0, unit: "mm", notes: "" },
      { id: "s5", part_id: "part-2", parameter: "Thread (both ends)", expected_value: 7.93, tolerance: 0, unit: "mm", notes: "5/16\"-18 UNC 2A" },
      { id: "a1", part_id: "part-3", parameter: "OD - Across Flats (hex)", expected_value: 27.00, tolerance: 0, unit: "mm", notes: "Both sides" },
      { id: "a2", part_id: "part-3", parameter: "Bore / Pilot ID", expected_value: 19.70, tolerance: 0.1, unit: "mm", notes: "" },
      { id: "a3", part_id: "part-3", parameter: "Groove / Step Width", expected_value: 2.10, tolerance: 0.1, unit: "mm", notes: "" },
      { id: "a4", part_id: "part-3", parameter: "Thread (both sides)", expected_value: 22.00, tolerance: 0, unit: "mm", notes: "M22 x 1.5" },
      { id: "p1", part_id: "part-4", parameter: "OD (Outer Diameter ØA)", expected_value: 11.979, tolerance: 0.021, unit: "mm", notes: "" },
      { id: "p2", part_id: "part-4", parameter: "ID (Through-hole ØD - ×2)", expected_value: 3.20, tolerance: 0, unit: "mm", notes: "" },
      { id: "p3", part_id: "part-4", parameter: "Length (L, overall)", expected_value: 87.60, tolerance: 0.20, unit: "mm", notes: "" },
      { id: "p4", part_id: "part-4", parameter: "Length (C, hole centers)", expected_value: 81.20, tolerance: 0.20, unit: "mm", notes: "" },
      { id: "p5", part_id: "part-4", parameter: "Width/Chamfer (B)", expected_value: 3.20, tolerance: 0, unit: "mm", notes: "" },
    ];
    const nameToId: Record<string, string> = { "capnut": "part-1", "stud": "part-2", "adapter": "part-3", "pin": "part-4" };
    const fallbackId = nameToId[activeSpecPart.part_name.toLowerCase().trim()];
    if (fallbackId) {
      return staticSpecs.filter(s => s.part_id === fallbackId);
    }
    return [];
  }, [activeSpecPart, specs]);

  async function handleSave() {
    if (!user || !finalStatus || testRuns.length === 0) return;
    setRunning("save");
    try {
      const now = new Date();
      const dbModelId = models.find((m) => m.id === modelId)?.id || null;
      const dbPartId = partId && !partId.startsWith("part-") ? partId : null;

      const totalDurationMs = testRuns.reduce((acc, r) => acc + r.duration_ms, 0);

      const { data: inspection, error } = await supabase
        .from("inspections")
        .insert({
          inspector_id: user.id,
          part_id: dbPartId,
          model_id: dbModelId,
          inspection_date: now.toISOString().slice(0, 10),
          inspection_time: now.toTimeString().slice(0, 8),
          shift,
          area,
          duration_seconds: Math.round(totalDurationMs / 1000),
          status: finalStatus,
          remarks,
        })
        .select("id, inspection_number")
        .single();
      if (error) throw error;

      const inspectionId = inspection.id as string;

      if (allMeasurements.length) {
        await supabase.from("measurement_results").insert(
          allMeasurements.map((m) => ({
            inspection_id: inspectionId,
            ...toSupabaseMeasurement(m),
          })),
        );
      }
      if (allDefects.length) {
        await supabase.from("defect_results").insert(
          allDefects.map((d) => ({
            inspection_id: inspectionId,
            ...toSupabaseDefect(d),
          })),
        );
      }

      // Upload captured top and side views from all runs
      const imagesToUpload: Array<{ b64: string; type: string }> = [];
      testRuns.forEach((run, idx) => {
        if (run.top_measure_b64) {
          imagesToUpload.push({ b64: run.top_measure_b64, type: `measurement_top_${idx + 1}` });
        }
        if (run.side_measure_b64) {
          imagesToUpload.push({ b64: run.side_measure_b64, type: `measurement_side_${idx + 1}` });
        }
        if (run.top_inspect_b64) {
          imagesToUpload.push({ b64: run.top_inspect_b64, type: `defect_top_${idx + 1}` });
        }
        if (run.side_inspect_b64) {
          imagesToUpload.push({ b64: run.side_inspect_b64, type: `defect_side_${idx + 1}` });
        }
      });

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
    } catch (e: any) {
      console.error("Save error details:", e);
      toast.error(e?.message || (typeof e === "string" ? e : "Could not save inspection"));
    } finally {
      setRunning(null);
    }
  }

  return (
    <AppShell title="New Inspection" subtitle="Guided measurement and surface check workflow">
      <div className="space-y-5">
        <Stepper step={step} />

        {step === 0 && (
          <SectionCard title="Select part" subtitle="Choose the part family being inspected">
            {partsLoading ? (
              <p className="type-body-m text-muted-foreground animate-pulse py-6">Loading part families from database...</p>
            ) : partsError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                <p className="type-body-m font-semibold">Failed to load parts:</p>
                <p className="type-body-s mt-1 font-mono">{(partsError as Error)?.message || "Database connection error"}</p>
              </div>
            ) : parts.length === 0 ? (
              <p className="type-body-m text-muted-foreground">
                No parts configured yet. Ask an inspection manager to add parts first.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {parts.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "group flex flex-col justify-between rounded-xl border p-4 transition-all relative",
                      partId === p.id
                        ? "border-primary bg-primary-subtle shadow-card"
                        : "border-border bg-background hover:border-brand-blue/40 hover:shadow-card",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setPartId(p.id)}
                      className="flex gap-4 text-left w-full h-full"
                    >
                      <PartImage
                        partName={p.part_name}
                        refValue={p.reference_image}
                        alt={p.part_name}
                        usePhoto={true}
                        className="size-16 shrink-0 rounded-lg object-contain p-1"
                      />
                      <div className="min-w-0 pr-8">
                        <p className="type-body-m font-semibold text-foreground">{p.part_name}</p>
                        <p className="type-body-s line-clamp-2 text-muted-foreground mt-0.5">
                          {p.description || "No description"}
                        </p>
                      </div>
                      {partId === p.id && <Check className="absolute top-4 right-4 size-5 shrink-0 text-primary" />}
                    </button>
                    <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-semibold hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSpecPart(p);
                          setIsSpecDialogOpen(true);
                        }}
                      >
                        <Info className="mr-1 size-3.5" />
                        Specifications
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {step === 1 && (
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
              subtitle="Top view (left) · Side view (right) — real-time feed"
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
                  alt="Live camera feed"
                  className="w-full rounded-xl border border-border object-contain bg-muted"
                  style={{ maxHeight: 320 }}
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

            {/* ── Action capture panel ────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 items-center">
              <button
                id="btn-inspect-part"
                onClick={handleInspectPart}
                disabled={running !== null || backendStatus === "offline" || testRuns.length >= 5}
                className={cn(
                  "group flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all min-h-40 justify-center",
                  testRuns.length > 0
                    ? finalStatus === "ok"
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-rose-500/50 bg-rose-500/10"
                    : "border-border bg-card hover:border-brand-blue/50 hover:bg-brand-blue-subtle",
                  (running !== null || backendStatus === "offline" || testRuns.length >= 5) && "cursor-not-allowed opacity-60",
                )}
              >
                {running === "inspect" ? (
                  <Loader2 className="size-10 animate-spin text-brand-blue" />
                ) : (
                  <Camera className="size-10 text-brand-blue transition-transform duration-200 group-hover:scale-110" />
                )}
                <div>
                  <p className="type-body-m font-bold text-foreground">📷 Inspect Part</p>
                  <p className="type-caption text-muted-foreground mt-1">
                    {testRuns.length > 0
                      ? `Captured: ${testRuns.length} / 5 snapshots`
                      : "Capture snapshot to measure and inspect"
                    }
                  </p>
                </div>
              </button>

              {/* Status and runs selector */}
              {testRuns.length > 0 && (
                <div className="surface-card rounded-2xl p-6 min-h-40 flex flex-col justify-between">
                  <div>
                    <h4 className="type-body-m font-bold text-foreground">Capture check runs</h4>
                    <p className="type-caption text-muted-foreground mt-0.5">Toggle between saved images to view details</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {testRuns.map((run, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedRunIdx(idx)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all flex items-center gap-1.5",
                          selectedRunIdx === idx
                            ? "bg-brand-blue border-brand-blue text-white shadow-sm"
                            : "bg-background border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Run {idx + 1}
                        {run.verdict === "ok" ? (
                          <span className="size-2 rounded-full bg-emerald-400" />
                        ) : (
                          <span className="size-2 rounded-full bg-rose-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Results panels ──────────────────────────────────────────── */}
            <AnimatePresence>
              {testRuns.length > 0 && (() => {
                const selectedRun = testRuns[selectedRunIdx];
                if (!selectedRun) return null;

                const activeMeasurements = selectedRun.measurements;
                const activeDefects = selectedRun.defects;
                const passMeasurements = activeMeasurements.every((m) => m.pass);
                const hasDefects = activeDefects.length > 0;
                const runVerdict = (passMeasurements && !hasDefects) ? "ok" : "reject";

                return (
                  <motion.div
                    key={`run-${selectedRunIdx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Run Verdict Alert */}
                    <div className={cn(
                      "rounded-2xl border-2 p-5 text-center transition-all",
                      runVerdict === "ok" ? "border-emerald-500/50 bg-emerald-500/10" : "border-rose-500/50 bg-rose-500/10",
                    )}>
                      <div className="flex items-center justify-center gap-3">
                        {runVerdict === "ok" ? (
                          <CheckCircle2 className="size-8 text-emerald-400" />
                        ) : (
                          <XCircle className="size-8 text-rose-400" />
                        )}
                        <h3 className={cn("text-xl font-bold tracking-tight",
                          runVerdict === "ok" ? "text-emerald-300" : "text-rose-300"
                        )}>
                          Run {selectedRunIdx + 1} Verdict: {runVerdict === "ok" ? "PART ACCEPTED" : "PART REJECTED"}
                        </h3>
                      </div>
                    </div>

                    {/* Run Details Panel */}
                    <SectionCard
                      title={`Run ${selectedRunIdx + 1} Analysis`}
                      subtitle={`Duration: ${selectedRun.duration_ms}ms · Top and side views`}
                      action={
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailImageMode("measure")}
                            className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border",
                              detailImageMode === "measure" 
                                ? "bg-brand-blue border-brand-blue text-white" 
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            )}
                          >
                            📐 Measurements
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailImageMode("inspect")}
                            className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border",
                              detailImageMode === "inspect" 
                                ? "bg-rose-500 border-rose-500 text-white" 
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            )}
                          >
                            🔍 Defect Check
                          </button>
                        </div>
                      }
                    >
                      <div className="grid gap-4 lg:grid-cols-2">
                        {/* Snapshots */}
                        <div className="space-y-2">
                          <p className="type-caption text-muted-foreground">Top View — annotated</p>
                          <img 
                            src={`data:image/jpeg;base64,${detailImageMode === "measure" ? selectedRun.top_measure_b64 : selectedRun.top_inspect_b64}`}
                            alt="Top View snapshot" 
                            className="w-full rounded-lg border border-border object-contain bg-muted" 
                            style={{ maxHeight: 280 }}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="type-caption text-muted-foreground">Side View — annotated</p>
                          <img 
                            src={`data:image/jpeg;base64,${detailImageMode === "measure" ? selectedRun.side_measure_b64 : selectedRun.side_inspect_b64}`}
                            alt="Side View snapshot" 
                            className="w-full rounded-lg border border-border object-contain bg-muted" 
                            style={{ maxHeight: 280 }}
                          />
                        </div>
                      </div>

                      {/* Measurements Table & Defects List */}
                      <div className="grid gap-6 mt-6 lg:grid-cols-3">
                        {/* Measurements table */}
                        <div className="lg:col-span-2 space-y-2">
                          <h4 className="type-body-m font-bold text-foreground">Measurement parameters</h4>
                          <div className="overflow-x-auto rounded-xl border border-border">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border bg-muted/40">
                                  <Th>Parameter</Th><Th>Measured</Th><Th>Expected</Th><Th>Tolerance</Th><Th>Status</Th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {activeMeasurements.map((m) => (
                                  <tr key={m.parameter} className={m.pass ? "" : "bg-rose-500/5"}>
                                    <Td className="font-medium">{m.parameter}</Td>
                                    <Td className={cn("tabular font-semibold", m.pass ? "text-emerald-400" : "text-rose-400")}>
                                      {m.measured} {m.unit}
                                    </Td>
                                    <Td className="tabular text-muted-foreground">{m.expected} {m.unit}</Td>
                                    <Td className="tabular text-muted-foreground">±{m.tolerance} {m.unit}</Td>
                                    <Td>{m.pass ? <CheckCircle2 className="size-4 text-emerald-400" /> : <XCircle className="size-4 text-rose-400" />}</Td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Defects list */}
                        <div className="space-y-2">
                          <h4 className="type-body-m font-bold text-foreground">Surface defect inspection</h4>
                          {activeDefects.length > 0 ? (
                            <ul className="space-y-2">
                              {activeDefects.map((d, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                                  <div>
                                    <p className="type-body-m font-semibold text-rose-300">{d.name}</p>
                                    <p className="type-caption text-muted-foreground">{d.cam} · Conf {(d.confidence * 100).toFixed(0)}%</p>
                                  </div>
                                  <AlertTriangle className="size-4 text-rose-400 shrink-0" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
                              <p className="text-center type-body-s text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 className="size-4" /> No defects detected
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </SectionCard>
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* ── Combined inspection verdict panel ──────────────────────── */}
            {testRuns.length > 0 && (
              <div className={cn(
                "rounded-2xl border-2 p-6 text-center mt-4",
                finalStatus === "ok" ? "border-emerald-500/60 bg-emerald-500/15" : "border-rose-500/60 bg-rose-500/15",
              )}>
                {finalStatus === "ok" ? (
                  <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald-400" />
                ) : (
                  <XCircle className="mx-auto mb-3 size-12 text-rose-400" />
                )}
                <h2 className={cn("text-2xl font-black tracking-tight",
                  finalStatus === "ok" ? "text-emerald-300" : "text-rose-300"
                )}>
                  {finalStatus === "ok" ? "ACCEPT BATCH" : "REJECT BATCH"}
                </h2>
                <p className="mt-1 type-body-s text-muted-foreground">
                  Measurements: <span className={allMeasuresPass ? "text-emerald-400" : "text-rose-400"}>{allMeasuresPass ? "ALL PASS" : "FAIL ENCOUNTERED"}</span>
                  {" · "}
                  Defects: <span className={!hasDefects ? "text-emerald-400" : "text-rose-400"}>{!hasDefects ? "NONE DETECTED" : `${allDefects.length} FOUND`}</span>
                  {" · "}
                  <span className="text-muted-foreground">{testRuns.reduce((acc, r) => acc + r.duration_ms, 0)}ms total</span>
                </p>
              </div>
            )}

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
                      <span className="type-body-s text-muted-foreground">Perform snapshot inspect to get a verdict</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="remarks">Remarks / Notes</Label>
                  <Textarea
                    id="remarks"
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Operator notes, rework instructions, batch reference…"
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {/* Specifications Information Dialog */}
        <Dialog open={isSpecDialogOpen} onOpenChange={setIsSpecDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Specifications: {activeSpecPart?.part_name}</DialogTitle>
              <DialogDescription>Reference standards and tolerance levels</DialogDescription>
            </DialogHeader>
            {activeSpecs.length === 0 ? (
              <p className="py-6 text-center type-body-m text-muted-foreground">
                No specification parameters defined for this part family.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
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
                    {activeSpecs.map((s) => (
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
          </DialogContent>
        </Dialog>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || running !== null}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {step < 1 ? (
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
