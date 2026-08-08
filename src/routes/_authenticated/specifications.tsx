import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { PartImage } from "@/components/common/PartImage";
import { SectionCard } from "@/components/common/SectionCard";
import { useParts, useSpecifications } from "@/hooks/useInspectionData";
import { PART_REFERENCE_IMAGES } from "@/lib/part-images";

export const Route = createFileRoute("/_authenticated/specifications")({
  head: () => ({
    meta: [
      { title: "Specifications — WGDeepInsight | WG Tech" },
      { name: "description", content: "Dimensional parameters, expected values and tolerance bands for every inspected part." },
      { property: "og:title", content: "Specifications — WGDeepInsight" },
      { property: "og:description", content: "Dimensional parameters, expected values and tolerance bands for every inspected part." },
    ],
  }),
  component: SpecificationsPage,
});

const defaultSpecs = [
  {
    part_no: "M346500",
    name: "Capnut",
    image: PART_REFERENCE_IMAGES.capnut,
    measurements: [
      ["OD - Across Flats (hex, \"Width\")", "36 mm", "(0 / -0.62)"],
      ["OD - Across Corners (hex max)", "Ø39 mm", ""],
      ["Overall Height", "17.5 mm", "(0 / -0.1)"],
      ["ID - Internal Thread (blind end)", "M16 x 1.5", ""],
      ["Bore Step Ø1", "Ø17.15", "± 0.20"],
      ["Bore Step Ø2", "Ø14.575", "± 0.075"],
      ["Bore Step Ø3", "Ø10.675", "± 0.075"],
      ["Bore Step Ø4 (thread minor dia.)", "Ø9.575", "± 0.075"],
      ["Boss / Collar OD (Detail Y)", "Ø21.9", ""],
      ["Boss / Collar ID (Detail Y)", "Ø7.8", ""],
      ["Shoulder OD (Section G-G)", "Ø34.7", ""],
      ["Male Thread Boss Diameter", "Ø25.40", "± 0.05"],
      ["Male Thread", "1-1/8\"-12 UNF", ""],
      ["Small Hole Diameter", "Ø4.6", ""],
    ],
    note: "This part carries two separate thread features — an internal (female) M16x1.5 thread and a separate external (male) 1-1/8\"-12 UNF thread boss.",
  },
  {
    part_no: "M937080 / 891 010 055 4",
    name: "Stud Bolt",
    image: PART_REFERENCE_IMAGES.stud,
    measurements: [
      ["Overall Length", "38.1 mm", "± 0.8"],
      ["Metal-End Length", "11.6 mm", "± 0.8"],
      ["Nut-End Thread Length", "19.3 mm", "(no tolerance given)"],
      ["Shank OD", "Ø7.9 mm", "(no tolerance given)"],
      ["Thread (both ends)", "5/16\"-18 UNC 2A", ""],
    ],
    note: "Double-ended stud, 5/16\"-18 UNC 2A thread both ends.",
  },
  {
    part_no: "932 500 208 4",
    name: "Adaptor",
    image: PART_REFERENCE_IMAGES.adapter,
    measurements: [
      ["OD - Across Flats (hex, both sides)", "27 mm", ""],
      ["Bore / Pilot ID", "Ø19.7 mm", "± 0.1"],
      ["Groove / Step Width", "2.1 mm", "± 0.1"],
      ["Thread (both sides)", "M22 x 1.5", ""],
    ],
    note: "No toleranced overall length was legible on this drawing — only the hex, bore, groove and thread sizes above were confirmed.",
  },
  {
    part_no: "100631510",
    name: "Pin",
    image: PART_REFERENCE_IMAGES.pin,
    measurements: [
      ["OD (Outer Diameter, ØA)", "Ø11.979 mm", "± 0.021"],
      ["ID (Through hole, ØD — 2 holes)", "Ø3.2 mm", "nominal"],
      ["Length (L, overall)", "87.6 mm", "± 0.2"],
      ["Length (C, between hole centers)", "81.2 mm", "± 0.2"],
      ["Width / Chamfer (B)", "3.2 mm", "—"],
    ],
    note: "Precision pin with two transverse Ø3.2mm through-holes. OD tolerance class: ± 0.021 mm (h6-style). Overall length 87.6 ± 0.2 mm; hole centre spacing 81.2 ± 0.2 mm.",
  },
];

