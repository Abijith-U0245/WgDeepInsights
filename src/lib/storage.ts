import { supabase } from "@/integrations/supabase/client";

export type Bucket =
  | "reference-images"
  | "geometry-images"
  | "captured-images"
  | "annotated-images"
  | "reports";

/** Stored value format: "bucket::path" so a signed URL can be minted on read. */
export function encodeRef(bucket: Bucket, path: string) {
  return `${bucket}::${path}`;
}

export function decodeRef(ref: string): { bucket: Bucket; path: string } | null {
  const [bucket, ...rest] = ref.split("::");
  if (!bucket || rest.length === 0) return null;
  return { bucket: bucket as Bucket, path: rest.join("::") };
}

export async function uploadFile(bucket: Bucket, file: File, prefix: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return encodeRef(bucket, path);
}

export async function signedUrl(ref: string | null | undefined) {
  if (!ref) return null;
  if (ref.startsWith("http")) return ref;
  const parsed = decodeRef(ref);
  if (!parsed) return null;
  const { data } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function signedUrls(refs: Array<string | null | undefined>) {
  return Promise.all(refs.map((r) => signedUrl(r)));
}
