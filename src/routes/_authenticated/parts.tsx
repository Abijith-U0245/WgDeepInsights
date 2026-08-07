import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { PartImage } from "@/components/common/PartImage";
import { SectionCard } from "@/components/common/SectionCard";
import { useParts } from "@/hooks/useInspectionData";

export const Route = createFileRoute("/_authenticated/parts")({
  head: () => ({
    meta: [
      { title: "Parts Management — WGDeepInsight | WG Tech" },
      { name: "description", content: "Manage precision part families, reference geometry and surface images used by inspection models." },
      { property: "og:title", content: "Parts Management — WGDeepInsight" },
      { property: "og:description", content: "Manage precision part families, reference geometry and surface images used by inspection models." },
    ],
  }),
  component: PartsPage,
});

function PartsPage() {
  const { data: parts = [] } = useParts();
  return (
    <AppShell title="Parts" subtitle="Part families and reference imagery">
      {parts.length === 0 ? (
        <SectionCard><p className="type-body-m text-muted-foreground">No parts configured yet.</p></SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {parts.map((p) => (
            <div key={p.id} className="surface-card overflow-hidden">
              <PartImage
                partName={p.part_name}
                refValue={p.reference_image}
                alt={p.part_name}
                className="h-48 w-full object-contain p-3"
              />
              <div className="p-5">
                <p className="type-body-m font-semibold text-foreground">{p.part_name}</p>
                <p className="type-body-s mt-1 text-muted-foreground">{p.description || "No description"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
