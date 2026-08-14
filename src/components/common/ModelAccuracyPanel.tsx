/**
 * ModelAccuracyPanel.tsx — YOLO model confidence display (Manager view).
 * Shows per-camera confidence scores for the current and average runs.
 */
import { BrainCircuit, TrendingUp } from "lucide-react";
import { type ModelAccuracy } from "@/services/inspectionApi";
import { cn } from "@/lib/utils";

interface ModelAccuracyPanelProps {
  current: ModelAccuracy;
  /** Average confidence across all runs in the current session */
  sessionAvg?: ModelAccuracy;
  className?: string;
}

function ConfBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" :
    pct >= 60 ? "bg-amber-500"   :
                "bg-rose-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-mono font-semibold",
          pct >= 80 ? "text-emerald-400" :
          pct >= 60 ? "text-amber-400"   :
                      "text-rose-400"
        )}>
          {pct > 0 ? `${pct}%` : "N/A"}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ModelAccuracyPanel({ current, sessionAvg, className }: ModelAccuracyPanelProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-muted/20 p-4 space-y-3", className)}>
      <div className="flex items-center gap-2">
        <BrainCircuit className="size-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">Model Confidence</h4>
      </div>

      {/* Current run */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This run</p>
        <ConfBar value={current.top_conf}  label="Top camera (YOLO)" />
        <ConfBar value={current.side_conf} label="Side camera (YOLO)" />
        <ConfBar value={current.avg_conf}  label="Average confidence"  />
      </div>

      {/* Session average */}
      {sessionAvg && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Session average</p>
          </div>
          <ConfBar value={sessionAvg.top_conf}  label="Top camera avg" />
          <ConfBar value={sessionAvg.side_conf} label="Side camera avg" />
          <ConfBar value={sessionAvg.avg_conf}  label="Overall avg" />
        </div>
      )}
    </div>
  );
}
