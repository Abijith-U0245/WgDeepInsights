/**
 * Inspection API service layer.
 *
 * These endpoints are placeholders that will later be wired to the Python
 * inference services: measurement.py, surface_defect_model.pt and
 * report_generator.py. The contract below is the one those services must
 * implement; today the calls fall back to a deterministic local simulation so
 * the UI flow is fully usable.
 */

export type MeasurementRequest = {
  partId: string;
  modelId: string;
  images: string[];
  specifications: Array<{
    parameter: string;
    expected: number;
    tolerance: number;
    unit: string;
  }>;
};

export type MeasurementRow = {
  parameter: string;
  expected: number;
  actual: number;
  deviation: number;
  tolerance: number;
  unit: string;
  status: "pass" | "fail";
};

export type MeasurementResponse = {
  results: MeasurementRow[];
  status: "pass" | "fail";
  durationMs: number;
};

export type InspectRequest = {
  partId: string;
  modelId: string;
  images: string[];
};

export type DefectRow = {
  defectName: string;
  confidence: number;
  annotatedImage: string | null;
  status: "pass" | "reject";
};

export type InspectResponse = {
  defects: DefectRow[];
  status: "pass" | "reject";
  durationMs: number;
};

export type ReportRequest = { inspectionId: string };
export type ReportResponse = { reportUrl: string | null; generatedAt: string };

const API_BASE = "/api";

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  return (await res.json()) as TRes;
}

/** POST /api/measure — backed by measurement.py */
export async function runMeasurement(payload: MeasurementRequest): Promise<MeasurementResponse> {
  return post<MeasurementRequest, MeasurementResponse>("/measure", payload);
}

/** POST /api/inspect — backed by surface_defect_model.pt */
export async function runInspection(payload: InspectRequest): Promise<InspectResponse> {
  return post<InspectRequest, InspectResponse>("/inspect", payload);
}

/** POST /api/report — backed by report_generator.py */
export async function generateReport(payload: ReportRequest): Promise<ReportResponse> {
  return post<ReportRequest, ReportResponse>("/report", payload);
}
