import { useQuery } from "@tanstack/react-query";

import { readLocalCollection, writeLocalCollection } from "@/lib/offline-store";

export type Part = {
  id: string;
  part_name: string;
  description: string;
  reference_image: string | null;
  geometry_image: string | null;
  surface_reference: string | null;
  created_at: string;
};

export type Specification = {
  id: string;
  part_id: string;
  parameter: string;
  expected_value: number;
  tolerance: number;
  unit: string;
  notes: string;
};

export type Model = {
  id: string;
  model_name: string;
  part_id: string | null;
  model_type: string;
  model_path: string;
  version: string;
  status: string;
  uploaded_at: string;
};

export type Inspection = {
  id: string;
  inspection_number: string;
  inspector_id: string;
  part_id: string | null;
  model_id: string | null;
  inspection_date: string;
  inspection_time: string;
  shift: string;
  duration_seconds: number;
  area: string;
  status: string;
  remarks: string;
  report_url: string | null;
  created_at: string;
};

const FALLBACK_PARTS: Part[] = [
  { id: "part-1", part_name: "Capnut", description: "Hex cap nut", reference_image: null, geometry_image: null, surface_reference: null, created_at: new Date().toISOString() },
  { id: "part-2", part_name: "Stud", description: "Threaded stud", reference_image: null, geometry_image: null, surface_reference: null, created_at: new Date().toISOString() },
  { id: "part-3", part_name: "Adapter", description: "Hexagonal adapter", reference_image: null, geometry_image: null, surface_reference: null, created_at: new Date().toISOString() },
  { id: "part-4", part_name: "Pin", description: "Precision pin", reference_image: null, geometry_image: null, surface_reference: null, created_at: new Date().toISOString() },
];

