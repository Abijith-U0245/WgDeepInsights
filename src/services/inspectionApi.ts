import { runLocalInspection } from "@/lib/local-ai";

/**
 * inspectionApi.ts — Service layer connecting the React frontend to the
 * WGDeepInsight FastAPI Python backend (localhost:8000).
 *
 * The Vite dev server proxies /py-api/* → http://localhost:8000/*
 * so all calls here use the /py-api prefix.
 *
 * All endpoints fall back gracefully to browser-side inference when the
 * network is unavailable or the backend is not running.
 */

const PY_API = "/py-api";

function isOfflineMode() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function isBackendUnavailable(error: unknown) {
  return error instanceof TypeError || error instanceof Error;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type MeasurementRow = {
  parameter: string;
  measured: number;
  expected: number;
  tolerance: number;
  unit: string;
  pass: boolean;
  pair_index?: number;
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
  pair_index?: number;
};

export type ModelAccuracy = {
  top_conf: number;
  side_conf: number;
  avg_conf: number;
};

export type StageTimings = {
  grab_ms:    number;
  measure_ms: number;
  inspect_ms: number;
  total_ms:   number;
};

export type MeasureResult = {
  status: "PASS" | "FAIL";
  measurements: MeasurementRow[];
  top_annotated_b64: string;
  side_annotated_b64: string;
  duration_ms: number;
  stage_timings?: Partial<StageTimings>;
};

export type InspectResult = {
  status: "pass" | "reject";
  part_detected: boolean;
  defects: DefectRow[];
  model_accuracy: ModelAccuracy;
  top_annotated_b64: string;
  side_annotated_b64: string;
  duration_ms: number;
  stage_timings?: Partial<StageTimings>;
};

export type RunTestResult = {
  verdict: "ok" | "reject";
  rejection_reason: null | "part_not_recognized" | "measurement_fail" | "defect_detected" | "measurement_fail_and_defect_detected";
  measure_status: "PASS" | "FAIL";
  inspect_status: "pass" | "reject";
  measurements: MeasurementRow[];
  defects: DefectRow[];
  model_accuracy: ModelAccuracy;
  stage_timings: StageTimings;
  top_measure_b64: string;
  side_measure_b64: string;
  top_inspect_b64: string;
  side_inspect_b64: string;
  duration_ms: number;
};

export type BatchAnnotatedFrame = {
  pair_index: number;
  top_measure_b64: string;
  side_measure_b64: string;
  top_inspect_b64: string;
  side_inspect_b64: string;
  measure_status: "PASS" | "FAIL";
  inspect_status: "pass" | "reject";
  pass: boolean;
};

export type RunBatchTestResult = {
  verdict: "ok" | "reject";
  total_pairs: number;
  annotated_frames: BatchAnnotatedFrame[];
  measurements: MeasurementRow[];
  defects: DefectRow[];
  duration_ms: number;
};

// ── Health check ───────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<"ready" | "demo" | "offline"> {
  if (isOfflineMode()) return "offline";

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
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000/stream/${encodeURIComponent(partName.toLowerCase())}/measure`;
}

export function inspectStreamUrl(partName: string): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000/stream/${encodeURIComponent(partName.toLowerCase())}/inspect`;
}

export function topStreamUrl(partName: string): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000/stream/${encodeURIComponent(partName.toLowerCase())}/top`;
}

export function sideStreamUrl(partName: string): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000/stream/${encodeURIComponent(partName.toLowerCase())}/side`;
}

export function topCaptureUrl(partName: string): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000/capture/${encodeURIComponent(partName.toLowerCase())}/top`;
}

export function sideCaptureUrl(partName: string): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000/capture/${encodeURIComponent(partName.toLowerCase())}/side`;
}

// ── Trigger calls ──────────────────────────────────────────────────────────

