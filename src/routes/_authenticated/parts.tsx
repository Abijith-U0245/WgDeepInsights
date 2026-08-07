import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  Ruler,
  ScanEye,
  Settings2,
  Shield,
  Tag,
  Weight,
  Wrench,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { useParts } from "@/hooks/useInspectionData";
import { PART_DESCRIPTORS, getPartDescriptor, type PartDescriptor } from "@/lib/part-descriptors";
import { cn } from "@/lib/utils";

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

const TONE_STYLES = {
  blue:  { bg: "bg-sky-500/10",  border: "border-sky-500/30",  text: "text-sky-400",  badge: "bg-sky-500/15 text-sky-300" },
  green: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", badge: "bg-amber-500/15 text-amber-300" },
  rose:  { bg: "bg-rose-500/10", border: "border-rose-500/30",  text: "text-rose-400",  badge: "bg-rose-500/15 text-rose-300" },
};

function PartsPage() {
  const { data: parts = [] } = useParts();
  const [selected, setSelected] = useState<PartDescriptor | null>(null);
  const [imgMode, setImgMode] = useState<"photo" | "drawing">("photo");
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null);

  // Merge DB parts with local descriptors; fallback to static descriptors for demo
  const displayParts = PART_DESCRIPTORS;

  return (
    <AppShell title="Parts" subtitle="Part families · reference imagery · descriptive analysis">
      {/* Hero grid — part cards */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {displayParts.map((d, i) => {
          const tone = TONE_STYLES[d.tone];
          return (
            <motion.article
              key={d.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className={cn(
                "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
                tone.border,
                selected?.key === d.key && "ring-2 ring-brand-blue",
              )}
              onClick={() => { setSelected(d); setImgMode("photo"); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelected(d)}
              aria-label={`View details for ${d.name}`}
            >
              {/* Part photo */}
              <div className={cn("relative overflow-hidden", tone.bg)}>
                <img
                  src={d.photo}
                  alt={`${d.name} — actual part photograph`}
                  className="h-52 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Overlays */}
                <span className={cn("absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", tone.badge)}>
                  {d.category.split("/")[0]?.trim() ?? d.category}
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
                  {d.partNumber}
                </span>
              </div>

              {/* Card body */}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div>
                  <h2 className={cn("type-h-xs", tone.text)}>{d.name}</h2>
                  <p className="type-body-s mt-0.5 text-muted-foreground">{d.tagline}</p>
                </div>

                <p className="type-body-s line-clamp-3 flex-1 text-muted-foreground/80">
                  {d.description}
                </p>

                {/* Quick specs row */}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <SpecChip icon={Weight} label={d.weight} />
                  <SpecChip icon={Layers} label={d.material.split(" ")[0] ?? d.material} />
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className={cn("mt-2 w-full border transition-colors", tone.border, "hover:bg-muted")}
                  onClick={(e) => { e.stopPropagation(); setSelected(d); setImgMode("photo"); }}
                  id={`part-detail-btn-${d.key}`}
                >
                  <BookOpen className="size-3.5" />
                  Full Analysis
                </Button>
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* DB-backed parts that don't match static descriptors */}
      {parts.some((p) => !getPartDescriptor(p.part_name)) && (
        <SectionCard title="Additional Parts" subtitle="Parts configured in database without local descriptor">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {parts
              .filter((p) => !getPartDescriptor(p.part_name))
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-border bg-background p-4">
                  <p className="type-body-m font-semibold text-foreground">{p.part_name}</p>
                  <p className="type-body-s mt-1 text-muted-foreground">{p.description || "No description available."}</p>
                </div>
              ))}
          </div>
        </SectionCard>
      )}

      {/* Detail drawer / modal */}
      <AnimatePresence>
        {selected && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />

            {/* Side panel */}
            <motion.aside
              key="panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-card shadow-2xl sm:max-w-xl lg:max-w-2xl"
              aria-label={`${selected.name} detailed analysis`}
            >
              <PartDetailPanel
                part={selected}
                imgMode={imgMode}
                onImgModeChange={setImgMode}
                expandedSpec={expandedSpec}
                onExpandSpec={setExpandedSpec}
                onClose={() => setSelected(null)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function SpecChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      <Icon className="size-3 shrink-0" />
      {label}
    </span>
  );
}

function PartDetailPanel({
  part,
  imgMode,
  onImgModeChange,
  expandedSpec,
  onExpandSpec,
  onClose,
}: {
  part: PartDescriptor;
  imgMode: "photo" | "drawing";
  onImgModeChange: (m: "photo" | "drawing") => void;
  expandedSpec: string | null;
  onExpandSpec: (k: string | null) => void;
  onClose: () => void;
}) {
  const tone = TONE_STYLES[part.tone];

  return (
    <>
      {/* Header */}
      <div className={cn("sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-5")}>
        <div>
          <span className={cn("text-[11px] font-semibold uppercase tracking-widest", tone.text)}>
            {part.category}
          </span>
          <h1 className="type-h-m mt-0.5 text-foreground">{part.name}</h1>
          <p className="type-body-s text-muted-foreground">{part.tagline}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close detail panel"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex-1 space-y-6 px-6 py-5">
        {/* Image switcher */}
        <div className="overflow-hidden rounded-xl border border-border">
          {/* Toggle */}
          <div className="flex border-b border-border bg-muted/40">
            {(["photo", "drawing"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onImgModeChange(m)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium transition-colors",
                  imgMode === m
                    ? cn("bg-card text-foreground", tone.text)
                    : "text-muted-foreground hover:text-foreground",
                )}
                id={`img-mode-${m}-${part.key}`}
              >
                {m === "photo" ? "📷 Actual Part Photo" : "📐 Engineering Drawing"}
              </button>
            ))}
          </div>
          <img
            key={imgMode}
            src={imgMode === "photo" ? part.photo : part.drawing}
            alt={imgMode === "photo" ? `${part.name} actual photograph` : `${part.name} engineering drawing`}
            className="h-72 w-full object-contain p-4 transition-opacity duration-200"
            loading="lazy"
          />
        </div>

        {/* Part ID row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoBlock icon={Tag} label="Part Number" value={part.partNumber} />
          <InfoBlock icon={Layers} label="Material" value={part.material} />
          <InfoBlock icon={Shield} label="Surface Protection" value={part.surfaceProtection} />
          <InfoBlock icon={Weight} label="Weight" value={part.weight} />
          <InfoBlock icon={Settings2} label="Category" value={part.category} />
        </div>

        {/* Description */}
        <section>
          <SectionHeader icon={BookOpen} label="Description" />
          <p className="type-body-m mt-2 text-muted-foreground leading-relaxed">{part.description}</p>
        </section>

        {/* Function */}
        <section>
          <SectionHeader icon={Wrench} label="Function & Application" />
          <p className="type-body-m mt-2 text-muted-foreground leading-relaxed">{part.function}</p>
        </section>

        {/* Inspection Focus */}
        <section>
          <SectionHeader icon={ScanEye} label="Inspection Focus Areas" />
          <ul className="mt-3 space-y-2">
            {part.inspectionFocus.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 type-body-s text-muted-foreground">
                <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", tone.text)} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Dimensional Specifications */}
        <section>
          <SectionHeader icon={Ruler} label="Dimensional Specifications" />
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-2.5 type-caption font-semibold text-muted-foreground">Parameter</th>
                  <th className="px-4 py-2.5 type-caption font-semibold text-muted-foreground">Value</th>
                  <th className="px-4 py-2.5 type-caption font-semibold text-muted-foreground">Critical</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {part.specs.map((s) => (
                  <tr key={s.parameter} className={cn("transition-colors hover:bg-muted/30", s.critical && "bg-sky-500/5")}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{s.parameter}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.value}</td>
                    <td className="px-4 py-2.5">
                      {s.critical ? (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", tone.badge)}>
                          Critical
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Defect Types */}
        <section>
          <SectionHeader icon={AlertTriangle} label="Known Defect Types" />
          <ul className="mt-3 space-y-2">
            {part.defectTypes.map((d, i) => (
              <li key={i} className="flex items-start gap-2.5 type-body-s text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                {d}
              </li>
            ))}
          </ul>
        </section>

        <div className="h-6" />
      </div>
    </>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <Icon className="size-4 text-muted-foreground" />
      <h3 className="type-body-m font-semibold text-foreground">{label}</h3>
    </div>
  );
}

function InfoBlock({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 type-caption text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </div>
      <p className="mt-1 type-body-s font-semibold text-foreground">{value}</p>
    </div>
  );
}