const FALLBACK_MODELS: Model[] = [
  { id: "m-1", model_name: "Capnut Surface Defect", part_id: "part-1", model_type: "surface", model_path: "surface_models/Capnut_best.pt", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
  { id: "m-2", model_name: "Capnut Dimensional Measurement", part_id: "part-1", model_type: "measurement", model_path: "dim_models/Capnut_Measurement.py", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
  { id: "m-3", model_name: "Stud Surface Defect", part_id: "part-2", model_type: "surface", model_path: "surface_models/Stud_best.pt", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
  { id: "m-4", model_name: "Stud Dimensional Measurement", part_id: "part-2", model_type: "measurement", model_path: "dim_models/Stud_Measurement.py", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
  { id: "m-5", model_name: "Adapter Surface Defect", part_id: "part-3", model_type: "surface", model_path: "surface_models/Adaptor_best.pt", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
  { id: "m-6", model_name: "Adapter Dimensional Measurement", part_id: "part-3", model_type: "measurement", model_path: "dim_models/Adaptor_Measurement.py", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
  { id: "m-7", model_name: "Pin Surface Defect", part_id: "part-4", model_type: "surface", model_path: "surface_models/Pin_best.pt", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
  { id: "m-8", model_name: "Pin Dimensional Measurement", part_id: "part-4", model_type: "measurement", model_path: "dim_models/Pin_Measurement.py", version: "1.0", status: "active", uploaded_at: new Date().toISOString() },
];

const FALLBACK_SPECS: Specification[] = [
  // CAPNUT
  { id: "c1", part_id: "part-1", parameter: "OD - Across Flats (hex)", expected_value: 36, tolerance: 0, unit: "mm", notes: "+0 / -0.62" },
  { id: "c2", part_id: "part-1", parameter: "OD - Across Corners (hex max)", expected_value: 39, tolerance: 0, unit: "mm", notes: "" },
  { id: "c3", part_id: "part-1", parameter: "Overall Height", expected_value: 17.5, tolerance: 0, unit: "mm", notes: "+0 / -0.1" },
  { id: "c4", part_id: "part-1", parameter: "ID - Internal Thread", expected_value: 16, tolerance: 0, unit: "mm", notes: "M16 x 1.5 blind end" },
  { id: "c5", part_id: "part-1", parameter: "Bore Step Ø1", expected_value: 17.15, tolerance: 0.20, unit: "mm", notes: "" },
  { id: "c6", part_id: "part-1", parameter: "Bore Step Ø2", expected_value: 14.575, tolerance: 0.075, unit: "mm", notes: "" },
  { id: "c7", part_id: "part-1", parameter: "Bore Step Ø3", expected_value: 10.675, tolerance: 0.075, unit: "mm", notes: "" },
  { id: "c8", part_id: "part-1", parameter: "Bore Step Ø4 (thread minor)", expected_value: 9.575, tolerance: 0.075, unit: "mm", notes: "" },
  { id: "c9", part_id: "part-1", parameter: "Boss / Collar OD (Detail Y)", expected_value: 21.9, tolerance: 0, unit: "mm", notes: "" },
  { id: "c10", part_id: "part-1", parameter: "Boss / Collar ID (Detail Y)", expected_value: 7.8, tolerance: 0, unit: "mm", notes: "" },
  { id: "c11", part_id: "part-1", parameter: "Shoulder OD (Section G-G)", expected_value: 34.7, tolerance: 0, unit: "mm", notes: "" },
  { id: "c12", part_id: "part-1", parameter: "Male Thread Boss Diameter", expected_value: 25.40, tolerance: 0.05, unit: "mm", notes: "" },
  { id: "c13", part_id: "part-1", parameter: "Male Thread", expected_value: 28.57, tolerance: 0, unit: "mm", notes: "1-1/8\"-12 UNF" },
  { id: "c14", part_id: "part-1", parameter: "Small Hole Diameter", expected_value: 4.6, tolerance: 0, unit: "mm", notes: "" },
  // STUD
  { id: "s1", part_id: "part-2", parameter: "Overall Length", expected_value: 38.10, tolerance: 0.8, unit: "mm", notes: "" },
  { id: "s2", part_id: "part-2", parameter: "Metal-End Length", expected_value: 11.60, tolerance: 0.8, unit: "mm", notes: "" },
  { id: "s3", part_id: "part-2", parameter: "Nut-End Thread Length", expected_value: 19.30, tolerance: 0, unit: "mm", notes: "" },
  { id: "s4", part_id: "part-2", parameter: "Shank OD", expected_value: 7.90, tolerance: 0, unit: "mm", notes: "" },
  { id: "s5", part_id: "part-2", parameter: "Thread (both ends)", expected_value: 7.93, tolerance: 0, unit: "mm", notes: "5/16\"-18 UNC 2A" },
  // ADAPTER
  { id: "a1", part_id: "part-3", parameter: "OD - Across Flats (hex)", expected_value: 27.00, tolerance: 0, unit: "mm", notes: "Both sides" },
  { id: "a2", part_id: "part-3", parameter: "Bore / Pilot ID", expected_value: 19.70, tolerance: 0.1, unit: "mm", notes: "" },
  { id: "a3", part_id: "part-3", parameter: "Groove / Step Width", expected_value: 2.10, tolerance: 0.1, unit: "mm", notes: "" },
  { id: "a4", part_id: "part-3", parameter: "Thread (both sides)", expected_value: 22.00, tolerance: 0, unit: "mm", notes: "M22 x 1.5" },
  // PIN
  { id: "p1", part_id: "part-4", parameter: "OD (Outer Diameter ØA)", expected_value: 11.979, tolerance: 0.021, unit: "mm", notes: "" },
  { id: "p2", part_id: "part-4", parameter: "ID (Through-hole ØD - ×2)", expected_value: 3.20, tolerance: 0, unit: "mm", notes: "" },
  { id: "p3", part_id: "part-4", parameter: "Length (L, overall)", expected_value: 87.60, tolerance: 0.20, unit: "mm", notes: "" },
  { id: "p4", part_id: "part-4", parameter: "Length (C, hole centers)", expected_value: 81.20, tolerance: 0.20, unit: "mm", notes: "" },
  { id: "p5", part_id: "part-4", parameter: "Width/Chamfer (B)", expected_value: 3.20, tolerance: 0, unit: "mm", notes: "" },
];

function ensureSeededCollection<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  const data = readLocalCollection<T>(key, fallback);
  const hasData = Array.isArray(data) ? data.length > 0 : data !== null && data !== undefined;

  if (!hasData) {
    writeLocalCollection(key, fallback);
    return fallback;
  }

  return data;
}

export function useParts() {
  return useQuery({
    queryKey: ["parts"],
    queryFn: async () => {
      const data = ensureSeededCollection<Part[]>("parts", FALLBACK_PARTS);
      return data.length > 0 ? data : FALLBACK_PARTS;
    },
  });
}

export function useSpecifications(partId?: string, partName?: string) {
  return useQuery({
    queryKey: ["specifications", partId ?? "all", partName ?? "none"],
    queryFn: async () => {
      const data = ensureSeededCollection<Specification[]>("specifications", FALLBACK_SPECS);
      const filtered = partId ? data.filter((item) => item.part_id === partId) : data;

      if (filtered.length > 0) return filtered;
      if (!partName) return FALLBACK_SPECS;
      const normalizedName = partName.toLowerCase();
      const fallbackPart = FALLBACK_PARTS.find((p) => p.part_name.toLowerCase() === normalizedName);
      return fallbackPart ? FALLBACK_SPECS.filter((s) => s.part_id === fallbackPart.id) : FALLBACK_SPECS;
    },
  });
}

export function useModels(partId?: string, partName?: string) {
  return useQuery({
    queryKey: ["models", partId ?? "all", partName ?? "none"],
    queryFn: async () => {
      const data = ensureSeededCollection<Model[]>("models", FALLBACK_MODELS);
      const filtered = partId ? data.filter((item) => item.part_id === partId) : data;

      if (filtered.length > 0) return filtered;
      if (!partName) return FALLBACK_MODELS;
      const normalizedName = partName.toLowerCase();
      const fallbackPart = FALLBACK_PARTS.find((p) => p.part_name.toLowerCase() === normalizedName);
      return fallbackPart ? FALLBACK_MODELS.filter((m) => m.part_id === fallbackPart.id) : FALLBACK_MODELS;
    },
  });
}

export type DefectResult = {
  id: string;
  inspection_id: string;
  defect_name: string;
  confidence: number;
  annotated_image: string | null;
  status: string;
  created_at?: string;
};

export function useInspections() {
  return useQuery({
    queryKey: ["inspections"],
    queryFn: async () => {
      const data = readLocalCollection<Inspection[]>("inspections", []);
      return [...data].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
    },
  });
}

export function useAllDefectResults() {
  return useQuery({
    queryKey: ["defect_results_all"],
    queryFn: async () => {
      const data = readLocalCollection<DefectResult[]>("defect_results", []);
      return [...data].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    },
  });
}

export const FALLBACK_PROFILES = [
  { id: "manager-1", name: "Aarav Singh", email: "manager@wgtech.com", role: "inspection_manager", created_at: new Date().toISOString() },
  { id: "inspector-1", name: "Riya Patel", email: "inspector@wgtech.com", role: "inspector", created_at: new Date().toISOString() },
];

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const profiles = readLocalCollection<Array<{ id: string; name: string; email: string; created_at: string }>>("profiles", FALLBACK_PROFILES);
      const roles = readLocalCollection<Array<{ user_id: string; role: string }>>("user_roles", []);
      const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));

      if (profiles.length === 0) return FALLBACK_PROFILES;
      return profiles.map((p) => ({
        id: p.id,
        name: p.name || p.email.split("@")[0] || "Unnamed",
        email: p.email,
        created_at: p.created_at,
        role: roleMap.get(p.id) ?? "inspector",
      }));
    },
  });
}

export function useInspectionDetail(id: string) {
  return useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const inspections = readLocalCollection<Inspection[]>("inspections", []);
      const inspection = inspections.find((item) => item.id === id) ?? null;
      const measurements = readLocalCollection<Array<{ id: string; inspection_id: string; parameter: string; expected: number; actual: number; deviation: number; tolerance: number; unit: string; status: string }>>("measurement_results", []).filter((item) => item.inspection_id === id);
      const defects = readLocalCollection<Array<{ id: string; inspection_id: string; defect_name: string; confidence: number; annotated_image: string | null; status: string }>>("defect_results", []).filter((item) => item.inspection_id === id);
      const images = readLocalCollection<Array<{ id: string; inspection_id: string; image_type: string; image_url: string }>>("captured_images", []).filter((item) => item.inspection_id === id);

      return {
        inspection,
        measurements,
        defects,
        images,
      };
    },
  });
}
