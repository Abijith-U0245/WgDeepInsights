/**
 * inspectionApi.ts — Service layer connecting the React frontend to the
 * WGDeepInsight FastAPI Python backend (localhost:8000).
 *
 * The Vite dev server proxies /py-api/* → http://localhost:8000/*
 * so all calls here use the /py-api prefix.
 *
 * All endpoints fall back gracefully (via a demo stub) when the backend
 * is not running, so the UI stays usable without hardware attached.
 */

const PY_API = "/py-api";

// ── Types ──────────────────────────────────────────────────────────────────

export type MeasurementRow = {
  parameter: string;
  measured: number;
  expected: number;
  tolerance: number;
  unit: string;
  pass: boolean;
  // legacy aliases kept for Supabase insert
  actual?: number;
  deviation?: number;
  status?: "pass" | "fail";
};

export type DefectRow = {
  name: string;
  confidence: number;
  bbox: [number, number, number, number];
  cam: "TOP VIEW" | "SIDE VIEW";
};

export type MeasureResult = {
  status: "PASS" | "FAIL";
  measurements: MeasurementRow[];
  top_annotated_b64: string;
  side_annotated_b64: string;
  duration_ms: number;
};

export type InspectResult = {
  status: "pass" | "reject";
  defects: DefectRow[];
  top_annotated_b64: string;
  side_annotated_b64: string;
  duration_ms: number;
};

export type RunTestResult = {
  verdict: "ok" | "reject";
  measure_status: "PASS" | "FAIL";
  inspect_status: "pass" | "reject";
  measurements: MeasurementRow[];
  defects: DefectRow[];
  top_measure_b64: string;
  side_measure_b64: string;
  top_inspect_b64: string;
  side_inspect_b64: string;
  duration_ms: number;
};

// ── Health check ───────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<"ready" | "demo" | "offline"> {
  try {
    const res = await fetch(`${PY_API}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return "offline";
    const data = (await res.json()) as { cameras: string };
    return data.cameras === "ready" ? "ready" : "demo";
  } catch {
    return "offline";
  }
}

// ── Live stream URL helpers ────────────────────────────────────────────────

/** Returns the MJPEG URL for the live camera feed. Use as <img src={...} /> */
export function measureStreamUrl(partName: string): string {
  return `${PY_API}/stream/${encodeURIComponent(partName.toLowerCase())}/measure`;
}

export function inspectStreamUrl(partName: string): string {
  return `${PY_API}/stream/${encodeURIComponent(partName.toLowerCase())}/inspect`;
}

// ── Trigger calls ──────────────────────────────────────────────────────────

async function pyPost<T>(path: string): Promise<T> {
  const res = await fetch(`${PY_API}${path}`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

/** Capture one frame pair and run dimensional measurement. */
export async function triggerMeasure(partName: string): Promise<MeasureResult> {
  const key = partName.toLowerCase();
  return pyPost<MeasureResult>(`/trigger/${encodeURIComponent(key)}/measure`);
}

/** Capture one frame pair and run YOLO surface inspection. */
export async function triggerInspect(partName: string): Promise<InspectResult> {
  const key = partName.toLowerCase();
  return pyPost<InspectResult>(`/trigger/${encodeURIComponent(key)}/inspect`);
}

/** Capture one frame pair, run both analyses, get combined verdict. */
export async function runFullTest(partName: string): Promise<RunTestResult> {
  const key = partName.toLowerCase();
  return pyPost<RunTestResult>(`/run-test/${encodeURIComponent(key)}`);
}

// ── Normalise helpers (for Supabase inserts) ──────────────────────────────

/** Convert MeasurementRow to the Supabase measurement_results shape. */
export function toSupabaseMeasurement(m: MeasurementRow) {
  const deviation = Number((m.measured - m.expected).toFixed(4));
  return {
    parameter: m.parameter,
    expected:  m.expected,
    actual:    m.measured,
    deviation,
    tolerance: m.tolerance,
    unit:      m.unit,
    status:    m.pass ? ("pass" as const) : ("fail" as const),
  };
}

/** Convert DefectRow to the Supabase defect_results shape. */
export function toSupabaseDefect(d: DefectRow) {
  return {
    defect_name:     d.name,
    confidence:      d.confidence,
    annotated_image: null as string | null,
    status:          "reject" as const,
  };
}
