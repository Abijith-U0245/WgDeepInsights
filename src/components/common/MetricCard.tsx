import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  index = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "orange" | "blue" | "success" | "error" | "warning";
  index?: number;
}) {
  const toneClass = {
    neutral: "text-foreground",
    orange: "text-primary",
    blue: "text-brand-blue",
    success: "text-success",
    error: "text-error",
    warning: "text-warning",
  }[tone];

  const iconWrap = {
    neutral: "bg-muted text-muted-foreground",
    orange: "bg-primary-subtle text-primary",
    blue: "bg-brand-blue-subtle text-brand-blue",
    success: "bg-success/10 text-success",
    error: "bg-error/10 text-error",
    warning: "bg-warning/10 text-warning",
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: "easeOut" }}
      className="surface-card flex flex-col gap-4 p-5 transition-shadow hover:shadow-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="type-body-m font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex size-8 items-center justify-center rounded-lg", iconWrap)}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className={cn("metric-m", toneClass)}>{value}</div>
      {hint && <div className="type-caption text-muted-foreground">{hint}</div>}
    </motion.div>
  );
}
