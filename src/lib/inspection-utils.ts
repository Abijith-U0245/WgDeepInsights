import type { Inspection } from "@/hooks/useInspectionData";

export function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

export function passRate(list: Inspection[]) {
  const decided = list.filter((i) => i.status === "ok" || i.status === "reject");
  if (decided.length === 0) return 0;
  return Math.round((decided.filter((i) => i.status === "ok").length / decided.length) * 1000) / 10;
}

export function formatTime(t: string) {
  return t?.slice(0, 5) ?? "--:--";
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
