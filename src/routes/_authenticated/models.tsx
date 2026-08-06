import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Cpu } from "lucide-react";

import { useModels, useParts } from "@/hooks/useInspectionData";

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
  const { data: models = [] } = useModels();
  const { data: parts = [] } = useParts();
  return (
    <AppShell title="Models" subtitle="AI inference model registry">
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
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
