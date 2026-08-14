import myLogo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

export function WgLogo({ className }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img src={myLogo} alt="WGDeepInsight Logo" className="h-12 w-auto object-contain" />
    </div>
  );
}
