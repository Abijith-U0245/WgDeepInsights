/**
 * LatencyPanel.tsx — Per-piece inspection latency breakdown (Manager view).
 * Shows grab_ms, measure_ms, inspect_ms, and total_ms with visual progress bars.
 */
import { Clock, Timer } from "lucide-react";
import { type StageTimings } from "@/services/inspectionApi";
import { cn } from "@/lib/utils";

interface LatencyPanelProps {
  timings: StageTimings;
  /** Optional additional class names */
  className?: string;
}

const STAGES: { key: keyof StageTimings; label: string; color: string }[] = [
  { key: "grab_ms",    label: "Camera Grab",        color: "bg-sky-500"    },
  { key: "measure_ms", label: "Measurement (CV)",   color: "bg-violet-500" },
  { key: "inspect_ms", label: "Defect AI (YOLO)",   color: "bg-orange-500" },
];

export function LatencyPanel({ timings, className }: LatencyPanelProps) {
  const total = timings.total_ms || 1; // avoid divide-by-zero

  return (
    <div className={cn("rounded-xl border border-border bg-muted/20 p-4 space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">Inspection Latency</h4>
        <span className="ml-auto text-sm font-bold text-foreground">
          {timings.total_ms} ms total
        </span>
      </div>

      <div className="space-y-2">
        {STAGES.map(({ key, label, color }) => {
          const ms = timings[key] ?? 0;
          const pct = Math.min(100, Math.round((ms / total) * 100));
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-medium text-foreground">{ms} ms</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Throughput estimate */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
        <Timer className="size-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Estimated throughput:{" "}
          <span className="font-semibold text-foreground">
            ~{Math.round(1000 / (timings.total_ms || 1))} parts/sec
          </span>
        </p>
      </div>
    </div>
  );
}
