import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cpu, Plus } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useModels, useParts } from "@/hooks/useInspectionData";
import { readLocalCollection, writeLocalCollection } from "@/lib/offline-store";

export const Route = createFileRoute("/_authenticated/models")({
  head: () => ({
    meta: [
      { title: "Model Management — WGDeepInsight | WG Tech" },
      { name: "description", content: "Registered AI detection and measurement models, versions and activation status." },
      { property: "og:title", content: "Model Management — WGDeepInsight" },
      { property: "og:description", content: "Registered AI detection and measurement models, versions and activation status." },
    ],
  }),
  component: ModelsPage,
});

function ModelsPage() {
  const queryClient = useQueryClient();
  const { data: models = [] } = useModels();
  const { data: parts = [] } = useParts();

  // Add Model State
  const [addOpen, setAddOpen] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelType, setModelType] = useState("surface");
  const [modelPath, setModelPath] = useState("");
  const [version, setVersion] = useState("1.0");
  const [partId, setPartId] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  async function handleAddModel(e: React.FormEvent) {
    e.preventDefault();
    if (!modelName.trim()) return;
    setSubmitting(true);
    try {
      const selectedPartId = partId === "all" ? null : partId;
      const row = {
        id: `model-${Date.now()}`,
        model_name: modelName.trim(),
        model_type: modelType,
        model_path: modelPath.trim() || `models/${modelName.trim().toLowerCase().replace(/\s+/g, '_')}_best.pt`,
        version: version.trim() || "1.0",
        part_id: selectedPartId,
        status: "active",
        uploaded_at: new Date().toISOString(),
      };
      const items = readLocalCollection<Array<Record<string, unknown>>>("models", []);
      writeLocalCollection("models", [...items, row]);
      toast.success(`Model "${modelName}" registered successfully.`);
      setModelName("");
      setModelPath("");
      setVersion("1.0");
      setPartId("all");
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to register model.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell 
      title="Models" 
      subtitle="AI inference model registry"
      actions={
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 size-4" /> Add Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register AI Inspection Model</DialogTitle>
              <DialogDescription>Add a new neural network or measurement script model parameter configuration.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddModel} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="modelName">Model Name</Label>
                <Input id="modelName" placeholder="e.g. Pin Defect YOLOv11" required value={modelName} onChange={(e) => setModelName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="modelType">Model Type</Label>
                  <Select value={modelType} onValueChange={setModelType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="surface">Surface (YOLO)</SelectItem>
                      <SelectItem value="measurement">Measurement (Script)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="version">Version</Label>
                  <Input id="version" placeholder="e.g. 1.0" required value={version} onChange={(e) => setVersion(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="partId">Associated Part Family</Label>
                <Select value={partId} onValueChange={setPartId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Parts (General Purpose)</SelectItem>
                    {parts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.part_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelPath">Model Weights Path / Executable</Label>
                <Input id="modelPath" placeholder="e.g. surface_models/Pin_best.pt" value={modelPath} onChange={(e) => setModelPath(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>Register Model</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {models.length === 0 ? (
        <SectionCard><p className="type-body-m text-muted-foreground">No models registered yet.</p></SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {models.map((m) => (
            <div key={m.id} className="surface-card p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-blue-subtle">
                  <Cpu className="size-4 text-brand-blue" />
                </span>
                <StatusBadge status={m.status} />
              </div>
              <p className="type-body-m mt-3 font-semibold text-foreground">{m.model_name}</p>
              <p className="type-body-s text-muted-foreground">
                {m.model_type} · v{m.version} · {parts.find((p) => p.id === m.part_id)?.part_name ?? "All parts"}
              </p>
              <p className="type-caption mt-1.5 text-muted-foreground/60 truncate font-mono">
                {m.model_path}
              </p>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
