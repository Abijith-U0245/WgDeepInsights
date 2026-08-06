import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

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

export function useParts() {
  return useQuery({
    queryKey: ["parts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parts").select("*").order("part_name");
      if (error) throw error;
      return data as Part[];
    },
  });
}

export function useSpecifications(partId?: string) {
  return useQuery({
    queryKey: ["specifications", partId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("specifications").select("*").order("parameter");
      if (partId) q = q.eq("part_id", partId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Specification[];
    },
  });
}

export function useModels(partId?: string) {
  return useQuery({
    queryKey: ["models", partId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("models").select("*").order("model_name");
      if (partId) q = q.eq("part_id", partId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Model[];
    },
  });
}

export function useInspections() {
  return useQuery({
    queryKey: ["inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Inspection[];
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));
      return (profiles ?? []).map((p) => ({
        ...(p as { id: string; name: string; email: string; created_at: string }),
        role: roleMap.get(p.id) ?? "inspector",
      }));
    },
  });
}

export function useInspectionDetail(id: string) {
  return useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const [{ data: inspection, error }, measurements, defects, images] = await Promise.all([
        supabase.from("inspections").select("*").eq("id", id).maybeSingle(),
        supabase.from("measurement_results").select("*").eq("inspection_id", id),
        supabase.from("defect_results").select("*").eq("inspection_id", id),
        supabase.from("captured_images").select("*").eq("inspection_id", id),
      ]);
      if (error) throw error;
      return {
        inspection: inspection as Inspection | null,
        measurements: (measurements.data ?? []) as Array<{
          id: string;
          parameter: string;
          expected: number;
          actual: number;
          deviation: number;
          tolerance: number;
          unit: string;
          status: string;
        }>,
        defects: (defects.data ?? []) as Array<{
          id: string;
          defect_name: string;
          confidence: number;
          annotated_image: string | null;
          status: string;
        }>,
        images: (images.data ?? []) as Array<{
          id: string;
          image_type: string;
          image_url: string;
        }>,
      };
    },
  });
}
