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
  Scan,
  ScanEye,
  ScanLine,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PartImage } from "@/components/common/PartImage";
import { LatencyPanel } from "@/components/common/LatencyPanel";
import { ModelAccuracyPanel } from "@/components/common/ModelAccuracyPanel";
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
  topStreamUrl,
  sideStreamUrl,
  topCaptureUrl,
  sideCaptureUrl,
  runFullTest,
  runBatchTest,
  processPair,
  toSupabaseMeasurement,
  toSupabaseDefect,
  type ModelAccuracy,
  type RunTestResult,
  type RunBatchTestResult,
} from "@/services/inspectionApi";

type SearchParams = {
  part?: string | undefined;
};

export const Route = createFileRoute("/_authenticated/inspection/new")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    part: typeof search["part"] === "string" ? (search["part"] as string) : undefined,
  }),
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
  const { part: searchPart } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isManager } = useAuth();

  const [step, setStep] = useState(0);
  const [partId, setPartId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [area, setArea] = useState("Line A");
  const [shift, setShift] = useState("A");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (isManager) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isManager, navigate]);

  // Backend connection status
  const [backendStatus, setBackendStatus] = useState<"ready" | "demo" | "offline" | "checking">("checking");

  // Captured runs list (combining both measure and inspect)
  const [testRuns, setTestRuns] = useState<RunTestResult[]>([]);
  const [running, setRunning] = useState<"inspect" | "save" | null>(null);

  // Session-level accuracy tracking
  const [sessionAccuracy, setSessionAccuracy] = useState<ModelAccuracy>({
    top_conf: 0, side_conf: 0, avg_conf: 0,
  });

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

  // Auto-select part from URL query param (e.g. from Dashboard Inspect button) and jump straight to step 1
  useEffect(() => {
    if (!searchPart || parts.length === 0) return;
    const match = parts.find(
      (p) =>
        p.id === searchPart ||
        p.part_name.toLowerCase().replace(/[^a-z0-9]/g, "") === searchPart.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        p.part_name.toLowerCase().includes(searchPart.toLowerCase()) ||
        searchPart.toLowerCase().includes(p.part_name.toLowerCase())
    );
    if (match) {
      setPartId(match.id);
      setStep(1); // Jump directly to camera inspection feed!
    }
  }, [searchPart, parts]);

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

  // Independent captured snapshot states (max 5 for Top, max 5 for Side)
  interface SnapshotItem {
    id: string;
    timestamp: string;
    preview: string;
  }
  const [topSnapshots, setTopSnapshots] = useState<SnapshotItem[]>([]);
  const [sideSnapshots, setSideSnapshots] = useState<SnapshotItem[]>([]);
  const [batchResult, setBatchResult] = useState<RunBatchTestResult | null>(null);

  // Reset results if part changes
  useEffect(() => {
    setTestRuns([]);
    setSelectedRunIdx(0);
    setTopSnapshots([]);
    setSideSnapshots([]);
    setBatchResult(null);
  }, [partId]);

  async function handleCaptureSnapshot() {
    const ts = Date.now();
    const currentPairCount = Math.max(topSnapshots.length, sideSnapshots.length);
    const nextPairIndex = currentPairCount + 1;

    const canCaptureTop = topSnapshots.length < 5;
    const canCaptureSide = sideSnapshots.length < 5;

    if (!canCaptureTop && !canCaptureSide) {
      toast.error("Maximum limit of 5 snapshot pairs (10 images total) reached. Delete an image to capture more.");
      return;
    }

    const pName = part?.part_name ?? "capnut";

    // Trigger AI background pre-inference asynchronously (no delay or UI block)
    processPair(pName, nextPairIndex).catch((err) => {
      console.warn(`Pair #${nextPairIndex} background pre-inference status:`, err);
    });

    if (canCaptureTop) {
      try {
        const res = await fetch(topCaptureUrl(pName) + `?t=${ts}`);
        if (res.ok) {
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result as string;
            setTopSnapshots((prev) => [
              ...prev,
              { id: `top-${ts}`, timestamp: new Date().toLocaleTimeString(), preview: b64 }
            ]);
          };
          reader.readAsDataURL(blob);
        }
      } catch (err) {
        console.error("Failed to capture top snapshot:", err);
      }
    }

    if (canCaptureSide) {
      try {
        const res = await fetch(sideCaptureUrl(pName) + `?t=${ts}`);
        if (res.ok) {
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result as string;
            setSideSnapshots((prev) => [
              ...prev,
              { id: `side-${ts}`, timestamp: new Date().toLocaleTimeString(), preview: b64 }
            ]);
          };
          reader.readAsDataURL(blob);
        }
      } catch (err) {
        console.error("Failed to capture side snapshot:", err);
      }
    }

    toast.success("Part captured", { duration: 1000 });
  }

  function removeTopSnapshot(id: string) {
    setTopSnapshots((prev) => prev.filter((item) => item.id !== id));
    toast.info("Snapshot removed", { duration: 1000 });
  }

  function removeSideSnapshot(id: string) {
    setSideSnapshots((prev) => prev.filter((item) => item.id !== id));
    toast.info("Snapshot removed", { duration: 1000 });
  }

  function clearTopSnapshots() {
    setTopSnapshots([]);
    toast.info("Top snapshots cleared", { duration: 1000 });
  }

  function clearSideSnapshots() {
    setSideSnapshots([]);
    toast.info("Side snapshots cleared", { duration: 1000 });
  }

  function clearAllSnapshots() {
    setTopSnapshots([]);
    setSideSnapshots([]);
    setBatchResult(null);
    toast.info("All snapshots cleared", { duration: 1000 });
  }

  async function handleInspectPart() {
    if (!part) return;
    const totalPairs = Math.max(topSnapshots.length, sideSnapshots.length);
    if (totalPairs === 0) {
      toast.error("Please capture at least 1 image before running inspection.", { duration: 1500 });
      return;
    }
    setRunning("inspect");
    try {
      const bRes = await runBatchTest(part.part_name, totalPairs);
      setBatchResult(bRes);
      toast.success("Inspected", { duration: 1000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inspection failed", { duration: 1500 });
    } finally {
      setRunning(null);
    }
  }

  const snapshotEntries = useMemo(() => {
    return testRuns.flatMap((run, runIndex) => {
      const entries: Array<{ id: string; runIndex: number; camera: "top" | "side"; preview: string }> = [];

      if (run.top_measure_b64) {
        entries.push({
          id: `run-${runIndex}-top-measure`,
          runIndex,
          camera: "top",
          preview: `data:image/jpeg;base64,${run.top_measure_b64}`,
        });
      }
      if (run.side_measure_b64) {
        entries.push({
          id: `run-${runIndex}-side-measure`,
          runIndex,
          camera: "side",
          preview: `data:image/jpeg;base64,${run.side_measure_b64}`,
        });
      }
      if (run.top_inspect_b64) {
        entries.push({
          id: `run-${runIndex}-top-inspect`,
          runIndex,
          camera: "top",
          preview: `data:image/jpeg;base64,${run.top_inspect_b64}`,
        });
      }
      if (run.side_inspect_b64) {
        entries.push({
          id: `run-${runIndex}-side-inspect`,
          runIndex,
          camera: "side",
          preview: `data:image/jpeg;base64,${run.side_inspect_b64}`,
        });
      }

      return entries;
    });
  }, [testRuns]);

  const totalCapturedCount = snapshotEntries.length;

  function removeSnapshot(id: string) {
    const target = snapshotEntries.find((entry) => entry.id === id);
    if (!target) return;

    setTestRuns((prev) =>
      prev.map((run, runIndex) => {
        if (runIndex !== target.runIndex) return run;

        const next = { ...run };

        if (target.camera === "top") {
          if (id.endsWith("-top-measure")) next.top_measure_b64 = "";
          if (id.endsWith("-top-inspect")) next.top_inspect_b64 = "";
        }

        if (target.camera === "side") {
          if (id.endsWith("-side-measure")) next.side_measure_b64 = "";
          if (id.endsWith("-side-inspect")) next.side_inspect_b64 = "";
        }

        return next;
      }),
    );
  }

  function handleVerifyInspection() {
    if (totalCapturedCount === 0) {
      toast.error("Capture at least one image before verifying the inspection.");
      return;
    }

    toast.success("Inspection verified.");
  }

  // Compile final results across all captured runs
  const allMeasurements = useMemo(() => testRuns.flatMap((r) => r.measurements), [testRuns]);
  const allDefects = useMemo(() => testRuns.flatMap((r) => r.defects), [testRuns]);

  const allMeasuresPass = useMemo(() => 
    allMeasurements.length > 0 ? allMeasurements.every((m) => m.pass) : true
  , [allMeasurements]);
  
  const hasDefects = useMemo(() => allDefects.length > 0, [allDefects]);
  
  const finalStatus = useMemo(() => {
    if (batchResult) return batchResult.verdict;
    if (testRuns.length > 0) return allMeasuresPass && !hasDefects ? "ok" : "reject";
    return null;
  }, [batchResult, testRuns, allMeasuresPass, hasDefects]);

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
    if (!user || !finalStatus || (!batchResult && testRuns.length === 0)) return;
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

      const finalMeasurements = (batchResult && batchResult.measurements.length > 0)
        ? batchResult.measurements
        : allMeasurements;

      const finalDefects = (batchResult && batchResult.defects.length > 0)
        ? batchResult.defects
        : allDefects;

      if (finalMeasurements.length) {
        await supabase.from("measurement_results").insert(
          finalMeasurements.map((m) => ({
            inspection_id: inspectionId,
            ...toSupabaseMeasurement(m),
          })),
        );
      }
      if (finalDefects.length) {
        await supabase.from("defect_results").insert(
          finalDefects.map((d) => ({
            inspection_id: inspectionId,
            ...toSupabaseDefect(d),
          })),
        );
      }

      // Upload captured top and side views from all runs
      const imagesToUpload: Array<{ b64: string; type: string }> = [];
      if (batchResult && batchResult.annotated_frames.length > 0) {
        batchResult.annotated_frames.forEach((pair) => {
          if (pair.top_measure_b64) {
            imagesToUpload.push({ b64: pair.top_measure_b64, type: `pair_${pair.pair_index}_top_measure` });
          }
          if (pair.side_measure_b64) {
            imagesToUpload.push({ b64: pair.side_measure_b64, type: `pair_${pair.pair_index}_side_measure` });
          }
          if (pair.top_inspect_b64) {
            imagesToUpload.push({ b64: pair.top_inspect_b64, type: `pair_${pair.pair_index}_top_inspect` });
          }
          if (pair.side_inspect_b64) {
            imagesToUpload.push({ b64: pair.side_inspect_b64, type: `pair_${pair.pair_index}_side_inspect` });
          }
        });
      } else {
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
      }

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
                      onClick={() => {
                        setPartId(p.id);
                        setStep(1);
                      }}
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
          <div className="space-y-5">
            {/* Section 1: Live Inspection Camera (Top full-width row) */}
            <SectionCard
              title="Live inspection Camera"
              subtitle="CAM 1 / Top view • CAM 2 / Side view"
              action={
                <div className="flex items-center gap-3">
                  <button
                    id="btn-capture-image"
                    onClick={handleCaptureSnapshot}
                    disabled={backendStatus === "offline" || (topSnapshots.length >= 5 && sideSnapshots.length >= 5)}
                    className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-2"
                  >
                    <Camera className="size-4" />
                    Capture Image (Top: {topSnapshots.length}/5, Side: {sideSnapshots.length}/5)
                  </button>
                  <button
                    id="btn-inspect-part"
                    onClick={handleInspectPart}
                    disabled={running !== null || backendStatus === "offline" || (topSnapshots.length === 0 && sideSnapshots.length === 0)}
                    className="rounded-xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-2"
                  >
                    {running === "inspect" ? <Loader2 className="size-4 animate-spin" /> : <Scan className="size-4" />}
                    Inspect ({topSnapshots.length + sideSnapshots.length} image{topSnapshots.length + sideSnapshots.length === 1 ? "" : "s"})
                  </button>
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: "CAM 1 / TOP VIEW", url: topStreamUrl(part?.part_name ?? "capnut") },
                  { label: "CAM 2 / SIDE VIEW", url: sideStreamUrl(part?.part_name ?? "capnut") },
                ].map((camera) => (
                  <div
                    key={camera.label}
                    className="relative h-[280px] sm:h-[320px] w-full overflow-hidden rounded-xl border border-border bg-slate-950 flex items-center justify-center shadow-inner"
                  >
                    {backendStatus !== "offline" ? (
                      <img
                        src={camera.url}
                        alt={`${camera.label} live camera feed`}
                        className="h-full aspect-square max-w-full object-contain bg-slate-950"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center border border-dashed border-border bg-muted/30">
                        <div className="text-center p-4">
                          <Camera className="mx-auto mb-2 size-10 text-muted-foreground/40" />
                          <p className="type-body-s text-muted-foreground">Camera feed unavailable — backend offline</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-x-3 bottom-3 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur-sm">
                      {camera.label}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Section 2: Captured Snapshots (Middle full-width row) */}
            <SectionCard
              title="Captured Snapshots"
              subtitle="Row 1: CAM 1 (Top) • Row 2: CAM 2 (Side)"
              action={
                (topSnapshots.length > 0 || sideSnapshots.length > 0) && (
                  <button
                    type="button"
                    onClick={clearAllSnapshots}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-500 transition-colors hover:bg-rose-500/20"
                  >
                    <Trash2 className="size-3.5" />
                    Clear All
                  </button>
                )
              }
            >
              <div className="space-y-4">
                {/* Row 1: CAM 1 Top View Snapshots */}
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-foreground">CAM 1 (TOP)</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {topSnapshots.length} / 5 images
                      </span>
                      {topSnapshots.length > 0 && (
                        <button
                          type="button"
                          onClick={clearTopSnapshots}
                          className="flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
                        >
                          <Trash2 className="size-3" />
                          Clear Top
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {topSnapshots.length === 0 ? (
                      <div className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                        No top-view snapshots captured yet
                      </div>
                    ) : (
                      topSnapshots.map((item, index) => (
                        <div key={item.id} className="group relative aspect-square h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-black">
                          <img src={item.preview} alt={`Top snapshot ${index + 1}`} className="size-full object-contain bg-black" />
                          <div className="absolute left-1 bottom-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-mono text-white">
                            #{index + 1}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTopSnapshot(item.id)}
                            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-rose-600 text-white shadow transition-opacity hover:bg-rose-700"
                            aria-label="Remove top snapshot"
                          >
                            <XCircle className="size-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Row 2: CAM 2 Side View Snapshots */}
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-foreground">CAM 2 (SIDE)</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {sideSnapshots.length} / 5 images
                      </span>
                      {sideSnapshots.length > 0 && (
                        <button
                          type="button"
                          onClick={clearSideSnapshots}
                          className="flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
                        >
                          <Trash2 className="size-3" />
                          Clear Side
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {sideSnapshots.length === 0 ? (
                      <div className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                        No side-view snapshots captured yet
                      </div>
                    ) : (
                      sideSnapshots.map((item, index) => (
                        <div key={item.id} className="group relative aspect-square h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-black">
                          <img src={item.preview} alt={`Side snapshot ${index + 1}`} className="size-full object-contain bg-black" />
                          <div className="absolute left-1 bottom-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-mono text-white">
                            #{index + 1}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSideSnapshot(item.id)}
                            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-rose-600 text-white shadow transition-opacity hover:bg-rose-700"
                            aria-label="Remove side snapshot"
                          >
                            <XCircle className="size-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* ── Results panels ──────────────────────────────────────────── */}
            {/* ── Inspection Results & Verification View ────────────────── */}
            <AnimatePresence>
              {batchResult && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Single Clean Verdict Card */}
                  <div className={cn(
                    "rounded-2xl border-2 p-6 text-center shadow-lg transition-all",
                    batchResult.verdict === "ok" ? "border-emerald-500/60 bg-emerald-500/10" : "border-rose-500/60 bg-rose-500/10",
                  )}>
                    <div className="flex items-center justify-center gap-3">
                      {batchResult.verdict === "ok" ? (
                        <CheckCircle2 className="size-10 text-emerald-400" />
                      ) : (
                        <XCircle className="size-10 text-rose-400" />
                      )}
                      <h2 className={cn("text-2xl font-black tracking-tight",
                        batchResult.verdict === "ok" ? "text-emerald-300" : "text-rose-300"
                      )}>
                        {batchResult.verdict === "ok" ? "PART ACCEPTED" : "PART REJECTED"}
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground font-medium">
                      {batchResult.verdict === "ok"
                        ? "Part Verified — All dimensional parameters within tolerance • 0 surface defects detected across all captured frames"
                        : "Part Rejected — Dimensional measurement out of tolerance or surface defect detected"}
                    </p>
                  </div>

                  {/* Inspection Analysis Details */}
                  <SectionCard
                    title="Inspection Analysis & Annotated Verification"
                    subtitle={`Verified ${batchResult.total_pairs} captured pair(s) · ${batchResult.duration_ms}ms AI verification time`}
                  >
                    <div className="space-y-6">
                      {/* Dimensional Analysis Frames (Pair #1 Only - 2 Frames) */}
                      {batchResult.annotated_frames[0] && (
                        <div className="space-y-2 rounded-xl border border-brand-blue/30 bg-brand-blue/5 p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                              📐 Dimensional Measurement Model Analysis (Pair #1 Only — 2 Frames)
                            </h4>
                            <span className="text-[11px] font-mono text-muted-foreground">Top + Side Views</span>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                              <span className="text-[11px] font-mono text-muted-foreground">Pair #1 Top — Dimensional Overlay</span>
                              <img
                                src={`data:image/jpeg;base64,${batchResult.annotated_frames[0].top_measure_b64}`}
                                alt="Pair #1 Top Measurement"
                                className="w-full rounded-md border border-border object-contain bg-black h-48"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[11px] font-mono text-muted-foreground">Pair #1 Side — Dimensional Overlay</span>
                              <img
                                src={`data:image/jpeg;base64,${batchResult.annotated_frames[0].side_measure_b64}`}
                                alt="Pair #1 Side Measurement"
                                className="w-full rounded-md border border-border object-contain bg-black h-48"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Surface Defect Analysis Frames (All Captured Pairs - up to 10 Frames) */}
                      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                          🔍 Surface Defect Model Analysis (All {batchResult.annotated_frames.length} Pairs — {batchResult.annotated_frames.length * 2} Frames)
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                          {batchResult.annotated_frames.flatMap((pair) => [
                            {
                              key: `p${pair.pair_index}-top-inspect`,
                              label: `Pair #${pair.pair_index} Top`,
                              b64: pair.top_inspect_b64,
                            },
                            {
                              key: `p${pair.pair_index}-side-inspect`,
                              label: `Pair #${pair.pair_index} Side`,
                              b64: pair.side_inspect_b64,
                            },
                          ]).map((item) => (
                            <div key={item.key} className="space-y-1 rounded-lg border border-border bg-muted/20 p-1.5">
                              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                                <span>{item.label}</span>
                              </div>
                              <img
                                src={`data:image/jpeg;base64,${item.b64}`}
                                alt={item.label}
                                className="w-full rounded-md border border-border object-contain bg-black h-28"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Measurements Table & Defects List */}
                      <div className="grid gap-6 mt-6 lg:grid-cols-3">
                        {/* Measurements table */}
                        <div className="lg:col-span-2 space-y-2">
                          <h4 className="type-body-m font-bold text-foreground">
                            Measurement parameters ({batchResult.measurements.length} parameter{batchResult.measurements.length === 1 ? "" : "s"} evaluated)
                          </h4>
                          <div className="overflow-x-auto rounded-xl border border-border">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-border bg-muted/40">
                                  <Th>Parameter</Th><Th>Measured</Th><Th>Expected</Th><Th>Tolerance</Th><Th>Status</Th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {batchResult.measurements.map((m, idx) => (
                                  <tr key={`${m.parameter}-${m.pair_index ?? idx}`} className={m.pass ? "" : "bg-rose-500/5"}>
                                    <Td className="font-medium">
                                      {m.parameter}
                                    </Td>
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
                          <h4 className="type-body-m font-bold text-foreground">
                            Surface defect inspection ({batchResult.defects.length} defect{batchResult.defects.length === 1 ? "" : "s"} found)
                          </h4>
                          {batchResult.defects.length > 0 ? (
                            <ul className="space-y-2">
                              {batchResult.defects.map((d, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                                  <div>
                                    <p className="type-body-m font-semibold text-rose-300 flex items-center gap-1.5">
                                      {d.pair_index ? <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-mono text-rose-200">Pair #{d.pair_index}</span> : null}
                                      {d.name}
                                    </p>
                                    <p className="type-caption text-muted-foreground">{d.cam} · Conf {(d.confidence * 100).toFixed(0)}%</p>
                                  </div>
                                  <AlertTriangle className="size-4 text-rose-400 shrink-0" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
                              <p className="text-center type-body-s text-emerald-400 flex items-center gap-1.5 font-medium">
                                <CheckCircle2 className="size-4" /> No defects detected across captured frames
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </SectionCard>
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

          {step === 0 ? null : (
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
