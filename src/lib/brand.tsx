import { cn } from "@/lib/utils";

export function WgLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
          <path
            d="M12 2.5 4.5 5.6v6.1c0 4.6 3.1 8.4 7.5 9.8 4.4-1.4 7.5-5.2 7.5-9.8V5.6L12 2.5Z"
            fill="currentColor"
            className="text-primary"
          />
          <path
            d="M8.4 12.1l2.5 2.6 4.7-5"
            stroke="currentColor"
            className="text-primary-foreground"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="type-h-xs font-semibold tracking-tight text-primary">WG</span>
          <span className="type-h-xs font-semibold tracking-tight text-brand-blue-text">
            DeepInsight
          </span>
          <span className="type-overline mt-0.5 block text-muted-foreground">
            Detect · Predict · Protect
          </span>
        </span>
      )}
    </div>
  );
}
