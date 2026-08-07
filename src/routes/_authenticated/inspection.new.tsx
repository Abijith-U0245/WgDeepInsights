import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  FileText,
  Loader2,
  Ruler,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PartImage } from "@/components/common/PartImage";
import { CaptureBoard, type CapturedFrame } from "@/components/inspection/CaptureBoard";
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
  runInspection,
  runMeasurement,
  type DefectRow,
  type MeasurementRow,
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
  const [measureFrames, setMeasureFrames] = useState<CapturedFrame[]>([]);
  const [surfaceFrames, setSurfaceFrames] = useState<CapturedFrame[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementRow[] | null>(null);
  const [defects, setDefects] = useState<DefectRow[] | null>(null);
  const [running, setRunning] = useState<"measure" | "inspect" | "save" | null>(null);

  const { data: parts = [] } = useParts();
  const { data: models = [] } = useModels();
  const { data: specs = [] } = useSpecifications(partId || undefined);

  const part = parts.find((p) => p.id === partId);
  const model = models.find((m) => m.id === modelId);
  const partModels = useMemo(
    () => models.filter((m) => !m.part_id || m.part_id === partId),
    [models, partId],
  );

  const measurementStatus = measurements
    ? measurements.every((m) => m.status === "pass")
      ? "pass"
      : "fail"
    : null;
  const defectStatus = defects
    ? defects.every((d) => d.status === "pass")
      ? "pass"
      : "reject"
    : null;
  const finalStatus =
    measurementStatus && defectStatus
      ? measurementStatus === "pass" && defectStatus === "pass"
        ? "ok"
        : "reject"
      : null;

  const canNext = [Boolean(partId), Boolean(modelId), specs.length >= 0, false][step];

  async function handleMeasure() {
    if (!partId || !modelId) return;
    setRunning("measure");
    try {
      const res = await runMeasurement({
        partId,
        modelId,
        images: measureFrames.map((f) => f.file.name),
        specifications: specs.map((s) => ({
          parameter: s.parameter,
          expected: Number(s.expected_value),
          tolerance: Number(s.tolerance),
          unit: s.unit,
        })),
      });
      setMeasurements(res.results);
      toast.success(`Measurement complete — ${res.status.toUpperCase()}`);
    } catch {
      toast.error("Measurement service unavailable");
    } finally {
      setRunning(null);
    }
  }

  async function handleInspect() {
    if (!partId || !modelId) return;
    setRunning("inspect");
    try {
      const res = await runInspection({
        partId,
        modelId,
        images: surfaceFrames.map((f) => f.file.name),
      });
      setDefects(res.defects);
      toast.success(`Surface inspection complete — ${res.status.toUpperCase()}`);
    } catch {
      toast.error("Surface defect service unavailable");
    } finally {
      setRunning(null);
    }
  }

  async function handleSave() {
    if (!user || !finalStatus) return;
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
          duration_seconds: 42,
          status: finalStatus,
          remarks,
        })
        .select("id, inspection_number")
        .single();
      if (error) throw error;

      const inspectionId = inspection.id as string;

      if (measurements?.length) {
        await supabase.from("measurement_results").insert(
          measurements.map((m) => ({
            inspection_id: inspectionId,
            parameter: m.parameter,
            expected: m.expected,
            actual: m.actual,
            deviation: m.deviation,
            tolerance: m.tolerance,
            unit: m.unit,
            status: m.status,
          })),
        );
      }
      if (defects?.length) {
        await supabase.from("defect_results").insert(
          defects.map((d) => ({
            inspection_id: inspectionId,
            defect_name: d.defectName,
            confidence: d.confidence,
            annotated_image: d.annotatedImage,
            status: d.status,
          })),
        );
      }

      const uploads = [
        ...measureFrames.map((f) => ({ f, type: "measurement" })),
        ...surfaceFrames.map((f) => ({ f, type: "surface" })),
      ];
      if (uploads.length) {
        const refs = await Promise.all(
          uploads.map(async ({ f, type }) => ({
            inspection_id: inspectionId,
            image_type: type,
            image_url: await uploadFile("captured-images", f.file, inspectionId),
          })),
        );
        await supabase.from("captured_images").insert(refs);
      }

      await queryClient.invalidateQueries({ queryKey: ["inspections"] });
      toast.success(`Saved ${inspection.inspection_number}`);
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
            {partModels.length === 0 ? (
              <p className="type-body-m text-muted-foreground">
                No models available for this part yet.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {partModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModelId(m.id)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      modelId === m.id
                        ? "border-primary bg-primary-subtle shadow-card"
                        : "border-border bg-background hover:border-brand-blue/40 hover:shadow-card",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-blue-subtle">
                        <Cpu className="size-4 text-brand-blue" />
                      </span>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="type-body-m mt-3 font-semibold text-foreground">{m.model_name}</p>
                    <p className="type-body-s text-muted-foreground">
                      {m.model_type} · v{m.version}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {step === 2 && (
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Specification"
              subtitle={part ? `Tolerances for ${part.part_name}` : "Tolerances"}
              className="lg:col-span-2"
              bodyClassName="p-0"
            >
              {specs.length === 0 ? (
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
                      {specs.map((s) => (
                        <tr key={s.id}>
                          <Td className="font-medium text-foreground">{s.parameter}</Td>
                          <Td className="tabular">{s.expected_value}</Td>
                          <Td className="tabular">±{s.tolerance}</Td>
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
                refValue={part?.reference_image}
                alt={part?.part_name ?? "Part reference"}
                className="h-48 w-full rounded-lg object-contain p-2"
              />
            </SectionCard>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Dimensional measurement" subtitle="Capture measurement frames">
                <CaptureBoard
                  label="Measurement frames"
                  frames={measureFrames}
                  onChange={setMeasureFrames}
                  disabled={running !== null}
                />
                <Button
                  className="mt-4 w-full"
                  onClick={handleMeasure}
                  disabled={running !== null || specs.length === 0}
                >
                  {running === "measure" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Ruler className="size-4" />
                  )}
                  Run measurement
                </Button>

                {measurements && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <Th>Parameter</Th>
                          <Th>Expected</Th>
                          <Th>Actual</Th>
                          <Th>Deviation</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {measurements.map((m) => (
                          <tr key={m.parameter}>
                            <Td className="font-medium text-foreground">{m.parameter}</Td>
                            <Td className="tabular">
                              {m.expected} {m.unit}
                            </Td>
                            <Td className="tabular">
                              {m.actual} {m.unit}
                            </Td>
                            <Td
                              className={cn(
                                "tabular",
                                m.status === "pass" ? "text-success" : "text-error",
                              )}
                            >
                              {m.deviation > 0 ? "+" : ""}
                              {m.deviation}
                            </Td>
                            <Td>
                              <StatusBadge status={m.status} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Surface defect inspection" subtitle="Capture surface frames">
                <CaptureBoard
                  label="Surface frames"
                  frames={surfaceFrames}
                  onChange={setSurfaceFrames}
                  disabled={running !== null}
                />
                <Button
                  className="mt-4 w-full"
                  variant="secondary"
                  onClick={handleInspect}
                  disabled={running !== null}
                >
                  {running === "inspect" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldAlert className="size-4" />
                  )}
                  Run surface inspection
                </Button>

                {defects && (
                  <ul className="mt-4 space-y-2">
                    {defects.length === 0 && (
                      <li className="type-body-m text-success">No surface defects detected.</li>
                    )}
                    {defects.map((d) => (
                      <li
                        key={d.defectName}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                      >
                        <div>
                          <p className="type-body-m font-medium text-foreground">{d.defectName}</p>
                          <p className="type-caption text-muted-foreground">
                            Confidence {(d.confidence * 100).toFixed(1)}%
                          </p>
                        </div>
                        <StatusBadge status={d.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            <SectionCard title="Inspection record" subtitle="Context saved with this result">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="area">Area / line</Label>
                  <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shift">Shift</Label>
                  <Select value={shift} onValueChange={setShift}>
                    <SelectTrigger id="shift">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["A", "B", "C"].map((s) => (
                        <SelectItem key={s} value={s}>
                          Shift {s}
                        </SelectItem>
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
                      <span className="type-body-s text-muted-foreground">
                        Run both analyses to get a verdict
                      </span>
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