function SpecificationsPage() {
  const { data: specs = [] } = useSpecifications();
  const { data: parts = [] } = useParts();

  const specsByPart = useMemo(() => {
    const grouped = new Map<string, typeof specs>();
    for (const spec of specs) {
      const rows = grouped.get(spec.part_id) ?? [];
      rows.push(spec);
      grouped.set(spec.part_id, rows);
    }
    return grouped;
  }, [specs]);

  return (
    <AppShell title="Specifications" subtitle="Tolerance definitions per part">
      <SectionCard bodyClassName="p-0">
        {specs.length === 0 ? (
          <div className="space-y-6 px-6 py-6">
            {defaultSpecs.map((part) => (
              <SpecificationBlock
                key={part.part_no}
                name={part.name}
                partNo={part.part_no}
                image={part.image}
                measurements={part.measurements}
                note={part.note}
              />
            ))}
            <p className="type-body-s text-muted-foreground">
              Angular, chamfer, and detailed surface-finish callouts omitted per review scope.
            </p>
          </div>
        ) : (
          <div className="space-y-6 px-6 py-6">
            {parts.map((part) => {
              const partSpecs = specsByPart.get(part.id);
              if (!partSpecs?.length) return null;
              return (
                <SpecificationBlock
                  key={part.id}
                  name={part.part_name}
                  image={null}
                  partName={part.part_name}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-1">Parameter</th>
                          <th className="px-2 py-1">Expected</th>
                          <th className="px-2 py-1">Tolerance</th>
                          <th className="px-2 py-1">Unit</th>
                          <th className="px-2 py-1">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {partSpecs.map((s) => (
                          <tr key={s.id}>
                            <td className="px-2 py-2 type-body-m font-medium text-foreground">{s.parameter}</td>
                            <td className="px-2 py-2 type-body-m tabular">{s.expected_value}</td>
                            <td className="px-2 py-2 type-body-m tabular">±{s.tolerance}</td>
                            <td className="px-2 py-2 type-body-m">{s.unit}</td>
                            <td className="px-2 py-2 type-body-m text-muted-foreground">{s.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SpecificationBlock>
              );
            })}
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}

function SpecificationBlock({
  name,
  partNo,
  image,
  partName,
  measurements,
  note,
  children,
}: {
  name: string;
  partNo?: string;
  image: string | null;
  partName?: string;
  measurements?: [string, string, string][];
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
      <div className="col-span-1">
        {image ? (
          <img src={image} alt={name} className="h-auto w-full rounded border bg-muted object-contain p-2" />
        ) : (
          <PartImage
            partName={partName ?? name}
            alt={name}
            className="h-48 w-full rounded border object-contain p-2"
          />
        )}
      </div>
      <div className="col-span-2">
        <h3 className="type-heading-s font-semibold">
          {name}
          {partNo ? ` — Part No. ${partNo}` : ""}
        </h3>
        {measurements ? (
          <>
            <p className="mt-1 text-muted-foreground">Source: original supplier engineering drawings.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left type-caption font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1">Feature</th>
                    <th className="px-2 py-1">Value</th>
                    <th className="px-2 py-1">Tolerance / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {measurements.map((m, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2 type-body-m">{m[0]}</td>
                      <td className="px-2 py-2 type-body-m tabular">{m[1]}</td>
                      <td className="px-2 py-2 type-body-m text-muted-foreground">{m[2] || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {note && <p className="mt-2 text-muted-foreground">{note}</p>}
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