async function pyPost<T>(path: string): Promise<T> {
  if (isOfflineMode()) {
    throw new Error("Offline mode: local fallback active");
  }

  try {
    const res = await fetch(`${PY_API}${path}`, { method: "POST" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Backend ${path} failed (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  } catch (error) {
    if (isBackendUnavailable(error)) {
      throw new Error("Offline mode: local fallback active");
    }
    throw error;
  }
}

/** Capture one frame pair and run dimensional measurement. */
export async function triggerMeasure(partName: string): Promise<MeasureResult> {
  const key = partName.toLowerCase();

  if (isOfflineMode()) {
    const { run } = await runLocalInspection(partName, 1);
    return {
      status: run.measure_status,
      measurements: run.measurements,
      top_annotated_b64: run.top_measure_b64,
      side_annotated_b64: run.side_measure_b64,
      duration_ms: run.duration_ms,
      stage_timings: run.stage_timings,
    };
  }

  try {
    return await pyPost<MeasureResult>(`/trigger/${encodeURIComponent(key)}/measure`);
  } catch {
    const { run } = await runLocalInspection(partName, 1);
    return {
      status: run.measure_status,
      measurements: run.measurements,
      top_annotated_b64: run.top_measure_b64,
      side_annotated_b64: run.side_measure_b64,
      duration_ms: run.duration_ms,
      stage_timings: run.stage_timings,
    };
  }
}

/** Capture one frame pair and run YOLO surface inspection. */
export async function triggerInspect(partName: string): Promise<InspectResult> {
  const key = partName.toLowerCase();

  if (isOfflineMode()) {
    const { run } = await runLocalInspection(partName, 1);
    return {
      status: run.inspect_status,
      part_detected: true,
      defects: run.defects,
      model_accuracy: run.model_accuracy,
      top_annotated_b64: run.top_inspect_b64,
      side_annotated_b64: run.side_inspect_b64,
      duration_ms: run.duration_ms,
      stage_timings: run.stage_timings,
    };
  }

  try {
    return await pyPost<InspectResult>(`/trigger/${encodeURIComponent(key)}/inspect`);
  } catch {
    const { run } = await runLocalInspection(partName, 1);
    return {
      status: run.inspect_status,
      part_detected: true,
      defects: run.defects,
      model_accuracy: run.model_accuracy,
      top_annotated_b64: run.top_inspect_b64,
      side_annotated_b64: run.side_inspect_b64,
      duration_ms: run.duration_ms,
      stage_timings: run.stage_timings,
    };
  }
}

/** Capture one frame pair, run both analyses, get combined verdict. */
export async function runFullTest(partName: string): Promise<RunTestResult> {
  const key = partName.toLowerCase();

  if (isOfflineMode()) {
    const { run } = await runLocalInspection(partName, 1);
    return run;
  }

  try {
    return await pyPost<RunTestResult>(`/run-test/${encodeURIComponent(key)}`);
  } catch {
    const { run } = await runLocalInspection(partName, 1);
    return run;
  }
}

/** Trigger background AI processing immediately when user captures a pair */
export async function processPair(partName: string, pairIndex: number): Promise<{ status: string; pair_index: number }> {
  const key = partName.toLowerCase();

  if (isOfflineMode()) {
    return { status: "local-fallback", pair_index: pairIndex };
  }

  try {
    return await pyPost<{ status: string; pair_index: number }>(`/process-pair/${encodeURIComponent(key)}?pair_index=${pairIndex}`);
  } catch {
    return { status: "local-fallback", pair_index: pairIndex };
  }
}

/** Run multi-pair batch inspection for N captured image pairs. */
export async function runBatchTest(partName: string, count: number): Promise<RunBatchTestResult> {
  const key = partName.toLowerCase();

  if (isOfflineMode()) {
    const { batchResult } = await runLocalInspection(partName, count);
    return batchResult;
  }

  try {
    return await pyPost<RunBatchTestResult>(`/run-test-batch/${encodeURIComponent(key)}?count=${count}`);
  } catch {
    const { batchResult } = await runLocalInspection(partName, count);
    return batchResult;
  }
}


// ── Normalise helpers (for Supabase inserts) ──────────────────────────────

/** Convert MeasurementRow to the Supabase measurement_results shape. */
export function toSupabaseMeasurement(m: MeasurementRow) {
  const deviation = Number((m.measured - m.expected).toFixed(4));
  const paramName = m.pair_index ? `Pair #${m.pair_index} · ${m.parameter}` : m.parameter;
  return {
    parameter: paramName,
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
  const defectName = d.pair_index ? `Pair #${d.pair_index} · ${d.name} (${d.cam})` : `${d.name} (${d.cam})`;
  return {
    defect_name:     defectName,
    confidence:      d.confidence,
    annotated_image: null as string | null,
    status:          "reject" as const,
  };
}
