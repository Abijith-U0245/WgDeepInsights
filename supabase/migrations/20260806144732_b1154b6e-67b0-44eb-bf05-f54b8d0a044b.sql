
CREATE POLICY "wg_files_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('reference-images','geometry-images','captured-images','annotated-images','reports'));

CREATE POLICY "wg_files_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('captured-images','annotated-images','reports') OR (bucket_id IN ('reference-images','geometry-images') AND public.is_manager()));

CREATE POLICY "wg_files_update" ON storage.objects FOR UPDATE TO authenticated
USING (owner = auth.uid() OR public.is_manager()) WITH CHECK (owner = auth.uid() OR public.is_manager());

CREATE POLICY "wg_files_delete" ON storage.objects FOR DELETE TO authenticated
USING (owner = auth.uid() OR public.is_manager());
