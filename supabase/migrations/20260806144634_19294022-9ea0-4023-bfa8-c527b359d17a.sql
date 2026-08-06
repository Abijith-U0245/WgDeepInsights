
CREATE TYPE public.app_role AS ENUM ('inspection_manager','inspector');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'inspector',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'inspection_manager')
$$;

CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_manager());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_manager()) WITH CHECK (id = auth.uid() OR public.is_manager());
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_manager());

CREATE TABLE public.parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  reference_image text,
  geometry_image text,
  surface_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts TO authenticated;
GRANT ALL ON public.parts TO service_role;
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parts_read" ON public.parts FOR SELECT TO authenticated USING (true);
CREATE POLICY "parts_write" ON public.parts FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager());

CREATE TABLE public.specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  parameter text NOT NULL,
  expected_value numeric NOT NULL,
  tolerance numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'mm',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specifications TO authenticated;
GRANT ALL ON public.specifications TO service_role;
ALTER TABLE public.specifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "specs_read" ON public.specifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "specs_write" ON public.specifications FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager());

CREATE TABLE public.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  model_type text NOT NULL DEFAULT 'surface',
  model_path text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT 'v1.0',
  status text NOT NULL DEFAULT 'active',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.models TO authenticated;
GRANT ALL ON public.models TO service_role;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "models_read" ON public.models FOR SELECT TO authenticated USING (true);
CREATE POLICY "models_write" ON public.models FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager());

CREATE SEQUENCE public.inspection_seq START 1000;

CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_number text NOT NULL UNIQUE DEFAULT ('INS-' || to_char(now(),'YYYYMMDD') || '-' || nextval('public.inspection_seq')),
  inspector_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
  inspection_date date NOT NULL DEFAULT current_date,
  inspection_time time NOT NULL DEFAULT current_time,
  shift text NOT NULL DEFAULT 'A',
  duration_seconds integer NOT NULL DEFAULT 0,
  area text NOT NULL DEFAULT 'Production Block',
  status text NOT NULL DEFAULT 'pending',
  remarks text NOT NULL DEFAULT '',
  report_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insp_read" ON public.inspections FOR SELECT TO authenticated USING (inspector_id = auth.uid() OR public.is_manager());
CREATE POLICY "insp_insert" ON public.inspections FOR INSERT TO authenticated WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "insp_update" ON public.inspections FOR UPDATE TO authenticated USING (inspector_id = auth.uid() OR public.is_manager()) WITH CHECK (inspector_id = auth.uid() OR public.is_manager());
CREATE POLICY "insp_delete" ON public.inspections FOR DELETE TO authenticated USING (public.is_manager());

CREATE OR REPLACE FUNCTION public.owns_inspection(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = _id AND (i.inspector_id = auth.uid() OR public.is_manager()))
$$;

CREATE TABLE public.measurement_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  parameter text NOT NULL,
  expected numeric NOT NULL,
  actual numeric NOT NULL,
  deviation numeric NOT NULL DEFAULT 0,
  tolerance numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'mm',
  status text NOT NULL DEFAULT 'pass',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurement_results TO authenticated;
GRANT ALL ON public.measurement_results TO service_role;
ALTER TABLE public.measurement_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mr_all" ON public.measurement_results FOR ALL TO authenticated USING (public.owns_inspection(inspection_id)) WITH CHECK (public.owns_inspection(inspection_id));

CREATE TABLE public.defect_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  defect_name text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  annotated_image text,
  status text NOT NULL DEFAULT 'reject',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defect_results TO authenticated;
GRANT ALL ON public.defect_results TO service_role;
ALTER TABLE public.defect_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dr_all" ON public.defect_results FOR ALL TO authenticated USING (public.owns_inspection(inspection_id)) WITH CHECK (public.owns_inspection(inspection_id));

CREATE TABLE public.captured_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  image_type text NOT NULL DEFAULT 'measurement',
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.captured_images TO authenticated;
GRANT ALL ON public.captured_images TO service_role;
ALTER TABLE public.captured_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_all" ON public.captured_images FOR ALL TO authenticated USING (public.owns_inspection(inspection_id)) WITH CHECK (public.owns_inspection(inspection_id));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), COALESCE(NEW.email,''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'inspector'))
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.parts (part_name, description) VALUES
 ('Stud','M12 threaded stud, cold-forged carbon steel, zinc plated.'),
 ('Adapter','Hydraulic line adapter, machined brass, 1/2" BSP.'),
 ('CapNut','Hex cap nut, class 8 steel, thread M12x1.75.'),
 ('Pin','Precision dowel pin, hardened steel, h6 tolerance.');

INSERT INTO public.specifications (part_id, parameter, expected_value, tolerance, unit, notes)
SELECT p.id, s.parameter, s.expected_value, s.tolerance, 'mm', s.notes
FROM public.parts p
JOIN (VALUES
 ('Stud','Overall Length',68.00,0.20,'Measured shank end to shank end.'),
 ('Stud','Thread Diameter',12.00,0.05,'Major diameter over threads.'),
 ('Stud','Thread Pitch',1.75,0.02,'ISO metric coarse.'),
 ('Adapter','Body Length',42.50,0.15,'Flange face to hex face.'),
 ('Adapter','Bore Diameter',9.80,0.03,'Internal flow bore.'),
 ('CapNut','Across Flats',19.00,0.10,'Hex width.'),
 ('CapNut','Height',14.20,0.10,'Total nut height.'),
 ('Pin','Diameter',8.00,0.009,'h6 tolerance class.'),
 ('Pin','Length',40.00,0.10,'Chamfer to chamfer.')
) AS s(part_name, parameter, expected_value, tolerance, notes)
ON s.part_name = p.part_name;

INSERT INTO public.models (model_name, part_id, model_type, model_path, version, status)
SELECT m.model_name, p.id, m.model_type, m.model_path, m.version, m.status
FROM public.parts p
JOIN (VALUES
 ('Stud','stud_surface_v3','surface','models/surface_defect_model.pt','v3.1','active'),
 ('Stud','stud_measure_v2','measurement','models/measurement.py','v2.4','active'),
 ('Adapter','adapter_surface_v2','surface','models/surface_defect_model.pt','v2.0','active'),
 ('Adapter','adapter_measure_v1','measurement','models/measurement.py','v1.8','active'),
 ('CapNut','capnut_surface_v1','surface','models/surface_defect_model.pt','v1.5','active'),
 ('CapNut','capnut_measure_v1','measurement','models/measurement.py','v1.2','inactive'),
 ('Pin','pin_surface_v4','surface','models/surface_defect_model.pt','v4.0','active'),
 ('Pin','pin_measure_v3','measurement','models/measurement.py','v3.0','active')
) AS m(part_name, model_name, model_type, model_path, version, status)
ON m.part_name = p.part_name;
