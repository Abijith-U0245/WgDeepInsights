import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const value = (status ?? "pending").toLowerCase();
  const map: Record<string, string> = {
    ok: "bg-success/10 text-success border-success/25",
    pass: "bg-success/10 text-success border-success/25",
    active: "bg-success/10 text-success border-success/25",
    reject: "bg-error/10 text-error border-error/25",
    fail: "bg-error/10 text-error border-error/25",
    pending: "bg-warning/10 text-warning border-warning/25",
    inactive: "bg-muted text-muted-foreground border-border",
  };
  const label: Record<string, string> = {
    ok: "OK",
    pass: "Pass",
    fail: "Fail",
    reject: "Reject",
    pending: "Pending",
    active: "Active",
    inactive: "Inactive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 type-caption font-semibold",
        map[value] ?? map["pending"],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label[value] ?? status}
    </span>
  );
}
